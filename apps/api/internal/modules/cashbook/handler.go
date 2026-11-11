package cashbook

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
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

type Entry struct {
	ID          string    `json:"id"`
	StoreID     string    `json:"store_id"`
	Code        string    `json:"code"`
	Source      string    `json:"source"`
	Status      string    `json:"status"`
	Direction   string    `json:"direction"`
	Amount      int64     `json:"amount_vnd"`
	Method      string    `json:"method"`
	Category    string    `json:"category"`
	PayerGroup  string    `json:"payer_group"`
	Payer       string    `json:"payer"`
	Note        string    `json:"note"`
	OccurredAt  time.Time `json:"occurred_at"`
	Creator     string    `json:"creator"`
	Branch      string    `json:"branch"`
	InvoiceCode *string   `json:"invoice_code"`
	OrderID     *string   `json:"order_id"`
	Version     int64     `json:"version"`
}
type Summary struct {
	Opening int64 `json:"opening_vnd"`
	Income  int64 `json:"income_vnd"`
	Expense int64 `json:"expense_vnd"`
	Closing int64 `json:"closing_vnd"`
}
type Result struct {
	Items      []Entry          `json:"items"`
	Total      int64            `json:"total"`
	Summary    Summary          `json:"summary"`
	Pagination httpx.Pagination `json:"pagination"`
}
type Filter struct {
	httpx.ListQuery
	StoreID  *string `form:"store_id" binding:"omitempty,uuid"`
	Method   string  `form:"method" binding:"omitempty,oneof=cash bank"`
	Status   string  `form:"status" binding:"omitempty,oneof=pending posted"`
	DateFrom string  `form:"date_from"`
	DateTo   string  `form:"date_to"`
}
type Input struct {
	StoreID    string    `json:"store_id" binding:"required,uuid"`
	Direction  string    `json:"direction" binding:"required,oneof=in out"`
	Amount     int64     `json:"amount_vnd" binding:"min=1,max=9007199254740991"`
	Status     string    `json:"status" binding:"required,oneof=pending posted"`
	Method     string    `json:"method" binding:"required,oneof=cash bank"`
	Category   string    `json:"category" binding:"required,oneof=customer_receipt other_receipt purchase_expense operating_expense"`
	PayerGroup string    `json:"payer_group" binding:"required,oneof=customer supplier employee other"`
	Payer      string    `json:"payer" binding:"max=200"`
	Note       string    `json:"note" binding:"max=4000"`
	OccurredAt time.Time `json:"occurred_at" binding:"required"`
	Version    int64     `json:"version" binding:"min=0"`
}

func conflict(code, message string) error {
	return &httpx.PublicError{Status: 409, Code: code, Message: message}
}
func allowedStore(ctx context.Context, q *dbgen.Queries, who auth.Identity, store string) error {
	if who.Role == "cashier" && store != who.StoreID {
		return httpx.Missing()
	}
	rows, err := q.ListMembershipStores(ctx, dbgen.ListMembershipStoresParams{TenantID: who.TenantID, MembershipID: who.MembershipID})
	if err != nil {
		return err
	}
	for _, row := range rows {
		if row.ID == store {
			return nil
		}
	}
	return httpx.Missing()
}
func RegisterRoutes(api *gin.RouterGroup, pool *pgxpool.Pool) {
	routes := api.Group("/cashbook", auth.RequireRoles("owner", "manager", "cashier"))
	routes.GET("", func(c *gin.Context) {
		var f Filter
		if err := c.ShouldBindQuery(&f); err != nil {
			httpx.Fail(c, 400, "invalid_filter", "Invalid cashbook filters.")
			return
		}
		if f.Sort == "" {
			f.Sort = "occurred_at"
			if f.Direction == "" {
				f.Direction = "desc"
			}
		}
		if err := f.Normalize("code", "amount_vnd", "occurred_at"); err != nil {
			httpx.HandleError(c, err)
			return
		}
		from, until, err := httpx.BusinessDateRange(f.DateFrom, f.DateTo)
		if err != nil {
			httpx.HandleError(c, err)
			return
		}
		who, _ := auth.CurrentIdentity(c)
		if who.Role == "cashier" && f.StoreID == nil {
			f.StoreID = &who.StoreID
		}
		var membership pgtype.UUID
		_ = membership.Scan(who.MembershipID)
		var result Result
		err = database.WithTenantQueries(c.Request.Context(), pool, who.TenantID, func(q *dbgen.Queries, tenant pgtype.UUID) error {
			if f.StoreID != nil {
				if err := allowedStore(c.Request.Context(), q, who, *f.StoreID); err != nil {
					return err
				}
			}
			data, err := q.ReadCashbook(c.Request.Context(), dbgen.ReadCashbookParams{TenantID: tenant, MembershipID: membership, StoreID: httpx.OptionalUUID(f.StoreID), Method: f.Method, Status: f.Status, Search: f.Pattern(), DateFrom: from, DateUntil: until, Sort: f.Sort, Direction: f.Direction, PageLimit: f.PageSize, PageOffset: f.Offset()})
			if err != nil {
				return err
			}
			return json.Unmarshal(data, &result)
		})
		if err != nil {
			httpx.HandleError(c, err)
			return
		}
		for _, amount := range []int64{result.Summary.Opening, result.Summary.Income, result.Summary.Expense, result.Summary.Closing} {
			if amount > maxMoney || amount < -maxMoney {
				httpx.HandleError(c, httpx.Invalid("Narrow the cashbook monetary range."))
				return
			}
		}
		result.Pagination = f.Pagination(result.Total)
		httpx.Success(c, 200, result)
	})
	write := func(c *gin.Context) {
		var in Input
		if !httpx.BindJSON(c, &in) {
			return
		}
		if (in.Direction == "in") != (in.Category == "customer_receipt" || in.Category == "other_receipt") {
			httpx.HandleError(c, httpx.Invalid("Choose a category matching the voucher direction."))
			return
		}
		key := c.GetHeader("Idempotency-Key")
		if len(key) < 16 || len(key) > 100 || strings.IndexFunc(key, func(r rune) bool {
			return !(r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '-' || r == '_')
		}) >= 0 {
			httpx.Fail(c, 400, "invalid_idempotency_key", "Provide a valid Idempotency-Key.")
			return
		}
		id := ""
		if c.Request.Method == "PUT" {
			if _, ok := httpx.PathUUID(c); !ok {
				return
			}
			id = c.Param("id")
			if in.Version < 1 {
				httpx.HandleError(c, httpx.Invalid("A voucher version is required."))
				return
			}
		}
		who, _ := auth.CurrentIdentity(c)
		result := map[string]string{}
		err := database.WithTenantTx(c.Request.Context(), pool, who.TenantID, func(tx pgx.Tx) error {
			ctx := c.Request.Context()
			if err := allowedStore(ctx, dbgen.New(tx), who, in.StoreID); err != nil {
				return err
			}
			operation := "cashbook:create"
			if id != "" {
				operation = "cashbook:update:" + id
			}
			data, _ := json.Marshal(in)
			sum := sha256.Sum256(data)
			hash := hex.EncodeToString(sum[:])
			if _, err := tx.Exec(ctx, `INSERT INTO api_requests(tenant_id,store_id,operation,key,request_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`, who.TenantID, in.StoreID, operation, key, hash); err != nil {
				return err
			}
			var priorHash string
			var response []byte
			if err := tx.QueryRow(ctx, `SELECT request_hash,response FROM api_requests WHERE tenant_id=$1 AND store_id=$2 AND operation=$3 AND key=$4 FOR UPDATE`, who.TenantID, in.StoreID, operation, key).Scan(&priorHash, &response); err != nil {
				return err
			}
			if priorHash != hash {
				return conflict("state_conflict", "The request key was used for a different voucher.")
			}
			if response != nil {
				return json.Unmarshal(response, &result)
			}
			if id == "" {
				var number int64
				if err := tx.QueryRow(ctx, `INSERT INTO entity_counters(tenant_id,entity,value) VALUES($1,'cashbook',1) ON CONFLICT(tenant_id,entity) DO UPDATE SET value=entity_counters.value+1 RETURNING value`, who.TenantID).Scan(&number); err != nil {
					return err
				}
				prefix := "PT"
				if in.Direction == "out" {
					prefix = "PC"
				}
				code := fmt.Sprintf("%s%06d", prefix, number)
				if err := tx.QueryRow(ctx, `INSERT INTO cashbook_vouchers(tenant_id,store_id,code,direction,amount_vnd,status,method,category,payer_group,payer,note,occurred_at,created_by,idempotency_key,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id::text`, who.TenantID, in.StoreID, code, in.Direction, in.Amount, in.Status, in.Method, in.Category, in.PayerGroup, strings.TrimSpace(in.Payer), strings.TrimSpace(in.Note), in.OccurredAt, who.UserID, key, hash).Scan(&id); err != nil {
					return err
				}
			} else {
				var status string
				var version int64
				if err := tx.QueryRow(ctx, `SELECT status,version FROM cashbook_vouchers WHERE tenant_id=$1 AND store_id=$2 AND id=$3 AND deleted_at IS NULL FOR UPDATE`, who.TenantID, in.StoreID, id).Scan(&status, &version); err != nil {
					return err
				}
				if status == "posted" {
					return conflict("immutable_entry", "Posted vouchers cannot be edited.")
				}
				if version != in.Version {
					return conflict("state_conflict", "The voucher changed. Reload before saving.")
				}
				if _, err := tx.Exec(ctx, `UPDATE cashbook_vouchers SET direction=$4,amount_vnd=$5,status=$6,method=$7,category=$8,payer_group=$9,payer=$10,note=$11,occurred_at=$12,version=version+1,updated_at=now() WHERE tenant_id=$1 AND store_id=$2 AND id=$3`, who.TenantID, in.StoreID, id, in.Direction, in.Amount, in.Status, in.Method, in.Category, in.PayerGroup, strings.TrimSpace(in.Payer), strings.TrimSpace(in.Note), in.OccurredAt); err != nil {
					return err
				}
			}
			result = map[string]string{"id": id}
			encoded, _ := json.Marshal(result)
			_, err := tx.Exec(ctx, `UPDATE api_requests SET response=$5::jsonb WHERE tenant_id=$1 AND store_id=$2 AND operation=$3 AND key=$4`, who.TenantID, in.StoreID, operation, key, encoded)
			return err
		})
		if err != nil {
			httpx.HandleError(c, err)
			return
		}
		status := 200
		if c.Request.Method == "POST" {
			status = 201
		}
		httpx.Success(c, status, result)
	}
	routes.POST("", auth.RequireRoles("owner", "manager"), write)
	routes.PUT("/:id", auth.RequireRoles("owner", "manager"), write)
	routes.DELETE("/:id", auth.RequireRoles("owner", "manager"), func(c *gin.Context) {
		if _, ok := httpx.PathUUID(c); !ok {
			return
		}
		var filter struct {
			Version int64 `form:"version" binding:"required,min=1"`
		}
		if err := c.ShouldBindQuery(&filter); err != nil {
			httpx.Fail(c, 400, "invalid_filter", "Provide the voucher version.")
			return
		}
		who, _ := auth.CurrentIdentity(c)
		err := database.WithTenantTx(c.Request.Context(), pool, who.TenantID, func(tx pgx.Tx) error {
			ctx := c.Request.Context()
			var store, status string
			var version int64
			if err := tx.QueryRow(ctx, `SELECT store_id::text,status,version FROM cashbook_vouchers WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE`, who.TenantID, c.Param("id")).Scan(&store, &status, &version); err != nil {
				return err
			}
			if err := allowedStore(ctx, dbgen.New(tx), who, store); err != nil {
				return err
			}
			if status == "posted" {
				return conflict("immutable_entry", "Posted vouchers cannot be deleted.")
			}
			if version != filter.Version {
				return conflict("state_conflict", "The voucher changed.")
			}
			_, err := tx.Exec(ctx, `UPDATE cashbook_vouchers SET deleted_at=now(),updated_at=now(),version=version+1 WHERE tenant_id=$1 AND id=$2`, who.TenantID, c.Param("id"))
			return err
		})
		if err != nil {
			httpx.HandleError(c, err)
			return
		}
		httpx.Success(c, 200, gin.H{"deleted": true})
	})
}
