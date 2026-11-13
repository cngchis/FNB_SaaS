package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"testing"

	posapi "github.com/cngchis/FNB_SaaS/apps/api/internal/modules/pos"
)

type reportResult struct {
	Summary struct {
		InvoiceCount int64  `json:"invoice_count"`
		Revenue      int64  `json:"revenue_vnd"`
		Discount     int64  `json:"discount_vnd"`
		Paid         int64  `json:"paid_vnd"`
		Debt         int64  `json:"debt_vnd"`
		Cost         *int64 `json:"cost_vnd"`
		Profit       *int64 `json:"profit_vnd"`
	} `json:"summary"`
	Payments []struct {
		Amount int64 `json:"amount_vnd"`
	} `json:"payments"`
	Series []struct {
		Revenue int64  `json:"revenue_vnd"`
		Cost    *int64 `json:"cost_vnd"`
		Count   int64  `json:"payment_count"`
	} `json:"series"`
	Groups []struct {
		Revenue int64 `json:"revenue_vnd"`
	} `json:"groups"`
	Flow struct {
		Income int64 `json:"income_vnd"`
	} `json:"flow"`
}

func TestReportsReadModel(t *testing.T) {
	f := moduleTestFixture(t)
	call := func(method, path, token, key string, body any, status int, out any) {
		t.Helper()
		data, _ := json.Marshal(body)
		req, _ := http.NewRequest(method, f.base+"/api/v1"+path, bytes.NewReader(data))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+token)
		if key != "" {
			req.Header.Set("Idempotency-Key", key)
		}
		response, err := f.client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		if response.StatusCode != status {
			var failure any
			_ = json.NewDecoder(response.Body).Decode(&failure)
			t.Fatalf("%s %s got %d want %d: %v", method, path, response.StatusCode, status, failure)
		}
		if out != nil {
			if err := json.NewDecoder(response.Body).Decode(out); err != nil {
				t.Fatal(err)
			}
		}
	}
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := f.admin.Exec(context.Background(), sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	var goods, prepared moduleEnvelope[catalogRecord]
	call("POST", "/products", f.owner, "", map[string]any{"name": "Report goods", "product_type": "goods", "price_vnd": 10000, "cost_vnd": 4000}, 201, &goods)
	call("POST", "/products", f.owner, "", map[string]any{"name": "Report prepared", "product_type": "prepared", "price_vnd": 5000}, 201, &prepared)
	var first, second, draft moduleEnvelope[posapi.Order]
	var payment moduleEnvelope[posapi.Payment]
	call("POST", "/pos/orders", f.cashier, "report-order-00001", map[string]any{"discount_vnd": 1001, "items": []any{map[string]any{"product_id": goods.Data.ID, "quantity": 2}, map[string]any{"product_id": prepared.Data.ID, "quantity": 1}}}, 201, &first)
	path := "/pos/orders/" + first.Data.ID + "/payments"
	call("POST", path, f.cashier, "report-payment-0001", map[string]any{"received_vnd": 5000}, 200, &payment)
	call("POST", path, f.cashier, "report-payment-0001", map[string]any{"received_vnd": 5000}, 200, nil)
	call("POST", path, f.cashier, "report-payment-0002", map[string]any{"received_vnd": 50000}, 200, &payment)
	if payment.Data.Change != 31001 {
		t.Fatal("wrong change")
	}
	call("POST", "/pos/orders", f.cashier, "report-order-00002", map[string]any{"discount_vnd": 1000, "items": []any{map[string]any{"product_id": goods.Data.ID, "quantity": 3}}}, 201, &second)
	call("POST", "/pos/orders/"+second.Data.ID+"/payments", f.cashier, "report-payment-0003", map[string]any{"received_vnd": 10000}, 200, nil)
	call("POST", "/pos/orders", f.cashier, "report-draft-00001", map[string]any{"items": []any{map[string]any{"product_id": goods.Data.ID, "quantity": 1}}}, 201, &draft)
	exec("UPDATE invoices SET created_at='2026-11-09T17:00:00Z' WHERE order_id=$1", first.Data.ID)
	exec("UPDATE invoices SET created_at='2026-11-10T16:59:59Z' WHERE order_id=$1", second.Data.ID)
	exec("UPDATE payments SET created_at='2026-11-11T02:00:00Z' WHERE order_id=$1", first.Data.ID)
	exec("UPDATE payments SET created_at='2026-11-10T16:59:59Z' WHERE order_id=$1", second.Data.ID)
	// Historical costs come from item snapshots, not the changed catalog.
	exec("UPDATE products SET cost_vnd=9999 WHERE id=$1", goods.Data.ID)
	query := "/reports/summary?date_from=2026-11-10&date_to=2026-11-10&granularity=hour"
	var result moduleEnvelope[reportResult]
	call("GET", query, f.owner, "", nil, 200, &result)
	s := result.Data.Summary
	if s.InvoiceCount != 2 || s.Revenue != 52999 || s.Discount != 2001 || s.Paid != 33999 || s.Debt != 19000 || s.Cost != nil || s.Profit != nil {
		t.Fatalf("wrong invoice totals: %+v", s)
	}
	if len(result.Data.Series) != 24 || result.Data.Series[0].Revenue != 23999 || result.Data.Series[23].Revenue != 29000 || result.Data.Series[0].Cost != nil || result.Data.Series[23].Cost == nil || *result.Data.Series[23].Cost != 12000 {
		t.Fatalf("wrong time buckets/costs: %+v", result.Data.Series)
	}
	if len(result.Data.Payments) != 1 || result.Data.Payments[0].Amount != 10000 || result.Data.Flow.Income != 10000 {
		t.Fatal("cash settlement used invoice time or change")
	}
	var grouped int64
	for _, group := range result.Data.Groups {
		grouped += group.Revenue
	}
	if grouped != s.Revenue {
		t.Fatal("allocated discounts do not reconcile")
	}
	call("GET", "/reports/summary?date_from=2026-11-11&date_to=2026-11-11&granularity=hour", f.cashier, "", nil, 200, &result)
	if result.Data.Summary.Revenue != 0 || len(result.Data.Payments) != 1 || result.Data.Payments[0].Amount != 23999 || result.Data.Flow.Income != 23999 {
		t.Fatal("multiple settlements double counted or used tendered amount")
	}
	call("GET", query, f.otherOwner, "", nil, 200, &result)
	if result.Data.Summary.InvoiceCount != 0 {
		t.Fatal("cross tenant report leakage")
	}
	call("GET", query, f.otherStoreToken, "", nil, 200, &result)
	if result.Data.Summary.InvoiceCount != 0 {
		t.Fatal("cross store report leakage")
	}
	call("GET", query, f.kitchen, "", nil, 403, nil)
	call("GET", "/reports/summary?date_from=2026-02-30&date_to=2026-03-01&granularity=day", f.owner, "", nil, 422, nil)
	call("GET", "/reports/summary?date_from=2026-11-10&date_to=2026-11-11&granularity=hour", f.owner, "", nil, 422, nil)
	call("GET", "/reports/summary?date_from=2024-01-01&date_to=2026-11-11&granularity=day", f.owner, "", nil, 422, nil)
	call("GET", "/reports/summary", f.owner, "", nil, 400, nil)
	// A complete-cost period must expose actual profit; unknown is never coerced to zero.
	call("GET", "/reports/summary?date_from=2026-11-10&date_to=2026-11-10&granularity=day", f.owner, "", nil, 200, nil)
	exec("UPDATE invoices SET created_at='2026-11-10T17:00:00Z' WHERE order_id=$1", first.Data.ID)
	call("GET", query, f.owner, "", nil, 200, &result)
	if result.Data.Summary.Revenue != 29000 || result.Data.Summary.Cost == nil || *result.Data.Summary.Cost != 12000 || result.Data.Summary.Profit == nil || *result.Data.Summary.Profit != 17000 {
		t.Fatalf("boundary/cost snapshot: %+v", result.Data.Summary)
	}
	exec("UPDATE order_items SET unit_cost_vnd=9007199254740991 WHERE order_id=$1", second.Data.ID)
	call("GET", query, f.owner, "", nil, 422, nil)
}
