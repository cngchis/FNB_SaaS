package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"path/filepath"
	"sync"
	"testing"

	"github.com/cngchis/FNB_SaaS/apps/api/internal/database"
	posapi "github.com/cngchis/FNB_SaaS/apps/api/internal/modules/pos"
	recipeapi "github.com/cngchis/FNB_SaaS/apps/api/internal/modules/recipe"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

func TestRecipeInventory(t *testing.T) {
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
	var milk, coffee, drink moduleEnvelope[catalogRecord]
	call("POST", "/products", f.owner, "", map[string]any{"name": "Milk", "product_type": "goods", "base_unit": "L", "price_vnd": 10000, "cost_vnd": 20000}, 201, &milk)
	call("POST", "/products", f.owner, "", map[string]any{"name": "Coffee", "product_type": "goods", "base_unit": "kg", "price_vnd": 10000, "cost_vnd": 100000}, 201, &coffee)
	call("POST", "/products", f.owner, "", map[string]any{"name": "Latte", "product_type": "prepared", "base_unit": "Ly", "price_vnd": 40000, "attributes": []any{map[string]any{"name": "Size", "value": "L"}}, "units": []any{map[string]any{"name": "Bình", "ratio": "3", "price_vnd": 100000}}}, 201, &drink)
	countTestStock(t, f, milk.Data.ID, "1")
	countTestStock(t, f, coffee.Data.ID, "1")
	var legacy moduleEnvelope[posapi.Order]
	call("POST", "/pos/orders", f.cashier, "recipe-legacy-order1", map[string]any{"items": []any{map[string]any{"product_id": drink.Data.ID, "quantity": 1, "unit": "Ly"}}}, 201, &legacy)
	input := func(version int, amount string, attrs []recipeapi.Attribute) map[string]any {
		return map[string]any{"version": version, "unit": "Ly", "attributes": attrs, "ingredients": []any{map[string]any{"product_id": milk.Data.ID, "base_unit": "L", "quantity": amount}, map[string]any{"product_id": coffee.Data.ID, "base_unit": "kg", "quantity": "0.02"}}}
	}
	var r, again moduleEnvelope[recipeapi.Recipe]
	body := input(0, "0.125", nil)
	call("PUT", "/products/"+drink.Data.ID+"/recipes", f.owner, "recipe-default-0001", body, 200, &r)
	call("PUT", "/products/"+drink.Data.ID+"/recipes", f.owner, "recipe-default-0001", body, 200, &again)
	if r.Data.ID != again.Data.ID || r.Data.Version != 1 {
		t.Fatal("duplicate recipe revision")
	}
	call("PUT", "/pos/orders/"+legacy.Data.ID, f.cashier, "recipe-legacy-edit01", map[string]any{"version": legacy.Data.Version, "items": []any{map[string]any{"product_id": drink.Data.ID, "quantity": 2, "unit": "Ly"}}}, 409, nil)
	call("PUT", "/products/"+drink.Data.ID+"/recipes", f.owner, "recipe-stale-000001", body, 409, nil)
	call("PUT", "/products/"+drink.Data.ID+"/recipes", f.cashier, "recipe-forbidden001", body, 403, nil)
	call("GET", "/products/"+drink.Data.ID+"/recipes", f.otherOwner, "", nil, 404, nil)
	invalid := input(1, "0", nil)
	call("PUT", "/products/"+drink.Data.ID+"/recipes", f.owner, "recipe-invalid-0001", invalid, 422, nil)
	invalid = input(1, "1", nil)
	invalid["ingredients"].([]any)[0].(map[string]any)["product_id"] = drink.Data.ID
	call("PUT", "/products/"+drink.Data.ID+"/recipes", f.owner, "recipe-cycle-000001", invalid, 422, nil)
	err := database.WithTenantTx(ctx, f.runtime, f.tenant, func(tx pgx.Tx) error {
		var count int
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM product_recipes WHERE id=$1`, r.Data.ID).Scan(&count); err != nil {
			return err
		}
		if count != 1 {
			t.Fatal("own recipe inaccessible")
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	var otherTenant string
	if err = f.admin.QueryRow(ctx, `SELECT id::text FROM tenants WHERE id<>$1 LIMIT 1`, f.tenant).Scan(&otherTenant); err != nil {
		t.Fatal(err)
	}
	err = database.WithTenantTx(ctx, f.runtime, otherTenant, func(tx pgx.Tx) error {
		var count int
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM product_recipes WHERE id=$1`, r.Data.ID).Scan(&count); err != nil {
			return err
		}
		if count != 0 {
			t.Fatal("recipe RLS leak")
		}
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM recipe_ingredients WHERE recipe_id=$1`, r.Data.ID).Scan(&count); err != nil {
			return err
		}
		if count != 0 {
			t.Fatal("ingredient RLS leak")
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	create := func(q int, unit, key string, attrs []recipeapi.Attribute) posapi.Order {
		t.Helper()
		var o moduleEnvelope[posapi.Order]
		call("POST", "/pos/orders", f.cashier, key, map[string]any{"items": []any{map[string]any{"product_id": drink.Data.ID, "quantity": q, "unit": unit, "attributes": attrs}}}, 201, &o)
		return o.Data
	}
	o := create(2, "Ly", "recipe-order-00001", nil)
	if o.Items[0].Recipe == nil || *o.Items[0].Cost != 4500 {
		t.Fatal("recipe/cost not snapshotted", o)
	}
	call("PUT", "/products/"+drink.Data.ID+"/recipes", f.owner, "recipe-revise-0001", input(1, "0.5", nil), 200, &r)
	var paid moduleEnvelope[posapi.Payment]
	call("POST", "/pos/orders/"+o.ID+"/payments", f.cashier, "recipe-payment-001", map[string]any{"received_vnd": 10000}, 200, &paid)
	call("POST", "/pos/orders/"+o.ID+"/payments", f.cashier, "recipe-payment-001", map[string]any{"received_vnd": 10000}, 200, &paid)
	balance := func(id, want string) {
		t.Helper()
		var q string
		if err := f.admin.QueryRow(ctx, `SELECT quantity::text FROM stock_balances WHERE tenant_id=$1 AND store_id=$2 AND product_id=$3`, f.tenant, f.store, id).Scan(&q); err != nil || q != want {
			t.Fatalf("balance %s want %s: %v", q, want, err)
		}
	}
	balance(milk.Data.ID, "0.750000")
	balance(coffee.Data.ID, "0.960000")
	// Issued receivable edits use the original recipe and only apply the quantity delta.
	var revised moduleEnvelope[posapi.Order]
	call("PUT", "/pos/orders/"+o.ID, f.cashier, "recipe-order-edit1", map[string]any{"version": paid.Data.Order.Version, "items": []any{map[string]any{"product_id": drink.Data.ID, "quantity": 3, "unit": "Ly"}}}, 200, &revised)
	balance(milk.Data.ID, "0.625000")
	balance(coffee.Data.ID, "0.940000")
	call("POST", "/pos/orders/"+o.ID+"/payments", f.cashier, "recipe-payment-002", map[string]any{"received_vnd": 110000}, 200, nil)
	balance(milk.Data.ID, "0.625000")
	call("POST", "/pos/orders", f.cashier, "recipe-unit-miss001", map[string]any{"items": []any{map[string]any{"product_id": drink.Data.ID, "quantity": 1, "unit": "Bình"}}}, 409, nil)
	// Exact size recipe overrides the unit default, without reading future revisions.
	call("PUT", "/products/"+drink.Data.ID+"/recipes", f.owner, "recipe-large-00001", input(0, "0.25", []recipeapi.Attribute{{Name: "Size", Value: "L"}}), 200, nil)
	large := create(1, "Ly", "recipe-large-order1", []recipeapi.Attribute{{Name: "Size", Value: "L"}})
	foundMilk := false
	for _, i := range large.Items[0].Recipe.Ingredients {
		if i.ProductID == milk.Data.ID {
			foundMilk = i.Quantity == "0.250000"
		}
	}
	if !foundMilk {
		t.Fatal("exact size recipe not selected")
	}
	// Both orders can be drafted; only one may spend the final available milk.
	a := create(1, "Ly", "recipe-race-order01", nil)
	b := create(1, "Ly", "recipe-race-order02", nil)
	var wg sync.WaitGroup
	statuses := make(chan int, 2)
	for i, order := range []posapi.Order{a, b} {
		wg.Add(1)
		go func(index int, order posapi.Order) {
			defer wg.Done()
			payload := bytes.NewBufferString(`{"received_vnd":40000}`)
			req, _ := http.NewRequest("POST", f.base+"/api/v1/pos/orders/"+order.ID+"/payments", payload)
			req.Header.Set("Authorization", "Bearer "+f.cashier)
			req.Header.Set("Content-Type", "application/json")
			key := "recipe-race-pay001"
			if index == 1 {
				key = "recipe-race-pay002"
			}
			req.Header.Set("Idempotency-Key", key)
			res, err := f.client.Do(req)
			if err != nil {
				statuses <- 0
				return
			}
			defer res.Body.Close()
			statuses <- res.StatusCode
		}(i, order)
	}
	wg.Wait()
	close(statuses)
	success, blocked := 0, 0
	for s := range statuses {
		if s == 200 {
			success++
		}
		if s == 409 {
			blocked++
		}
	}
	if success != 1 || blocked != 1 {
		t.Fatalf("race: %d success %d blocked", success, blocked)
	}
	balance(milk.Data.ID, "0.125000")
	balance(coffee.Data.ID, "0.920000")
	// Insufficient ingredient must not issue an invoice or partially consume coffee.
	call("POST", "/pos/orders/"+large.ID+"/payments", f.cashier, "recipe-shortage-001", map[string]any{"received_vnd": 40000}, 409, nil)
	balance(coffee.Data.ID, "0.920000")
	var invoices int
	if err := f.admin.QueryRow(ctx, `SELECT count(*) FROM invoices WHERE order_id=$1`, large.ID).Scan(&invoices); err != nil || invoices != 0 {
		t.Fatal("shortage issued an invoice", err)
	}
	call("POST", "/pos/orders/"+large.ID+"/payments", f.otherStoreToken, "recipe-other-store1", map[string]any{"received_vnd": 40000}, 404, nil)
	// Identity changes would invalidate recipe snapshots and must be rejected.
	call("PUT", "/products/"+milk.Data.ID, f.owner, "", map[string]any{"name": "Milk", "product_type": "goods", "base_unit": "ml", "price_vnd": 10000}, 422, nil)
	var rounds int
	if err := f.admin.QueryRow(ctx, `SELECT count(*) FROM order_round_items WHERE product_id=$1 AND recipe_snapshot->>'version'='1'`, drink.Data.ID).Scan(&rounds); err != nil || rounds < 2 {
		t.Fatal("round history lost recipe snapshot", err, rounds)
	}
	db := stdlib.OpenDB(*f.admin.Config().ConnConfig)
	defer db.Close()
	migrations, err := filepath.Abs("../migrations")
	if err != nil {
		t.Fatal(err)
	}
	if err := goose.DownToContext(ctx, db, migrations, 8); err == nil {
		t.Fatal("rollback discarded recipe history")
	}
}
