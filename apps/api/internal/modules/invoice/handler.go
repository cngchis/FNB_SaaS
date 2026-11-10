package invoice

import (
	"encoding/json"
	"time"

	"github.com/cngchis/FNB_SaaS/apps/api/internal/database"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/dbgen"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/modules/auth"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/shared/httpx"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Item struct {
	ProductID  string `json:"product_id"`
	Name       string `json:"name"`
	SKU        string `json:"sku"`
	Quantity   int64  `json:"quantity"`
	Unit       string `json:"unit"`
	Attributes []struct {
		Name  string `json:"name"`
		Value string `json:"value"`
	} `json:"attributes"`
	Price  int64 `json:"price_vnd"`
	Amount int64 `json:"amount_vnd"`
}
type Record struct {
	ID        string    `json:"id"`
	Code      string    `json:"code"`
	OrderID   string    `json:"order_id"`
	OrderCode string    `json:"order_code"`
	IssuedAt  time.Time `json:"issued_at"`
	ArrivedAt time.Time `json:"arrived_at"`
	Subtotal  int64     `json:"subtotal_vnd"`
	Discount  int64     `json:"discount_vnd"`
	Total     int64     `json:"total_vnd"`
	Paid      int64     `json:"paid_vnd"`
	Room      string    `json:"room"`
	Customer  string    `json:"customer"`
	Branch    string    `json:"branch"`
	Creator   string    `json:"creator"`
	Status    string    `json:"status"`
	Items     []Item    `json:"items"`
}
type Summary struct {
	Count       int64 `json:"count"`
	TodayCount  int64 `json:"today_count"`
	Total       int64 `json:"total_vnd"`
	UnpaidCount int64 `json:"unpaid_count"`
	Unpaid      int64 `json:"unpaid_vnd"`
}
type Result struct {
	Items      []Record         `json:"items"`
	Summary    Summary          `json:"summary"`
	Pagination httpx.Pagination `json:"pagination"`
}
type Filter struct {
	httpx.ListQuery
	Status   string `form:"status" binding:"omitempty,oneof=paid unpaid cancelled"`
	DateFrom string `form:"date_from"`
	DateTo   string `form:"date_to"`
}

// Local business dates are inclusive; SQL uses an exclusive next-day boundary.
func dateRange(from, to string) (pgtype.Timestamptz, pgtype.Timestamptz, error) {
	var start, until pgtype.Timestamptz
	zone := time.FixedZone("Asia/Ho_Chi_Minh", 7*60*60)
	if from != "" {
		value, err := time.ParseInLocation("2006-01-02", from, zone)
		if err != nil {
			return start, until, httpx.Invalid("Use YYYY-MM-DD dates.")
		}
		start = pgtype.Timestamptz{Time: value, Valid: true}
	}
	if to != "" {
		value, err := time.ParseInLocation("2006-01-02", to, zone)
		if err != nil {
			return start, until, httpx.Invalid("Use YYYY-MM-DD dates.")
		}
		until = pgtype.Timestamptz{Time: value.AddDate(0, 0, 1), Valid: true}
	}
	if start.Valid && until.Valid && !start.Time.Before(until.Time) {
		return start, until, httpx.Invalid("The start date must not exceed the end date.")
	}
	return start, until, nil
}
func RegisterRoutes(api *gin.RouterGroup, pool *pgxpool.Pool) {
	routes := api.Group("/invoices", auth.RequireRoles("owner", "manager", "cashier"))
	read := func(c *gin.Context) {
		var filter Filter
		if err := c.ShouldBindQuery(&filter); err != nil {
			httpx.Fail(c, 400, "invalid_filter", "Invalid invoice filters.")
			return
		}
		if filter.Sort == "" {
			filter.Sort = "arrived_at"
			if filter.Direction == "" {
				filter.Direction = "desc"
			}
		}
		if err := filter.Normalize("code", "order_code", "room", "customer", "subtotal_vnd", "total_vnd", "paid_vnd", "arrived_at", "status"); err != nil {
			httpx.HandleError(c, err)
			return
		}
		from, until, err := dateRange(filter.DateFrom, filter.DateTo)
		if err != nil {
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
			filter.Page = 1
			filter.PageSize = 1
		}
		who, _ := auth.CurrentIdentity(c)
		var store pgtype.UUID
		_ = store.Scan(who.StoreID)
		var result Result
		err = database.WithTenantQueries(c.Request.Context(), pool, who.TenantID, func(q *dbgen.Queries, tenant pgtype.UUID) error {
			data, err := q.ReadInvoices(c.Request.Context(), dbgen.ReadInvoicesParams{TenantID: tenant, StoreID: store, ID: id, Search: filter.Pattern(), DateFrom: from, DateUntil: until, Status: filter.Status, Sort: filter.Sort, Direction: filter.Direction, PageLimit: filter.PageSize, PageOffset: filter.Offset()})
			if err != nil {
				return err
			}
			return json.Unmarshal(data, &result)
		})
		if err != nil {
			httpx.HandleError(c, err)
			return
		}
		// The browser cannot represent integers above this bound exactly.
		if result.Summary.Total > 9007199254740991 || result.Summary.Unpaid > 9007199254740991 {
			httpx.HandleError(c, httpx.Invalid("The selected monetary range is too large. Narrow the filters."))
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
		result.Pagination = filter.Pagination(result.Summary.Count)
		httpx.Success(c, 200, result)
	}
	routes.GET("", read)
	routes.GET("/:id", read)
}
