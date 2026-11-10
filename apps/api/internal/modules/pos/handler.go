package pos

import (
	"github.com/cngchis/FNB_SaaS/apps/api/internal/database"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/modules/auth"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/shared/httpx"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func RegisterRoutes(api *gin.RouterGroup, pool *pgxpool.Pool) {
	routes := api.Group("/pos", auth.RequireRoles("owner", "manager", "cashier"))
	routes.GET("/orders", func(c *gin.Context) {
		var filter struct {
			httpx.ListQuery
			State string `form:"state" binding:"omitempty,oneof=open history all"`
		}
		if err := c.ShouldBindQuery(&filter); err != nil {
			httpx.Fail(c, 400, "invalid_filter", "Invalid list filters.")
			return
		}
		if err := filter.Normalize("name", "created_at"); err != nil {
			httpx.HandleError(c, err)
			return
		}
		if filter.State == "" {
			filter.State = "open"
		}
		who, _ := auth.CurrentIdentity(c)
		var items []Order
		var total int64
		err := database.WithTenantTx(c.Request.Context(), pool, who.TenantID, func(tx pgx.Tx) error {
			err := tx.QueryRow(c.Request.Context(), `SELECT count(*) FROM orders o WHERE o.tenant_id=$1 AND o.store_id=$2 AND o.deleted_at IS NULL AND ($3='all' OR ($3='open' AND o.status IN ('open','estimated','pending_payment')) OR ($3='history' AND EXISTS(SELECT 1 FROM invoices i WHERE i.tenant_id=o.tenant_id AND i.store_id=o.store_id AND i.order_id=o.id)))`, who.TenantID, who.StoreID, filter.State).Scan(&total)
			if err != nil {
				return err
			}
			items, err = readOrders(c.Request.Context(), tx, who, nil, filter.State, filter.PageSize, filter.Offset())
			return err
		})
		if err != nil {
			httpx.HandleError(c, err)
			return
		}
		httpx.Success(c, 200, gin.H{"items": items, "pagination": filter.Pagination(total)})
	})
	routes.GET("/orders/:id", func(c *gin.Context) {
		if _, ok := httpx.PathUUID(c); !ok {
			return
		}
		who, _ := auth.CurrentIdentity(c)
		var result Order
		err := database.WithTenantTx(c.Request.Context(), pool, who.TenantID, func(tx pgx.Tx) error {
			var err error
			result, err = readOne(c.Request.Context(), tx, who, c.Param("id"))
			return err
		})
		if err != nil {
			httpx.HandleError(c, err)
			return
		}
		httpx.Success(c, 200, result)
	})
	save := func(c *gin.Context) {
		var id *string
		if c.Request.Method == "PUT" {
			if _, ok := httpx.PathUUID(c); !ok {
				return
			}
			value := c.Param("id")
			id = &value
		}
		key := c.GetHeader("Idempotency-Key")
		if !validKey(key) {
			httpx.Fail(c, 400, "invalid_idempotency_key", "Provide an Idempotency-Key with 16 to 100 safe characters.")
			return
		}
		var input Input
		if !httpx.BindJSON(c, &input) {
			return
		}
		if id != nil && input.Version < 1 {
			httpx.HandleError(c, httpx.Invalid("An order revision is required."))
			return
		}
		who, _ := auth.CurrentIdentity(c)
		var result Order
		err := database.WithTenantTx(c.Request.Context(), pool, who.TenantID, func(tx pgx.Tx) error {
			var err error
			result, err = saveOrder(c.Request.Context(), tx, who, id, input, key)
			return err
		})
		if err != nil {
			httpx.HandleError(c, err)
			return
		}
		status := 200
		if id == nil {
			status = 201
		}
		httpx.Success(c, status, result)
	}
	routes.POST("/orders", save)
	routes.PUT("/orders/:id", save)
	routes.POST("/orders/:id/payments", func(c *gin.Context) {
		if _, ok := httpx.PathUUID(c); !ok {
			return
		}
		key := c.GetHeader("Idempotency-Key")
		if !validKey(key) {
			httpx.Fail(c, 400, "invalid_idempotency_key", "Provide a valid Idempotency-Key.")
			return
		}
		var input struct {
			Received int64 `json:"received_vnd" binding:"min=0,max=9007199254740991"`
		}
		if !httpx.BindJSON(c, &input) {
			return
		}
		who, _ := auth.CurrentIdentity(c)
		var result Payment
		err := database.WithTenantTx(c.Request.Context(), pool, who.TenantID, func(tx pgx.Tx) error {
			var err error
			result, err = payCash(c.Request.Context(), tx, who, c.Param("id"), key, input.Received)
			return err
		})
		if err != nil {
			httpx.HandleError(c, err)
			return
		}
		httpx.Success(c, 200, result)
	})
}
