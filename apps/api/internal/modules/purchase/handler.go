package purchase

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/cngchis/FNB_SaaS/apps/api/internal/database"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/dbgen"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/modules/auth"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/shared/httpx"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

const maxMoney int64 = 9007199254740991

var requestKey = regexp.MustCompile(`^[A-Za-z0-9._:-]{16,100}$`)

type Action struct {
	ID      string `json:"id"`
	Version int64  `json:"version"`
}
type Supplier struct {
	ID      string `json:"id"`
	Code    string `json:"code"`
	Name    string `json:"name"`
	Contact string `json:"contact"`
	Phone   string `json:"phone"`
	Address string `json:"address"`
	Note    string `json:"note"`
	Version int64  `json:"version"`
	Debt    int64  `json:"debt_vnd"`
}
type SupplierInput struct {
	Name    string `json:"name" binding:"required,max=200"`
	Contact string `json:"contact" binding:"max=200"`
	Phone   string `json:"phone" binding:"max=100"`
	Address string `json:"address" binding:"max=1000"`
	Note    string `json:"note" binding:"max=4000"`
	Version int64  `json:"version" binding:"min=0"`
}
type Item struct {
	ID        string `json:"id"`
	ProductID string `json:"product_id"`
	Name      string `json:"name"`
	SKU       string `json:"sku"`
	Unit      string `json:"unit"`
	Quantity  int64  `json:"quantity"`
	Cost      int64  `json:"cost_vnd"`
	Total     int64  `json:"total_vnd"`
}
type Receipt struct {
	ID         string     `json:"id"`
	Code       string     `json:"code"`
	Status     string     `json:"status"`
	Total      int64      `json:"total_vnd"`
	Note       string     `json:"note"`
	Version    int64      `json:"version"`
	SupplierID string     `json:"supplier_id"`
	Supplier   string     `json:"supplier"`
	Branch     string     `json:"branch"`
	Creator    string     `json:"creator"`
	CreatedAt  time.Time  `json:"created_at"`
	PostedAt   *time.Time `json:"posted_at"`
	Items      []Item     `json:"items"`
}
type Result struct {
	Items      []Receipt        `json:"items"`
	Total      int64            `json:"total"`
	Amount     int64            `json:"total_vnd"`
	DraftCount int64            `json:"draft_count"`
	Pagination httpx.Pagination `json:"pagination"`
}
type SupplierResult struct {
	Items      []Supplier       `json:"items"`
	Total      int64            `json:"total"`
	Debt       int64            `json:"debt_vnd"`
	Pagination httpx.Pagination `json:"pagination"`
}
type ItemInput struct {
	ProductID string `json:"product_id" binding:"required,uuid"`
	Quantity  int64  `json:"quantity" binding:"min=1,max=1000000000"`
	Cost      int64  `json:"cost_vnd" binding:"min=0,max=9007199254740991"`
}
type Input struct {
	SupplierID string      `json:"supplier_id" binding:"required,uuid"`
	Note       string      `json:"note" binding:"max=4000"`
	Version    int64       `json:"version" binding:"min=0"`
	Items      []ItemInput `json:"items" binding:"required,min=1,max=500,dive"`
}

func conflict(message string) error {
	return &httpx.PublicError{Status: 409, Code: "purchasing_conflict", Message: message}
}
func immutable() error {
	return &httpx.PublicError{Status: 409, Code: "posted_receipt", Message: "Posted receipts are immutable. Use an audited reversal workflow."}
}
func nextCode(ctx context.Context, tx pgx.Tx, tenant, entity, prefix string) (string, error) {
	var number int64
	err := tx.QueryRow(ctx, `INSERT INTO entity_counters(tenant_id,entity,value) VALUES($1,$2,1) ON CONFLICT(tenant_id,entity) DO UPDATE SET value=entity_counters.value+1 RETURNING value`, tenant, entity).Scan(&number)
	return fmt.Sprintf("%s%06d", prefix, number), err
}

// The request record, business change and response commit together. Failed requests
// roll back the key too; retries after an unknown commit replay the exact response.
func mutation(c *gin.Context, pool *pgxpool.Pool, operation string, input any, status int, work func(context.Context, pgx.Tx, auth.Identity) (Action, error)) {
	key := c.GetHeader("Idempotency-Key")
	if !requestKey.MatchString(key) {
		httpx.Fail(c, 400, "invalid_idempotency_key", "Provide an Idempotency-Key with 16 to 100 safe characters.")
		return
	}
	data, _ := json.Marshal(input)
	sum := sha256.Sum256(data)
	hash := hex.EncodeToString(sum[:])
	who, _ := auth.CurrentIdentity(c)
	var result Action
	err := database.WithTenantTx(c.Request.Context(), pool, who.TenantID, func(tx pgx.Tx) error {
		ctx := c.Request.Context()
		if _, err := tx.Exec(ctx, `INSERT INTO api_requests(tenant_id,store_id,operation,key,request_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`, who.TenantID, who.StoreID, operation, key, hash); err != nil {
			return err
		}
		var prior string
		var response []byte
		if err := tx.QueryRow(ctx, `SELECT request_hash,response FROM api_requests WHERE tenant_id=$1 AND store_id=$2 AND operation=$3 AND key=$4 FOR UPDATE`, who.TenantID, who.StoreID, operation, key).Scan(&prior, &response); err != nil {
			return err
		}
		if prior != hash {
			return conflict("The request key was used with a different payload.")
		}
		if response != nil {
			return json.Unmarshal(response, &result)
		}
		var err error
		result, err = work(ctx, tx, who)
		if err != nil {
			return err
		}
		encoded, _ := json.Marshal(result)
		_, err = tx.Exec(ctx, `UPDATE api_requests SET response=$5::jsonb WHERE tenant_id=$1 AND store_id=$2 AND operation=$3 AND key=$4`, who.TenantID, who.StoreID, operation, key, encoded)
		return err
	})
	if err != nil {
		httpx.HandleError(c, err)
		return
	}
	httpx.Success(c, status, result)
}
func parseID(c *gin.Context) (string, bool) {
	id, ok := httpx.PathUUID(c)
	if !ok {
		return "", false
	}
	return id.String(), true
}

func RegisterRoutes(api *gin.RouterGroup, pool *pgxpool.Pool) {
	routes := api.Group("", auth.RequireRoles("owner", "manager"))
	routes.GET("/suppliers", func(c *gin.Context) {
		var f httpx.ListQuery
		if err := c.ShouldBindQuery(&f); err != nil {
			httpx.Fail(c, 400, "invalid_filter", "Invalid supplier filters.")
			return
		}
		if err := f.Normalize("name", "debt_vnd"); err != nil {
			httpx.HandleError(c, err)
			return
		}
		who, _ := auth.CurrentIdentity(c)
		var store pgtype.UUID
		_ = store.Scan(who.StoreID)
		var result SupplierResult
		err := database.WithTenantQueries(c.Request.Context(), pool, who.TenantID, func(q *dbgen.Queries, t pgtype.UUID) error {
			data, err := q.ReadSuppliers(c.Request.Context(), dbgen.ReadSuppliersParams{TenantID: t, StoreID: store, Search: f.Pattern(), Sort: f.Sort, Direction: f.Direction, PageLimit: f.PageSize, PageOffset: f.Offset()})
			if err != nil {
				return err
			}
			return json.Unmarshal(data, &result)
		})
		if err != nil {
			httpx.HandleError(c, err)
			return
		}
		if result.Debt > maxMoney {
			httpx.HandleError(c, httpx.Invalid("Narrow the monetary range."))
			return
		}
		result.Pagination = f.Pagination(result.Total)
		httpx.Success(c, 200, result)
	})
	supplierWrite := func(c *gin.Context) {
		var in SupplierInput
		if !httpx.BindJSON(c, &in) {
			return
		}
		in.Name = strings.TrimSpace(in.Name)
		if in.Name == "" {
			httpx.HandleError(c, httpx.Invalid("Supplier name is required."))
			return
		}
		id := ""
		status := 201
		op := "supplier:create"
		if c.Request.Method == "PUT" {
			var ok bool
			id, ok = parseID(c)
			if !ok {
				return
			}
			op = "supplier:update:" + id
			status = 200
		}
		mutation(c, pool, op, in, status, func(ctx context.Context, tx pgx.Tx, who auth.Identity) (Action, error) {
			var result Action
			if id == "" {
				code, err := nextCode(ctx, tx, who.TenantID, "supplier", "NCC")
				if err != nil {
					return result, err
				}
				err = tx.QueryRow(ctx, `INSERT INTO suppliers(tenant_id,code,name,contact,phone,address,note) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id::text,version`, who.TenantID, code, in.Name, strings.TrimSpace(in.Contact), strings.TrimSpace(in.Phone), strings.TrimSpace(in.Address), strings.TrimSpace(in.Note)).Scan(&result.ID, &result.Version)
				return result, err
			}
			var version int64
			if err := tx.QueryRow(ctx, `SELECT version FROM suppliers WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE`, who.TenantID, id).Scan(&version); err != nil {
				return result, err
			}
			if in.Version != version {
				return result, conflict("The supplier changed. Reload before editing.")
			}
			err := tx.QueryRow(ctx, `UPDATE suppliers SET name=$3,contact=$4,phone=$5,address=$6,note=$7,version=version+1,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id::text,version`, who.TenantID, id, in.Name, strings.TrimSpace(in.Contact), strings.TrimSpace(in.Phone), strings.TrimSpace(in.Address), strings.TrimSpace(in.Note)).Scan(&result.ID, &result.Version)
			return result, err
		})
	}
	routes.POST("/suppliers", supplierWrite)
	routes.PUT("/suppliers/:id", supplierWrite)
	routes.DELETE("/suppliers/:id", func(c *gin.Context) {
		id, ok := parseID(c)
		if !ok {
			return
		}
		var f struct {
			Version int64 `form:"version" binding:"required,min=1"`
		}
		if err := c.ShouldBindQuery(&f); err != nil {
			httpx.Fail(c, 400, "invalid_filter", "Provide the supplier version.")
			return
		}
		who, _ := auth.CurrentIdentity(c)
		err := database.WithTenantTx(c.Request.Context(), pool, who.TenantID, func(tx pgx.Tx) error {
			ctx := c.Request.Context()
			var version int64
			if err := tx.QueryRow(ctx, `SELECT version FROM suppliers WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE`, who.TenantID, id).Scan(&version); err != nil {
				return err
			}
			if version != f.Version {
				return conflict("The supplier changed.")
			}
			var used bool
			if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM purchase_receipts WHERE tenant_id=$1 AND supplier_id=$2)`, who.TenantID, id).Scan(&used); err != nil {
				return err
			}
			if used {
				return &httpx.PublicError{Status: 409, Code: "supplier_in_use", Message: "The supplier is referenced by purchase receipts."}
			}
			_, err := tx.Exec(ctx, `UPDATE suppliers SET deleted_at=now(),updated_at=now(),version=version+1 WHERE tenant_id=$1 AND id=$2`, who.TenantID, id)
			return err
		})
		if err != nil {
			httpx.HandleError(c, err)
			return
		}
		httpx.Success(c, 200, gin.H{"deleted": true})
	})
	read := func(c *gin.Context) {
		var f httpx.ListQuery
		if err := c.ShouldBindQuery(&f); err != nil {
			httpx.Fail(c, 400, "invalid_filter", "Invalid purchase filters.")
			return
		}
		if f.Sort == "" {
			f.Sort = "created_at"
		}
		if f.Direction == "" {
			f.Direction = "desc"
		}
		if err := f.Normalize("created_at"); err != nil {
			httpx.HandleError(c, err)
			return
		}
		var id, store pgtype.UUID
		if c.Param("id") != "" {
			var ok bool
			id, ok = httpx.PathUUID(c)
			if !ok {
				return
			}
		}
		who, _ := auth.CurrentIdentity(c)
		_ = store.Scan(who.StoreID)
		var result Result
		err := database.WithTenantQueries(c.Request.Context(), pool, who.TenantID, func(q *dbgen.Queries, t pgtype.UUID) error {
			data, err := q.ReadPurchases(c.Request.Context(), dbgen.ReadPurchasesParams{TenantID: t, StoreID: store, ID: id, Search: f.Pattern(), Direction: f.Direction, PageLimit: f.PageSize, PageOffset: f.Offset()})
			if err != nil {
				return err
			}
			return json.Unmarshal(data, &result)
		})
		if err != nil {
			httpx.HandleError(c, err)
			return
		}
		if result.Amount > maxMoney {
			httpx.HandleError(c, httpx.Invalid("Narrow the monetary range."))
			return
		}
		if id.Valid {
			if len(result.Items) == 0 {
				httpx.HandleError(c, httpx.Missing())
				return
			}
			httpx.Success(c, 200, result.Items[0])
			return
		}
		result.Pagination = f.Pagination(result.Total)
		httpx.Success(c, 200, result)
	}
	routes.GET("/purchases", read)
	routes.GET("/purchases/:id", read)
	write := func(c *gin.Context) {
		var in Input
		if !httpx.BindJSON(c, &in) {
			return
		}
		if err := validateItems(in.Items); err != nil {
			httpx.HandleError(c, err)
			return
		}
		id := ""
		op := "purchase:create"
		status := 201
		if c.Request.Method == "PUT" {
			var ok bool
			id, ok = parseID(c)
			if !ok {
				return
			}
			op = "purchase:update:" + id
			status = 200
		}
		mutation(c, pool, op, in, status, func(ctx context.Context, tx pgx.Tx, who auth.Identity) (Action, error) {
			return save(ctx, tx, who, id, in)
		})
	}
	routes.POST("/purchases", write)
	routes.PUT("/purchases/:id", write)
	routes.POST("/purchases/:id/post", func(c *gin.Context) {
		id, ok := parseID(c)
		if !ok {
			return
		}
		var in struct {
			Version int64 `json:"version" binding:"min=1"`
		}
		if !httpx.BindJSON(c, &in) {
			return
		}
		mutation(c, pool, "purchase:post:"+id, in, 200, func(ctx context.Context, tx pgx.Tx, who auth.Identity) (Action, error) {
			return post(ctx, tx, who, id, in.Version)
		})
	})
	routes.GET("/inventory/balances", func(c *gin.Context) {
		var f httpx.ListQuery
		if err := c.ShouldBindQuery(&f); err != nil {
			httpx.Fail(c, 400, "invalid_filter", "Invalid stock filters.")
			return
		}
		if err := f.Normalize("name"); err != nil {
			httpx.HandleError(c, err)
			return
		}
		who, _ := auth.CurrentIdentity(c)
		var store pgtype.UUID
		_ = store.Scan(who.StoreID)
		var rows []dbgen.ReadStockBalancesRow
		err := database.WithTenantQueries(c.Request.Context(), pool, who.TenantID, func(q *dbgen.Queries, t pgtype.UUID) error {
			var err error
			rows, err = q.ReadStockBalances(c.Request.Context(), dbgen.ReadStockBalancesParams{TenantID: t, StoreID: store, Search: f.Pattern(), PageLimit: f.PageSize, PageOffset: f.Offset()})
			return err
		})
		if err != nil {
			httpx.HandleError(c, err)
			return
		}
		httpx.Success(c, 200, gin.H{"items": rows})
	})
	routes.GET("/inventory/movements", func(c *gin.Context) {
		var f struct {
			httpx.ListQuery
			ProductID *string `form:"product_id" binding:"omitempty,uuid"`
		}
		if err := c.ShouldBindQuery(&f); err != nil {
			httpx.Fail(c, 400, "invalid_filter", "Invalid movement filters.")
			return
		}
		if err := f.Normalize("name"); err != nil {
			httpx.HandleError(c, err)
			return
		}
		who, _ := auth.CurrentIdentity(c)
		var store, product pgtype.UUID
		_ = store.Scan(who.StoreID)
		if f.ProductID != nil {
			_ = product.Scan(*f.ProductID)
		}
		var rows []dbgen.ReadStockMovementsRow
		err := database.WithTenantQueries(c.Request.Context(), pool, who.TenantID, func(q *dbgen.Queries, t pgtype.UUID) error {
			var err error
			rows, err = q.ReadStockMovements(c.Request.Context(), dbgen.ReadStockMovementsParams{TenantID: t, StoreID: store, ProductID: product, PageLimit: f.PageSize, PageOffset: f.Offset()})
			return err
		})
		if err != nil {
			httpx.HandleError(c, err)
			return
		}
		httpx.Success(c, 200, gin.H{"items": rows})
	})
}
