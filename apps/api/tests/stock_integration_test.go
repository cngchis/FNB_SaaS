package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/database"
	inventoryapi "github.com/cngchis/FNB_SaaS/apps/api/internal/modules/inventory"
	posapi "github.com/cngchis/FNB_SaaS/apps/api/internal/modules/pos"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"net/http"
	"sync"
	"testing"
)

func countTestStock(t *testing.T, f moduleFixture, product, quantity string) {
	t.Helper()
	body, _ := json.Marshal(map[string]any{"items": []any{map[string]any{"product_id": product, "counted_quantity": quantity, "balance_version": 0}}})
	req, _ := http.NewRequest("POST", f.base+"/api/v1/stocktakes/confirm", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+f.owner)
	req.Header.Set("Idempotency-Key", "opening-count-"+product)
	response, err := f.client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != 201 {
		var failure any
		_ = json.NewDecoder(response.Body).Decode(&failure)
		t.Fatalf("opening count: %d %v", response.StatusCode, failure)
	}
}
func TestInventorySalesAndStocktakes(t *testing.T) {
	f := moduleTestFixture(t)
	ctx := context.Background()
	call := func(method, path, token, key string, body any, status int, out any) {
		t.Helper()
		data, _ := json.Marshal(body)
		req, _ := http.NewRequest(method, f.base+"/api/v1"+path, bytes.NewReader(data))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Idempotency-Key", key)
		r, err := f.client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer r.Body.Close()
		if r.StatusCode != status {
			var failure any
			_ = json.NewDecoder(r.Body).Decode(&failure)
			t.Fatalf("%s %s: got %d want %d: %v", method, path, r.StatusCode, status, failure)
		}
		if out != nil {
			if err = json.NewDecoder(r.Body).Decode(out); err != nil {
				t.Fatal(err)
			}
		}
	}
	var goods moduleEnvelope[catalogRecord]
	body := map[string]any{"name": "Bia kho", "product_type": "goods", "base_unit": "Lon", "price_vnd": 10000, "units": []any{map[string]any{"name": "Thùng", "ratio": "24", "price_vnd": 200000}}}
	call("POST", "/products", f.owner, "", body, 201, &goods)
	product := goods.Data.ID
	balance := func() (string, int64) {
		t.Helper()
		var quantity string
		var version int64
		err := f.admin.QueryRow(ctx, `SELECT quantity::text,version FROM stock_balances WHERE tenant_id=$1 AND store_id=$2 AND product_id=$3`, f.tenant, f.store, product).Scan(&quantity, &version)
		if err != nil {
			t.Fatal(err)
		}
		return quantity, version
	}
	order := func(qty int, unit, key string) posapi.Order {
		t.Helper()
		var result moduleEnvelope[posapi.Order]
		call("POST", "/pos/orders", f.cashier, key, map[string]any{"items": []any{map[string]any{"product_id": product, "quantity": qty, "unit": unit}}}, 201, &result)
		return result.Data
	}
	pay := func(o posapi.Order, key string, amount int, status int) {
		t.Helper()
		call("POST", "/pos/orders/"+o.ID+"/payments", f.cashier, key, map[string]any{"received_vnd": amount}, status, nil)
	}
	// No stock: the whole payment transaction is rejected without issuing an invoice.
	empty := order(1, "", "empty-stock-order1")
	pay(empty, "empty-stock-pay001", 10000, 409)
	var count int
	_ = f.admin.QueryRow(ctx, `SELECT count(*) FROM invoices WHERE order_id=$1`, empty.ID).Scan(&count)
	if count != 0 {
		t.Fatal("rejected sale issued invoice")
	}
	countTestStock(t, f, product, "49")
	pack := order(2, "Thùng", "pack-stock-order01")
	// Later catalog conversion edits must not rewrite the order's base quantity.
	body["units"] = []any{map[string]any{"name": "Thùng", "ratio": "48", "price_vnd": 200000}}
	call("PUT", "/products/"+product, f.owner, "", body, 200, nil)
	pay(pack, "pack-stock-pay0001", 1000, 200)
	if q, _ := balance(); q != "1.000000" {
		t.Fatalf("snapshot ratio lost: %s", q)
	}
	pay(pack, "pack-stock-pay0001", 1000, 200)
	if q, _ := balance(); q != "1.000000" {
		t.Fatal("payment replay deducted twice")
	}
	// Increasing an issued invoice checks only its additional demand, atomically.
	var current moduleEnvelope[posapi.Order]
	call("GET", "/pos/orders/"+pack.ID, f.cashier, "", nil, 200, &current)
	update := map[string]any{"version": current.Data.Version, "items": []any{map[string]any{"product_id": product, "quantity": 3, "unit": "Thùng"}}}
	call("PUT", "/pos/orders/"+pack.ID, f.cashier, "stock-increase-fail", update, 409, nil)
	if q, _ := balance(); q != "1.000000" {
		t.Fatal("failed edit changed balance")
	}
	update["items"] = []any{map[string]any{"product_id": product, "quantity": 1, "unit": "Thùng"}}
	call("PUT", "/pos/orders/"+pack.ID, f.cashier, "stock-reduce-00001", update, 200, &current)
	if q, _ := balance(); q != "25.000000" {
		t.Fatal("reduction did not return stock")
	}
	pay(current.Data, "pack-stock-final01", 300000, 200)
	if q, _ := balance(); q != "25.000000" {
		t.Fatal("debt collection deducted stock again")
	}
	// Draft counts detect an ABA stock change using balance versions.
	_, version := balance()
	countBody := map[string]any{"items": []any{map[string]any{"product_id": product, "counted_quantity": "2", "balance_version": version}}}
	var draft moduleEnvelope[inventoryapi.Action]
	call("POST", "/stocktakes", f.owner, "stocktake-draft001", countBody, 201, &draft)
	small := order(1, "", "stock-small-order1")
	pay(small, "stock-small-pay001", 10000, 200)
	call("POST", "/stocktakes/"+draft.Data.ID+"/post", f.owner, "stocktake-stale001", map[string]any{"version": draft.Data.Version}, 409, nil)
	_, version = balance()
	countBody["items"] = []any{map[string]any{"product_id": product, "counted_quantity": "2", "balance_version": version}}
	countBody["version"] = draft.Data.Version
	call("PUT", "/stocktakes/"+draft.Data.ID, f.owner, "stocktake-edit0001", countBody, 200, &draft)
	call("POST", "/stocktakes/"+draft.Data.ID+"/post", f.owner, "stocktake-post0001", map[string]any{"version": draft.Data.Version}, 200, nil)
	call("POST", "/stocktakes/"+draft.Data.ID+"/post", f.owner, "stocktake-post0001", map[string]any{"version": draft.Data.Version}, 200, nil)
	if q, _ := balance(); q != "2.000000" {
		t.Fatal("stocktake replay changed quantity")
	}
	// Two independent checkouts racing for the last stock: exactly one succeeds.
	orders := []posapi.Order{order(2, "", "race-stock-order01"), order(2, "", "race-stock-order02")}
	statuses := make(chan int, 2)
	var wg sync.WaitGroup
	for i, o := range orders {
		wg.Add(1)
		go func(i int, o posapi.Order) {
			defer wg.Done()
			req, _ := http.NewRequest("POST", f.base+"/api/v1/pos/orders/"+o.ID+"/payments", bytes.NewBufferString(`{"received_vnd":20000}`))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", "Bearer "+f.cashier)
			req.Header.Set("Idempotency-Key", fmt.Sprintf("race-stock-pay%04d", i))
			r, err := f.client.Do(req)
			if err != nil {
				statuses <- 0
				return
			}
			defer r.Body.Close()
			statuses <- r.StatusCode
		}(i, o)
	}
	wg.Wait()
	close(statuses)
	success, blocked := 0, 0
	for status := range statuses {
		if status == 200 {
			success++
		}
		if status == 409 {
			blocked++
		}
	}
	if success != 1 || blocked != 1 {
		t.Fatalf("oversell race: success=%d blocked=%d", success, blocked)
	}
	if q, _ := balance(); q != "0.000000" {
		t.Fatal("negative or incorrect balance")
	}
	// Ledger/projection equality and append-only audit.
	var matches bool
	if err := f.admin.QueryRow(ctx, `SELECT b.quantity=coalesce((SELECT sum(m.quantity_delta) FROM stock_movements m WHERE m.tenant_id=b.tenant_id AND m.store_id=b.store_id AND m.product_id=b.product_id),0) FROM stock_balances b WHERE b.tenant_id=$1 AND b.store_id=$2 AND b.product_id=$3`, f.tenant, f.store, product).Scan(&matches); err != nil || !matches {
		t.Fatal("ledger and projection diverged", err)
	}
	call("GET", "/stocktakes/"+draft.Data.ID, f.otherOwner, "", nil, 404, nil)
	call("GET", "/stocktakes/"+draft.Data.ID, f.otherStoreToken, "", nil, 404, nil)
	call("POST", "/stocktakes/confirm", f.cashier, "forbidden-count01", countBody, 403, nil)
	call("GET", "/inventory/quantities?product_ids="+product, f.otherOwner, "", nil, 200, nil)
	// RLS protects new tables even when SQL omits the tenant predicate.
	var otherTenant, creator string
	if err := f.admin.QueryRow(ctx, `SELECT id::text FROM tenants WHERE id<>$1 LIMIT 1`, f.tenant).Scan(&otherTenant); err != nil {
		t.Fatal(err)
	}
	if err := f.admin.QueryRow(ctx, `SELECT created_by::text FROM stocktakes WHERE id=$1`, draft.Data.ID).Scan(&creator); err != nil {
		t.Fatal(err)
	}
	if err := database.WithTenantTx(ctx, f.runtime, otherTenant, func(tx pgx.Tx) error {
		for _, table := range []string{"stocktakes", "stocktake_items", "stock_movements", "stock_balances"} {
			var n int
			if err := tx.QueryRow(ctx, "SELECT count(*) FROM "+table).Scan(&n); err != nil {
				return err
			}
			if n != 0 {
				return fmt.Errorf("RLS leak in %s", table)
			}
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	err := database.WithTenantTx(ctx, f.runtime, otherTenant, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `INSERT INTO stocktakes(tenant_id,store_id,code,created_by) VALUES($1,$2,'FORBIDDEN',$3)`, f.tenant, f.store, creator)
		return err
	})
	var pgerr *pgconn.PgError
	if !errors.As(err, &pgerr) || pgerr.Code != "42501" {
		t.Fatal("cross-tenant insert not blocked", err)
	}
	// Partial multi-product failure rolls back a preceding successful decrement.
	var a, b moduleEnvelope[catalogRecord]
	call("POST", "/products", f.owner, "", map[string]any{"name": "Atomic A", "product_type": "goods", "price_vnd": 100}, 201, &a)
	call("POST", "/products", f.owner, "", map[string]any{"name": "Atomic B", "product_type": "goods", "price_vnd": 100}, 201, &b)
	if a.Data.ID > b.Data.ID {
		a, b = b, a
	}
	countTestStock(t, f, a.Data.ID, "1")
	var mixed moduleEnvelope[posapi.Order]
	call("POST", "/pos/orders", f.cashier, "stock-atomic-order1", map[string]any{"items": []any{map[string]any{"product_id": a.Data.ID, "quantity": 1}, map[string]any{"product_id": b.Data.ID, "quantity": 1}}}, 201, &mixed)
	pay(mixed.Data, "stock-atomic-pay001", 200, 409)
	var remaining string
	if err := f.admin.QueryRow(ctx, `SELECT quantity::text FROM stock_balances WHERE tenant_id=$1 AND store_id=$2 AND product_id=$3`, f.tenant, f.store, a.Data.ID).Scan(&remaining); err != nil || remaining != "1.000000" {
		t.Fatal("partial stock deduction survived rollback", remaining, err)
	}
	// A stale opening snapshot cannot overwrite newer stock, even with another key.
	call("POST", "/stocktakes/confirm", f.owner, "stale-count-final1", countBody, 409, nil)
}
