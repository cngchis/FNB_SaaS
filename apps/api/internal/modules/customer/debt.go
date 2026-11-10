package customer

import (
	"strconv"

	"github.com/cngchis/FNB_SaaS/apps/api/internal/database"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/dbgen"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/modules/auth"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/shared/httpx"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
)

func (h Handler) debt(c *gin.Context) {
	id, ok := httpx.PathUUID(c)
	if !ok {
		return
	}
	var filter struct {
		ExcludeOrderID *string `form:"exclude_order_id" binding:"omitempty,uuid"`
	}
	if err := c.ShouldBindQuery(&filter); err != nil {
		httpx.Fail(c, 400, "invalid_filter", "Provide a valid excluded order UUID.")
		return
	}
	who, _ := auth.CurrentIdentity(c)
	var store pgtype.UUID
	_ = store.Scan(who.StoreID)
	var amount int64
	err := database.WithTenantQueries(c.Request.Context(), h.service.Pool, who.TenantID, func(q *dbgen.Queries, tenant pgtype.UUID) error {
		row, err := q.GetCustomerDebt(c.Request.Context(), dbgen.GetCustomerDebtParams{TenantID: tenant, StoreID: store, ID: id, ExcludeOrderID: httpx.OptionalUUID(filter.ExcludeOrderID)})
		if err != nil {
			return err
		}
		amount, err = strconv.ParseInt(row.OutstandingVnd, 10, 64)
		if err != nil || amount < 0 || amount > 9007199254740991 {
			return httpx.Invalid("The outstanding balance exceeds the supported integer range.")
		}
		return nil
	})
	if err != nil {
		httpx.HandleError(c, err)
		return
	}
	httpx.Success(c, 200, gin.H{"customer_id": id, "outstanding_vnd": amount})
}
