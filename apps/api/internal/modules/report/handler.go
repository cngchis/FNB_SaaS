package report

import (
	"bytes"
	"encoding/json"
	"math/big"
	"time"

	"github.com/cngchis/FNB_SaaS/apps/api/internal/database"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/dbgen"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/modules/auth"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/shared/httpx"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Filter struct {
	From        string `form:"date_from" binding:"required"`
	To          string `form:"date_to" binding:"required"`
	Granularity string `form:"granularity" binding:"required,oneof=hour day"`
}

// Normalize exact SQL numeric values to JSON integers without passing through floats.
func normalizeNumbers(value any) (any, bool) {
	switch v := value.(type) {
	case json.Number:
		exact, ok := new(big.Rat).SetString(string(v))
		if !ok || !exact.IsInt() {
			return nil, false
		}
		if new(big.Int).Abs(exact.Num()).Cmp(big.NewInt(9007199254740991)) > 0 {
			return nil, false
		}
		return exact.Num().Int64(), true
	case []any:
		for index, child := range v {
			normalized, ok := normalizeNumbers(child)
			if !ok {
				return nil, false
			}
			v[index] = normalized
		}
	case map[string]any:
		for key, child := range v {
			normalized, ok := normalizeNumbers(child)
			if !ok {
				return nil, false
			}
			v[key] = normalized
		}
	case nil, string, bool:
		return value, true
	default:
		return nil, false
	}
	return value, true
}

func RegisterRoutes(api *gin.RouterGroup, pool *pgxpool.Pool) {
	api.GET("/reports/summary", auth.RequireRoles("owner", "manager", "cashier"), func(c *gin.Context) {
		var filter Filter
		if err := c.ShouldBindQuery(&filter); err != nil {
			httpx.Fail(c, 400, "invalid_filter", "Dates and hour/day granularity are required.")
			return
		}
		from, until, err := httpx.BusinessDateRange(filter.From, filter.To)
		if err != nil {
			httpx.HandleError(c, err)
			return
		}
		maxDays := 366
		if filter.Granularity == "hour" {
			maxDays = 1
		}
		if until.Time.Sub(from.Time) > time.Duration(maxDays)*24*time.Hour {
			httpx.HandleError(c, httpx.Invalid("Narrow the reporting period."))
			return
		}
		who, _ := auth.CurrentIdentity(c)
		var store pgtype.UUID
		_ = store.Scan(who.StoreID)
		var result any
		err = database.WithTenantQueries(c.Request.Context(), pool, who.TenantID, func(q *dbgen.Queries, tenant pgtype.UUID) error {
			payload, err := q.ReadReport(c.Request.Context(), dbgen.ReadReportParams{TenantID: tenant, StoreID: store, DateFrom: from, DateUntil: until, Granularity: filter.Granularity})
			if err != nil {
				return err
			}
			decoder := json.NewDecoder(bytes.NewReader(payload))
			decoder.UseNumber()
			return decoder.Decode(&result)
		})
		if err != nil {
			httpx.HandleError(c, err)
			return
		}
		normalized, ok := normalizeNumbers(result)
		if !ok {
			httpx.HandleError(c, httpx.Invalid("The selected monetary range is too large. Narrow the filters."))
			return
		}
		httpx.Success(c, 200, normalized)
	})
}
