package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"path/filepath"
	"testing"

	purchaseapi "github.com/cngchis/FNB_SaaS/apps/api/internal/modules/purchase"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

func TestPurchaseUnitMigrationBackfill(t *testing.T) {
	f := moduleTestFixture(t)
	ctx := context.Background()
	db := stdlib.OpenDB(*f.admin.Config().ConnConfig)
	defer db.Close()
	migrations, err := filepath.Abs("../migrations")
	if err != nil {
		t.Fatal(err)
	}
	if err := goose.DownToContext(ctx, db, migrations, 7); err != nil {
		t.Fatal(err)
	}
	// A legacy receipt must retain its recorded unit even if the catalog differs.
	var itemID string
	err = f.admin.QueryRow(ctx, `WITH p AS (
	 INSERT INTO products(tenant_id,sku,name,product_type,base_unit,price_vnd)
	 VALUES($1,'LEGACY','Legacy beer','goods','Changed catalog unit',100) RETURNING id
	), s AS (
	 INSERT INTO suppliers(tenant_id,code,name) VALUES($1,'LEGACY','Legacy supplier') RETURNING id
	), r AS (
	 INSERT INTO purchase_receipts(tenant_id,store_id,supplier_id,code,total_vnd,created_by)
	 SELECT $1,$2,s.id,'LEGACY',200,m.user_id FROM s CROSS JOIN memberships m WHERE m.tenant_id=$1 LIMIT 1 RETURNING id
	)
	 INSERT INTO purchase_receipt_items(tenant_id,store_id,receipt_id,product_id,product_name,sku,unit_name,quantity,unit_cost_vnd,total_vnd)
	 SELECT $1,$2,r.id,p.id,'Legacy beer','LEGACY','Lon',2,100,200 FROM r CROSS JOIN p RETURNING id::text`, f.tenant, f.store).Scan(&itemID)
	if err != nil {
		t.Fatal(err)
	}
	if err := goose.UpContext(ctx, db, migrations); err != nil {
		t.Fatal(err)
	}
	var unit, base, ratio, quantity string
	var cost, total int64
	err = f.admin.QueryRow(ctx, `SELECT unit_name,base_unit_name,unit_ratio::text,base_quantity::text,unit_cost_vnd,total_vnd FROM purchase_receipt_items WHERE id=$1`, itemID).Scan(&unit, &base, &ratio, &quantity, &cost, &total)
	if err != nil || unit != "Lon" || base != "Lon" || ratio != "1.000" || quantity != "2.000000" || cost != 100 || total != 200 {
		t.Fatalf("legacy receipt changed: %s %s %s %s %d %d: %v", unit, base, ratio, quantity, cost, total, err)
	}
}

func TestConvertedPurchaseUnits(t *testing.T) {
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
	var supplier moduleEnvelope[purchaseapi.Action]
	call("POST", "/suppliers", f.owner, "unit-supplier-0001", map[string]any{"name": "Pack supplier"}, 201, &supplier)
	var product moduleEnvelope[catalogRecord]
	catalog := map[string]any{"name": "Pack beer", "product_type": "goods", "base_unit": "Lon", "price_vnd": 22000, "cost_vnd": 12000, "units": []any{map[string]any{"name": "Thùng", "ratio": "24", "price_vnd": 480000, "cost_vnd": 300000, "is_visible": false}, map[string]any{"name": "Gói nhỏ", "ratio": "0.125", "price_vnd": 1000}}}
	call("POST", "/products", f.owner, "", catalog, 201, &product)
	input := func(unit, ratio string, quantity, cost, version int64) map[string]any {
		return map[string]any{"supplier_id": supplier.Data.ID, "note": "Pack note", "version": version, "items": []any{map[string]any{"product_id": product.Data.ID, "unit": unit, "expected_unit_ratio": ratio, "expected_base_unit": "Lon", "quantity": quantity, "cost_vnd": cost}}}
	}
	var draft, replay moduleEnvelope[purchaseapi.Action]
	body := input("Thùng", "24", 2, 500000, 0)
	call("POST", "/purchases", f.owner, "unit-receipt-00001", body, 201, &draft)
	call("POST", "/purchases", f.owner, "unit-receipt-00001", body, 201, &replay)
	if draft.Data != replay.Data {
		t.Fatal("duplicate receipt")
	}
	var receipt moduleEnvelope[purchaseapi.Receipt]
	call("GET", "/purchases/"+draft.Data.ID, f.owner, "", nil, 200, &receipt)
	l := receipt.Data.Items[0]
	if l.Unit != "Thùng" || l.BaseUnit != "Lon" || l.UnitRatio != "24.000" || l.BaseQuantity != "48.000000" || l.Cost != 500000 || receipt.Data.Total != 1000000 {
		t.Fatalf("bad snapshot: %+v", receipt.Data)
	}
	catalog["name"] = "Renamed beer"
	catalog["units"] = []any{map[string]any{"name": "Thùng", "ratio": "20", "price_vnd": 480000, "cost_vnd": 200000}, map[string]any{"name": "Gói nhỏ", "ratio": "0.125", "price_vnd": 1000}}
	call("PUT", "/products/"+product.Data.ID, f.owner, "", catalog, 200, nil)
	call("PUT", "/purchases/"+draft.Data.ID, f.owner, "unit-draft-edit01", input("Thùng", "24", 3, 500000, 1), 200, &draft)
	call("POST", "/purchases/"+draft.Data.ID+"/post", f.owner, "unit-receipt-post1", map[string]any{"version": draft.Data.Version}, 200, nil)
	call("POST", "/purchases/"+draft.Data.ID+"/post", f.owner, "unit-receipt-post1", map[string]any{"version": draft.Data.Version}, 200, nil)
	call("POST", "/purchases/"+draft.Data.ID+"/post", f.owner, "unit-receipt-post2", map[string]any{"version": draft.Data.Version}, 200, nil)
	var quantity, unit string
	var cost *int64
	var count int
	if err := f.admin.QueryRow(ctx, `SELECT b.quantity::text,m.unit_name,m.unit_cost_vnd,(SELECT count(*) FROM stock_movements WHERE receipt_item_id=m.receipt_item_id) FROM stock_balances b JOIN stock_movements m ON m.tenant_id=b.tenant_id AND m.store_id=b.store_id AND m.product_id=b.product_id WHERE b.tenant_id=$1 AND b.store_id=$2 AND b.product_id=$3`, f.tenant, f.store, product.Data.ID).Scan(&quantity, &unit, &cost, &count); err != nil {
		t.Fatal(err)
	}
	if quantity != "72.000000" || unit != "Lon" || cost != nil || count != 1 {
		t.Fatalf("wrong stock/cost: %s %s %v %d", quantity, unit, cost, count)
	}
	call("GET", "/purchases/"+draft.Data.ID, f.owner, "", nil, 200, &receipt)
	if receipt.Data.Items[0].Name != "Pack beer" || receipt.Data.Items[0].UnitRatio != "24.000" || receipt.Data.Items[0].Cost != 500000 {
		t.Fatal("catalog rewrote document")
	}
	call("PUT", "/purchases/"+draft.Data.ID, f.owner, "unit-posted-edit1", input("Lon", "1", 1, 100, 3), 409, nil)
	call("GET", "/purchases/"+draft.Data.ID, f.otherOwner, "", nil, 404, nil)
	call("GET", "/purchases/"+draft.Data.ID, f.otherStoreToken, "", nil, 404, nil)
	call("POST", "/purchases", f.owner, "unit-stale-create1", input("Thùng", "24", 1, 100, 0), 409, nil)
	call("POST", "/purchases", f.owner, "unit-invalid-name1", input("Fake", "1", 1, 100, 0), 422, nil)
	call("POST", "/purchases", f.owner, "unit-small-create1", input("Gói nhỏ", "0.125", 3, 7, 0), 201, &replay)
	call("POST", "/purchases/"+replay.Data.ID+"/post", f.owner, "unit-small-post001", map[string]any{"version": replay.Data.Version}, 200, nil)
	if err := f.admin.QueryRow(ctx, `SELECT quantity::text FROM stock_balances WHERE tenant_id=$1 AND store_id=$2 AND product_id=$3`, f.tenant, f.store, product.Data.ID).Scan(&quantity); err != nil || quantity != "72.375000" {
		t.Fatal("fractional conversion failed", quantity, err)
	}
	// An explicit unit re-selection may adopt a new catalog ratio; a normal edit may not.
	call("POST", "/purchases", f.owner, "unit-new-create001", input("Thùng", "20", 1, 100, 0), 201, &replay)
	catalog["units"] = []any{map[string]any{"name": "Thùng", "ratio": "12", "price_vnd": 480000}}
	call("PUT", "/products/"+product.Data.ID, f.owner, "", catalog, 200, nil)
	refresh := input("Thùng", "12", 1, 100, 1)
	refresh["items"].([]any)[0].(map[string]any)["refresh_unit"] = true
	call("PUT", "/purchases/"+replay.Data.ID, f.owner, "unit-refresh00001", refresh, 200, &replay)
	call("GET", "/purchases/"+replay.Data.ID, f.owner, "", nil, 200, &receipt)
	if receipt.Data.Items[0].UnitRatio != "12.000" {
		t.Fatal("explicit unit change ignored")
	}
	// No current unit lookup is needed when posting a persisted snapshot.
	catalog["units"] = []any{}
	call("PUT", "/products/"+product.Data.ID, f.owner, "", catalog, 200, nil)
	call("POST", "/purchases/"+replay.Data.ID+"/post", f.owner, "unit-removed-post1", map[string]any{"version": replay.Data.Version}, 200, nil)
	db := stdlib.OpenDB(*f.admin.Config().ConnConfig)
	defer db.Close()
	migrations, _ := filepath.Abs("../migrations")
	if err := goose.DownToContext(ctx, db, migrations, 7); err == nil {
		t.Fatal("rollback lost conversion snapshots")
	}
}
