package tests

import (
	"bytes"
	"context"
	"encoding/json"
	posapi "github.com/cngchis/FNB_SaaS/apps/api/internal/modules/pos"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"net/http"
	"path/filepath"
	"testing"
)

func TestStockCutoverRequiresOpeningCount(t *testing.T) {
	f := moduleTestFixture(t)
	ctx := context.Background()
	db := stdlib.OpenDB(*f.admin.Config().ConnConfig)
	defer db.Close()
	migrations, _ := filepath.Abs("../migrations")
	if err := goose.DownToContext(ctx, db, migrations, 6); err != nil {
		t.Fatal(err)
	}
	var product string
	if err := f.admin.QueryRow(ctx, `INSERT INTO products(tenant_id,sku,name,product_type,base_unit,price_vnd,tracks_stock) VALUES($1,'M70003','Legacy stock','goods','Lon',10000,true) RETURNING id::text`, f.tenant).Scan(&product); err != nil {
		t.Fatal(err)
	}
	if err := goose.UpContext(ctx, db, migrations); err != nil {
		t.Fatal(err)
	}
	var balances moduleEnvelope[[]struct {
		Quantity *string `json:"quantity"`
	}]
	authRequest(t, f.client, f.base, "GET", "/api/v1/inventory/quantities?product_ids="+product, f.owner, nil, 200, &balances)
	if len(balances.Data) != 1 || balances.Data[0].Quantity != nil {
		t.Fatal("legacy stock incorrectly exposed as confirmed")
	}
	var order moduleEnvelope[posapi.Order]
	req, _ := http.NewRequest("POST", f.base+"/api/v1/pos/orders", bytes.NewBufferString(`{"items":[{"product_id":"`+product+`","quantity":1}]}`))
	req.Header.Set("Authorization", "Bearer "+f.cashier)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", "cutover-order-0001")
	r, err := f.client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer r.Body.Close()
	if r.StatusCode != 201 {
		t.Fatal("order rejected", r.StatusCode)
	}
	_ = json.NewDecoder(r.Body).Decode(&order)
	pay := func(want int) {
		t.Helper()
		req, _ := http.NewRequest("POST", f.base+"/api/v1/pos/orders/"+order.Data.ID+"/payments", bytes.NewBufferString(`{"received_vnd":10000}`))
		req.Header.Set("Authorization", "Bearer "+f.cashier)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Idempotency-Key", "cutover-payment01")
		r, err := f.client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer r.Body.Close()
		if r.StatusCode != want {
			t.Fatal("wrong checkout result", r.StatusCode, want)
		}
	}
	pay(409)
	countTestStock(t, f, product, "2")
	pay(200)
	if err = goose.DownToContext(ctx, db, migrations, 6); err == nil {
		t.Fatal("rollback discarded posted audit ledger")
	}
}
