package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"net/http"
	"path/filepath"
	"testing"
	"time"

	cashapi "github.com/cngchis/FNB_SaaS/apps/api/internal/modules/cashbook"
	posapi "github.com/cngchis/FNB_SaaS/apps/api/internal/modules/pos"
)

func TestCashbook(t *testing.T) {
	f := moduleTestFixture(t)
	call := func(method, path, token, key string, body any, status int, out any) {
		t.Helper()
		data, _ := json.Marshal(body)
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
	call("POST", "/products", f.owner, "", map[string]any{"name": "Cash coffee", "product_type": "prepared", "price_vnd": 35000}, 201, &product)
	call("POST", "/customers", f.owner, "", map[string]any{"name": "Cashbook_% customer"}, 201, &customer)
	var order moduleEnvelope[posapi.Order]
	var payment moduleEnvelope[posapi.Payment]
	call("POST", "/pos/orders", f.cashier, "cashbook-order-0001", map[string]any{"customer_id": customer.Data.ID, "items": []any{map[string]any{"product_id": product.Data.ID, "quantity": 1}}}, 201, &order)
	path := "/pos/orders/" + order.Data.ID + "/payments"
	call("POST", path, f.cashier, "cashbook-payment-0001", map[string]any{"received_vnd": 5000}, 200, &payment)
	call("POST", path, f.cashier, "cashbook-payment-0001", map[string]any{"received_vnd": 5000}, 200, nil)
	call("POST", path, f.cashier, "cashbook-payment-0002", map[string]any{"received_vnd": 50000}, 200, &payment)
	if payment.Data.Change != 20000 {
		t.Fatal("wrong payment change")
	}
	when, _ := time.Parse(time.RFC3339, "2026-11-10T05:00:00Z")
	if _, err := f.admin.Exec(context.Background(), "UPDATE payments SET created_at=$2 WHERE order_id=$1", order.Data.ID, when); err != nil {
		t.Fatal(err)
	}
	create := func(direction, method, status, date string, amount int64) map[string]any {
		category := "other_receipt"
		if direction == "out" {
			category = "operating_expense"
		}
		return map[string]any{"store_id": f.store, "direction": direction, "method": method, "status": status, "amount_vnd": amount, "category": category, "payer_group": "other", "payer": "", "note": "Manual cashbook", "occurred_at": date, "version": 0}
	}
	var receipt, pending moduleEnvelope[map[string]string]
	opening := create("in", "cash", "posted", "2026-11-09T12:00:00+07:00", 100000)
	call("POST", "/cashbook", f.owner, "cashbook-opening-0001", opening, 201, &receipt)
	firstID := receipt.Data["id"]
	call("POST", "/cashbook", f.owner, "cashbook-opening-0001", opening, 201, &receipt)
	if firstID != receipt.Data["id"] {
		t.Fatal("voucher retry duplicated entry")
	}
	opening["amount_vnd"] = 100001
	call("POST", "/cashbook", f.owner, "cashbook-opening-0001", opening, 409, nil)
	call("POST", "/cashbook", f.owner, "cashbook-expense-0001", create("out", "cash", "posted", "2026-11-10T09:00:00+07:00", 20000), 201, nil)
	call("POST", "/cashbook", f.owner, "cashbook-bank-000001", create("in", "bank", "posted", "2026-11-10T09:00:00+07:00", 70000), 201, nil)
	draft := create("out", "cash", "pending", "2026-11-10T09:00:00+07:00", 9000)
	call("POST", "/cashbook", f.owner, "cashbook-pending-0001", draft, 201, &pending)
	var list moduleEnvelope[cashapi.Result]
	call("GET", "/cashbook?page_size=2", f.owner, "", nil, 200, &list)
	if list.Data.Total != 6 || list.Data.Pagination.TotalPages != 3 || len(list.Data.Items) != 2 || list.Data.Summary.Income != 205000 || list.Data.Summary.Expense != 20000 || list.Data.Summary.Closing != 185000 {
		t.Fatalf("incorrect full cashbook: %+v", list.Data)
	}
	period := "/cashbook?date_from=2026-11-10&date_to=2026-11-10"
	call("GET", period, f.owner, "", nil, 200, &list)
	if list.Data.Summary.Opening != 100000 || list.Data.Summary.Income != 105000 || list.Data.Summary.Expense != 20000 || list.Data.Summary.Closing != 185000 {
		t.Fatalf("incorrect period: %+v", list.Data.Summary)
	}
	call("GET", period+"&method=cash", f.owner, "", nil, 200, &list)
	if list.Data.Summary.Income != 35000 || list.Data.Summary.Closing != 115000 {
		t.Fatal("cash included change, pending entry or bank receipt")
	}
	call("GET", period+"&method=bank", f.owner, "", nil, 200, &list)
	if list.Data.Total != 1 || list.Data.Summary.Closing != 70000 {
		t.Fatal("bank filter failed")
	}
	call("GET", period+"&status=pending", f.owner, "", nil, 200, &list)
	if list.Data.Total != 1 || list.Data.Summary.Closing != 185000 {
		t.Fatal("status search changed actual balance")
	}
	call("GET", "/cashbook?search="+*payment.Data.Order.Invoice, f.owner, "", nil, 200, &list)
	if list.Data.Total != 2 || list.Data.Items[0].Code == list.Data.Items[1].Code || list.Data.Items[0].Creator == "—" || list.Data.Items[0].Source != "payment" {
		t.Fatal("payment projection duplicated or lost actor/source")
	}
	paymentID := list.Data.Items[0].ID
	branch := create("in", "bank", "posted", "2026-11-10T09:00:00+07:00", 5000)
	branch["store_id"] = f.otherStore
	call("POST", "/cashbook", f.otherStoreToken, "cashbook-branch-0001", branch, 201, nil)
	call("GET", period, f.owner, "", nil, 200, &list)
	if list.Data.Summary.Closing != 190000 {
		t.Fatal("owner did not see granted branches")
	}
	call("GET", period+"&store_id="+f.store, f.owner, "", nil, 200, &list)
	if list.Data.Summary.Closing != 185000 {
		t.Fatal("branch filter failed")
	}
	call("GET", period, f.cashier, "", nil, 200, &list)
	if list.Data.Summary.Closing != 185000 {
		t.Fatal("cashier saw another store")
	}
	call("GET", "/cashbook?store_id="+f.otherStore, f.cashier, "", nil, 404, nil)
	call("GET", "/cashbook", f.otherOwner, "", nil, 200, &list)
	if list.Data.Total != 0 || list.Data.Summary.Closing != 0 {
		t.Fatal("tenant data leak")
	}
	call("GET", "/cashbook?store_id="+f.store, f.otherOwner, "", nil, 404, nil)
	call("GET", "/cashbook", f.kitchen, "", nil, 403, nil)
	call("POST", "/cashbook", f.cashier, "cashbook-forbidden-1", draft, 403, nil)
	call("GET", "/cashbook?date_from=bad", f.owner, "", nil, 422, nil)
	call("GET", "/cashbook?method=unknown", f.owner, "", nil, 400, nil)
	call("GET", "/cashbook?sort=unsafe", f.owner, "", nil, 422, nil)
	call("PUT", "/cashbook/"+paymentID, f.owner, "cashbook-payment-edit", draft, 422, nil)
	call("DELETE", "/cashbook/"+paymentID+"?version=1", f.owner, "", nil, 404, nil)
	draft["version"] = 1
	draft["status"] = "posted"
	manualPath := "/cashbook/" + pending.Data["id"]
	call("PUT", manualPath, f.owner, "cashbook-post-000001", draft, 200, nil)
	call("PUT", manualPath, f.owner, "cashbook-post-000001", draft, 200, nil)
	call("PUT", manualPath, f.owner, "cashbook-post-000002", draft, 409, nil)
	call("DELETE", manualPath+"?version=2", f.owner, "", nil, 409, nil)
	draft["status"] = "pending"
	draft["version"] = 0
	call("POST", "/cashbook", f.owner, "cashbook-delete-0001", draft, 201, &pending)
	call("DELETE", "/cashbook/"+pending.Data["id"]+"?version=1", f.owner, "", nil, 200, nil)
	call("DELETE", "/cashbook/"+pending.Data["id"]+"?version=1", f.owner, "", nil, 404, nil)
	// A security-invoker view must not bypass underlying forced RLS without context.
	var count int
	if err := f.runtime.QueryRow(context.Background(), "SELECT count(*) FROM cashbook_entries").Scan(&count); err != nil || count != 0 {
		t.Fatalf("view bypassed RLS: %d %v", count, err)
	}
	// Exercise migration backfill with real historical payments, not just empty tables.
	db := stdlib.OpenDB(*f.admin.Config().ConnConfig)
	defer db.Close()
	migrations, err := filepath.Abs("../migrations")
	if err != nil {
		t.Fatal(err)
	}
	if err := goose.DownToContext(context.Background(), db, migrations, 3); err != nil {
		t.Fatal(err)
	}
	if err := goose.UpContext(context.Background(), db, migrations); err != nil {
		t.Fatal(err)
	}
	var total int64
	var codes, actors int
	if err := f.admin.QueryRow(context.Background(), "SELECT count(*),sum(amount_vnd)::bigint,count(DISTINCT receipt_code),count(created_by) FROM payments").Scan(&count, &total, &codes, &actors); err != nil || count != 2 || total != 35000 || codes != 2 || actors != 0 {
		t.Fatalf("historical backfill changed money or invented an actor: %d %d %d %d %v", count, total, codes, actors, err)
	}
	call("GET", "/cashbook", f.owner, "", nil, 200, &list)
	if list.Data.Total != 2 || list.Data.Summary.Income != 35000 {
		t.Fatal("historical payments were omitted or duplicated")
	}

}
