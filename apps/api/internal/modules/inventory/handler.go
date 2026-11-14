package inventory

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/database"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/dbgen"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/modules/auth"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/shared/httpx"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"regexp"
	"strings"
)

func uuid(s string) pgtype.UUID { var id pgtype.UUID; _ = id.Scan(s); return id }

var keyPattern = regexp.MustCompile(`^[A-Za-z0-9._:-]{16,100}$`)

func mutation(c *gin.Context, pool *pgxpool.Pool, op string, in any, status int, work func(context.Context, pgx.Tx, auth.Identity) (Action, error)) {
	key := c.GetHeader("Idempotency-Key")
	if !keyPattern.MatchString(key) {
		httpx.Fail(c, 400, "invalid_idempotency_key", "Provide an Idempotency-Key with 16 to 100 safe characters.")
		return
	}
	data, _ := json.Marshal(in)
	sum := sha256.Sum256(data)
	hash := hex.EncodeToString(sum[:])
	who, _ := auth.CurrentIdentity(c)
	var result Action
	err := database.WithTenantTx(c.Request.Context(), pool, who.TenantID, func(tx pgx.Tx) error {
		ctx := c.Request.Context()
		if _, err := tx.Exec(ctx, `INSERT INTO api_requests(tenant_id,store_id,operation,key,request_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`, who.TenantID, who.StoreID, op, key, hash); err != nil {
			return err
		}
		var prior string
		var response []byte
		if err := tx.QueryRow(ctx, `SELECT request_hash,response FROM api_requests WHERE tenant_id=$1 AND store_id=$2 AND operation=$3 AND key=$4 FOR UPDATE`, who.TenantID, who.StoreID, op, key).Scan(&prior, &response); err != nil {
			return err
		}
		if prior != hash {
			return conflict("Request key payload changed.")
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
		_, err = tx.Exec(ctx, `UPDATE api_requests SET response=$5::jsonb WHERE tenant_id=$1 AND store_id=$2 AND operation=$3 AND key=$4`, who.TenantID, who.StoreID, op, key, encoded)
		return err
	})
	if err != nil {
		httpx.HandleError(c, err)
		return
	}
	httpx.Success(c, status, result)
}
func RegisterRoutes(api *gin.RouterGroup, pool *pgxpool.Pool) {
	read := api.Group("/inventory", auth.RequireRoles("owner", "manager", "cashier", "kitchen"))
	read.GET("/quantities", func(c *gin.Context) {
		who, _ := auth.CurrentIdentity(c)
		ids := []pgtype.UUID{}
		for _, raw := range strings.Split(c.Query("product_ids"), ",") {
			var id pgtype.UUID
			if err := id.Scan(raw); err != nil || !id.Valid || len(ids) >= 100 {
				httpx.Fail(c, 400, "invalid_filter", "Provide 1 to 100 product UUIDs.")
				return
			}
			ids = append(ids, id)
		}
		var result json.RawMessage
		err := database.WithTenantQueries(c.Request.Context(), pool, who.TenantID, func(q *dbgen.Queries, t pgtype.UUID) error {
			var err error
			result, err = q.InventoryQuantities(c.Request.Context(), dbgen.InventoryQuantitiesParams{TenantID: t, StoreID: uuid(who.StoreID), ProductIds: ids})
			return err
		})
		if err != nil {
			httpx.HandleError(c, err)
			return
		}
		httpx.Success(c, 200, result)
	})
	read.GET("/summary", func(c *gin.Context) {
		who, _ := auth.CurrentIdentity(c)
		var result json.RawMessage
		err := database.WithTenantQueries(c.Request.Context(), pool, who.TenantID, func(q *dbgen.Queries, t pgtype.UUID) error {
			var err error
			result, err = q.InventorySummary(c.Request.Context(), dbgen.InventorySummaryParams{TenantID: t, StoreID: uuid(who.StoreID)})
			return err
		})
		if err != nil {
			httpx.HandleError(c, err)
			return
		}
		httpx.Success(c, 200, result)
	})
	routes := api.Group("/stocktakes", auth.RequireRoles("owner", "manager"))
	list := func(c *gin.Context) {
		var f httpx.ListQuery
		if err := c.ShouldBindQuery(&f); err != nil {
			httpx.Fail(c, 400, "invalid_filter", "Invalid stocktake filters.")
			return
		}
		if f.Sort == "" {
			f.Sort = "created_at"
		}
		if err := f.Normalize("created_at"); err != nil {
			httpx.HandleError(c, err)
			return
		}
		var id pgtype.UUID
		if c.Param("id") != "" {
			var ok bool
			id, ok = httpx.PathUUID(c)
			if !ok {
				return
			}
		}
		who, _ := auth.CurrentIdentity(c)
		var result struct {
			Items      []Stocktake      `json:"items"`
			Total      int64            `json:"total"`
			Pagination httpx.Pagination `json:"pagination"`
		}
		err := database.WithTenantQueries(c.Request.Context(), pool, who.TenantID, func(q *dbgen.Queries, t pgtype.UUID) error {
			data, err := q.ReadStocktakes(c.Request.Context(), dbgen.ReadStocktakesParams{TenantID: t, StoreID: uuid(who.StoreID), ID: id, PageLimit: f.PageSize, PageOffset: f.Offset()})
			if err != nil {
				return err
			}
			return json.Unmarshal(data, &result)
		})
		if err != nil {
			httpx.HandleError(c, err)
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
	routes.GET("", list)
	routes.GET("/:id", list)
	write := func(c *gin.Context) {
		var in Input
		if !httpx.BindJSON(c, &in) {
			return
		}
		id := ""
		status := 201
		op := "stocktake:create"
		if c.Request.Method == "PUT" {
			parsed, ok := httpx.PathUUID(c)
			if !ok {
				return
			}
			id = parsed.String()
			status = 200
			op = "stocktake:update:" + id
		}
		mutation(c, pool, op, in, status, func(ctx context.Context, tx pgx.Tx, who auth.Identity) (Action, error) {
			return save(ctx, tx, who, id, in)
		})
	}
	routes.POST("", write)
	routes.PUT("/:id", write)
	routes.POST("/:id/post", func(c *gin.Context) {
		parsed, ok := httpx.PathUUID(c)
		if !ok {
			return
		}
		id := parsed.String()
		var in struct {
			Version int64 `json:"version" binding:"min=1"`
		}
		if !httpx.BindJSON(c, &in) {
			return
		}
		mutation(c, pool, "stocktake:post:"+id, in, 200, func(ctx context.Context, tx pgx.Tx, who auth.Identity) (Action, error) {
			return post(ctx, tx, who, id, in.Version)
		})
	})
	// Existing Save action can atomically create and confirm without a new UI button.
	routes.POST("/confirm", func(c *gin.Context) {
		var in Input
		if !httpx.BindJSON(c, &in) {
			return
		}
		mutation(c, pool, "stocktake:confirm", in, 201, func(ctx context.Context, tx pgx.Tx, who auth.Identity) (Action, error) {
			draft, err := save(ctx, tx, who, "", in)
			if err != nil {
				return draft, err
			}
			return post(ctx, tx, who, draft.ID, draft.Version)
		})
	})
}
