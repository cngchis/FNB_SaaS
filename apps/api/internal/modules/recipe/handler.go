package recipe

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"regexp"

	"github.com/cngchis/FNB_SaaS/apps/api/internal/database"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/modules/auth"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/shared/httpx"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var requestKey = regexp.MustCompile(`^[A-Za-z0-9._:-]{16,100}$`)

func RegisterRoutes(api *gin.RouterGroup, pool *pgxpool.Pool) {
	api.GET("/products/:id/recipes", func(c *gin.Context) {
		id, ok := httpx.PathUUID(c)
		if !ok {
			return
		}
		who, _ := auth.CurrentIdentity(c)
		result := []Recipe{}
		err := database.WithTenantTx(c.Request.Context(), pool, who.TenantID, func(tx pgx.Tx) error {
			var exists string
			if err := tx.QueryRow(c.Request.Context(), `SELECT id::text FROM products WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL FOR SHARE`, who.TenantID, id).Scan(&exists); err != nil {
				return err
			}
			var err error
			result, err = read(c.Request.Context(), tx, who.TenantID, exists)
			return err
		})
		if err != nil {
			httpx.HandleError(c, err)
			return
		}
		httpx.Success(c, 200, result)
	})
	api.PUT("/products/:id/recipes", auth.RequireRoles("owner", "manager"), func(c *gin.Context) {
		_, ok := httpx.PathUUID(c)
		if !ok {
			return
		}
		var in Input
		if !httpx.BindJSON(c, &in) {
			return
		}
		if err := in.Normalize(); err != nil {
			httpx.HandleError(c, err)
			return
		}
		key := c.GetHeader("Idempotency-Key")
		if !requestKey.MatchString(key) {
			httpx.Fail(c, 400, "invalid_idempotency_key", "Provide an Idempotency-Key with 16 to 100 safe characters.")
			return
		}
		who, _ := auth.CurrentIdentity(c)
		data, _ := json.Marshal(in)
		sum := sha256.Sum256(data)
		hash := hex.EncodeToString(sum[:])
		operation := "recipe:save:" + c.Param("id")
		var result Recipe
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
				return conflict("The request key was used with another payload.")
			}
			if response != nil {
				return json.Unmarshal(response, &result)
			}
			var err error
			result, err = save(ctx, tx, who.TenantID, c.Param("id"), in)
			if err != nil {
				return err
			}
			response, _ = json.Marshal(result)
			_, err = tx.Exec(ctx, `UPDATE api_requests SET response=$5::jsonb WHERE tenant_id=$1 AND store_id=$2 AND operation=$3 AND key=$4`, who.TenantID, who.StoreID, operation, key, response)
			return err
		})
		if err != nil {
			httpx.HandleError(c, err)
			return
		}
		httpx.Success(c, 200, result)
	})
}
