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

	posapi "github.com/cngchis/FNB_SaaS/apps/api/internal/modules/pos"
	productapi "github.com/cngchis/FNB_SaaS/apps/api/internal/modules/product"
)

func TestUnitVisibility(t *testing.T) {
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
			t.Fatalf("%s %s: got %d want %d: %v", method, path, response.StatusCode, status, failure)
		}
		if out != nil {
			if err := json.NewDecoder(response.Body).Decode(out); err != nil {
				t.Fatal(err)
			}
		}
	}
	body := map[string]any{"name": "Bia", "product_type": "goods", "base_unit": "Lon", "price_vnd": 22000, "cost_vnd": 16000, "is_visible": true, "units": []any{map[string]any{"name": "Thùng", "ratio": "24", "price_vnd": 480000, "cost_vnd": 384000, "is_visible": false}, map[string]any{"name": "Tặng", "ratio": "1", "price_vnd": 0}}}
	var product moduleEnvelope[productapi.Item]
	var productID string
	call("POST", "/products", f.owner, "", body, 201, &product)
	idJSON, _ := json.Marshal(product.Data.ID)
	_ = json.Unmarshal(idJSON, &productID)
	hidden := false
	legacyVisible := false
	for _, unit := range product.Data.Units {
		if unit.Name == "Thùng" {
			hidden = !unit.IsVisible
		}
		if unit.Name == "Tặng" {
			legacyVisible = unit.IsVisible
		}
	}
	if !hidden || !legacyVisible {
		t.Fatalf("visibility flags not preserved: %+v", product.Data.Units)
	}
	input := func(unit string, qty, version int64) map[string]any {
		return map[string]any{"room_id": nil, "version": version, "discount_vnd": 0, "items": []any{map[string]any{"product_id": product.Data.ID, "unit": unit, "quantity": qty, "attributes": []any{}}}}
	}
	call("POST", "/pos/orders", f.cashier, "hidden-unit-create-01", input("Thùng", 1, 0), 422, nil)
	var base, free, pack moduleEnvelope[posapi.Order]
	call("POST", "/pos/orders", f.cashier, "base-unit-create-0001", input("", 1, 0), 201, &base)
	call("POST", "/pos/orders", f.cashier, "free-unit-create-0001", input("Tặng", 1, 0), 201, &free)
	if free.Data.Total != 0 {
		t.Fatal("explicit zero unit price was replaced")
	}
	body["is_visible"] = false
	body["units"] = []any{map[string]any{"name": "Thùng", "ratio": "24", "price_vnd": 480000, "cost_vnd": 384000, "is_visible": true}}
	call("PUT", "/products/"+productID, f.cashier, "", body, 403, nil)
	call("PUT", "/products/"+productID, f.owner, "", body, 200, &product)
	call("POST", "/pos/orders", f.cashier, "hidden-base-create-01", input("", 1, 0), 422, nil)
	call("POST", "/pos/orders", f.cashier, "visible-pack-create1", input("Thùng", 1, 0), 201, &pack)
	if pack.Data.Total != 480000 {
		t.Fatal("unit price not used")
	}
	// Keep existing lines readable/payable, but reject increasing a hidden unit.
	call("PUT", "/pos/orders/"+base.Data.ID, f.cashier, "hidden-base-update01", input("", 2, base.Data.Version), 422, nil)
	call("PUT", "/pos/orders/"+base.Data.ID, f.cashier, "same-base-update0001", input("", 1, base.Data.Version), 200, &base)
	body["units"] = []any{map[string]any{"name": "Thùng", "ratio": "24", "price_vnd": 480000, "cost_vnd": 384000, "is_visible": false}}
	call("PUT", "/products/"+productID, f.owner, "", body, 200, &product)
	call("PUT", "/pos/orders/"+pack.Data.ID, f.cashier, "hidden-pack-update01", input("Thùng", 2, pack.Data.Version), 422, nil)
	call("PUT", "/pos/orders/"+pack.Data.ID, f.cashier, "same-pack-update0001", input("Thùng", 1, pack.Data.Version), 200, &pack)
	call("POST", "/pos/orders/"+pack.Data.ID+"/payments", f.cashier, "hidden-pack-payment1", map[string]any{"received_vnd": 480000}, 200, nil)
	call("POST", "/pos/orders", f.otherOwner, "foreign-unit-order01", input("Thùng", 1, 0), 404, nil)
}

func TestUnitVisibilityMigrationBackfill(t *testing.T) {
	f := moduleTestFixture(t)
	ctx := context.Background()
	db := stdlib.OpenDB(*f.admin.Config().ConnConfig)
	defer db.Close()
	migrations, err := filepath.Abs("../migrations")
	if err != nil {
		t.Fatal(err)
	}
	if err = goose.DownToContext(ctx, db, migrations, 5); err != nil {
		t.Fatal(err)
	}
	// Simulate catalog rows written by the previous application version.
	_, err = f.admin.Exec(ctx, `WITH p AS (INSERT INTO products(tenant_id,sku,name,product_type,base_unit,price_vnd,is_visible) VALUES($1,'M70001','Hidden legacy','goods','Lon',22000,false),($1,'M70002','Visible legacy','goods','Lon',22000,true) RETURNING id,tenant_id) INSERT INTO product_units(tenant_id,product_id,name,ratio,price_vnd) SELECT tenant_id,id,'Thùng',24,480000 FROM p`, f.tenant)
	if err != nil {
		t.Fatal(err)
	}
	if err = goose.UpContext(ctx, db, migrations); err != nil {
		t.Fatal(err)
	}
	var count int
	if err = f.admin.QueryRow(ctx, `SELECT count(*) FROM product_units u JOIN products p ON p.id=u.product_id AND p.tenant_id=u.tenant_id WHERE p.sku IN ('M70001','M70002') AND u.is_visible=p.is_visible`).Scan(&count); err != nil || count != 2 {
		t.Fatalf("legacy visibility changed: count=%d err=%v", count, err)
	}
}
