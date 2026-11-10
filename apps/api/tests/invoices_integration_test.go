package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"testing"

	invoiceapi "github.com/cngchis/FNB_SaaS/apps/api/internal/modules/invoice"
	posapi "github.com/cngchis/FNB_SaaS/apps/api/internal/modules/pos"
)

func TestInvoicesReadModel(t *testing.T) {
	f := moduleTestFixture(t)
	call := func(method, path, token, key string, body any, status int, out any) {
		t.Helper()
		data, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		req, err := http.NewRequest(method, f.base+"/api/v1"+path, bytes.NewReader(data))
		if err != nil {
			t.Fatal(err)
		}
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
	var product, customer moduleEnvelope[catalogRecord]
	call("POST", "/products", f.owner, "", map[string]any{"name": "Invoice coffee", "product_type": "prepared", "price_vnd": 10000}, 201, &product)
	call("POST", "/customers", f.owner, "", map[string]any{"name": "Invoice_% customer"}, 201, &customer)
	var firstID string
	for i := 0; i < 8; i++ {
		var order moduleEnvelope[posapi.Order]
		var paid moduleEnvelope[posapi.Payment]
		body := map[string]any{"customer_id": customer.Data.ID, "discount_vnd": 1000, "items": []any{map[string]any{"product_id": product.Data.ID, "quantity": 2}}}
		call("POST", "/pos/orders", f.cashier, fmt.Sprintf("invoice-order-%04d", i), body, 201, &order)
		received := 19000
		if i == 0 {
			received = 5000
		}
		call("POST", "/pos/orders/"+order.Data.ID+"/payments", f.cashier, fmt.Sprintf("invoice-payment-%04d", i), map[string]any{"received_vnd": received}, 200, &paid)
		// Two boundary records must be excluded from the local 10 November range.
		arrived := "2026-11-10T05:00:00Z"
		if i == 0 {
			arrived = "2026-11-09T17:00:00Z"
		}
		if i == 6 {
			arrived = "2026-11-10T16:59:59Z"
		}
		if i == 7 {
			arrived = "2026-11-10T17:00:00Z"
		}
		if _, err := f.admin.Exec(context.Background(), "UPDATE orders SET created_at=$2 WHERE id=$1", order.Data.ID, arrived); err != nil {
			t.Fatal(err)
		}
	}
	// Unsaved/estimated orders are not issued invoices.
	call("POST", "/pos/orders", f.cashier, "invoice-draft-00001", map[string]any{"items": []any{map[string]any{"product_id": product.Data.ID, "quantity": 1}}}, 201, nil)
	var list moduleEnvelope[invoiceapi.Result]
	call("GET", "/invoices?page_size=2&sort=code&direction=asc", f.owner, "", nil, 200, &list)
	if list.Data.Pagination.Total != 8 || list.Data.Pagination.TotalPages != 4 || len(list.Data.Items) != 2 || list.Data.Summary.Total != 152000 || list.Data.Summary.UnpaidCount != 1 || list.Data.Summary.Unpaid != 14000 {
		t.Fatalf("incorrect read model: %+v", list.Data)
	}
	firstID = list.Data.Items[0].ID
	if len(list.Data.Items[0].Items) != 1 || list.Data.Items[0].Items[0].Quantity != 2 || list.Data.Items[0].Discount != 1000 || list.Data.Items[0].Creator == "—" {
		t.Fatal("lost normalized items/creator/discount")
	}
	firstCode := list.Data.Items[0].Code
	call("GET", "/invoices?page_size=2&page=2&sort=code&direction=asc", f.cashier, "", nil, 200, &list)
	if len(list.Data.Items) != 2 || list.Data.Items[0].Code <= firstCode {
		t.Fatal("unstable pagination")
	}
	call("GET", "/invoices?search="+url.QueryEscape("_%")+"&status=unpaid", f.owner, "", nil, 200, &list)
	if list.Data.Pagination.Total != 1 || list.Data.Items[0].Paid != 5000 {
		t.Fatal("literal customer search or partial status filter failed")
	}
	call("GET", "/invoices?status=paid&sort=paid_vnd&direction=desc", f.owner, "", nil, 200, &list)
	if list.Data.Pagination.Total != 7 || list.Data.Summary.Unpaid != 0 {
		t.Fatal("paid status/metrics mismatch")
	}
	call("GET", "/invoices?date_from=2026-11-10&date_to=2026-11-10", f.owner, "", nil, 200, &list)
	if list.Data.Pagination.Total != 7 {
		t.Fatalf("local date boundaries: got %d want 7", list.Data.Pagination.Total)
	}
	call("GET", "/invoices?date_from=2026-11-11&date_to=2026-11-10", f.owner, "", nil, 422, nil)
	call("GET", "/invoices?date_from=2026-02-30", f.owner, "", nil, 422, nil)
	call("GET", "/invoices?status=unknown", f.owner, "", nil, 400, nil)
	call("GET", "/invoices?sort=unsafe", f.owner, "", nil, 422, nil)
	call("GET", "/invoices?page_size=101", f.owner, "", nil, 400, nil)
	call("GET", "/invoices?status=cancelled", f.owner, "", nil, 200, &list)
	if list.Data.Summary.Count != 0 || len(list.Data.Items) != 0 {
		t.Fatal("empty list is not empty")
	}
	call("GET", "/invoices/"+firstID, f.cashier, "", nil, 200, nil)
	call("GET", "/invoices/"+firstID, f.otherOwner, "", nil, 404, nil)
	call("GET", "/invoices/"+firstID, f.otherStoreToken, "", nil, 404, nil)
	for _, token := range []string{f.otherOwner, f.otherStoreToken} {
		call("GET", "/invoices", token, "", nil, 200, &list)
		if list.Data.Pagination.Total != 0 || list.Data.Summary.Total != 0 {
			t.Fatal("cross-tenant/store invoice leak")
		}
	}
	call("GET", "/invoices", f.kitchen, "", nil, 403, nil)
	call("GET", "/invoices/not-a-uuid", f.owner, "", nil, 400, nil)
	call("POST", "/invoices", f.owner, "", map[string]any{}, 404, nil)
	call("PUT", "/invoices/"+firstID, f.owner, "", map[string]any{"total_vnd": 1}, 404, nil)
	call("DELETE", "/invoices/"+firstID, f.owner, "", nil, 404, nil)
}
