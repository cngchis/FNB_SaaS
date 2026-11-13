package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"testing"

	purchaseapi "github.com/cngchis/FNB_SaaS/apps/api/internal/modules/purchase"
)

func TestPurchasingAndStock(t *testing.T) {
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
	var supplier moduleEnvelope[purchaseapi.Action]
	supplierBody := map[string]any{"name": "Stock_% supplier", "phone": "0900000000"}
	call("POST", "/suppliers", f.owner, "supplier-create-0001", supplierBody, 201, &supplier)
	var replay moduleEnvelope[purchaseapi.Action]
	call("POST", "/suppliers", f.owner, "supplier-create-0001", supplierBody, 201, &replay)
	if replay.Data.ID != supplier.Data.ID {
		t.Fatal("supplier retry duplicated identity")
	}
	supplierBody["name"] = "Different"
	call("POST", "/suppliers", f.owner, "supplier-create-0001", supplierBody, 409, nil)
	var goods, prepared moduleEnvelope[catalogRecord]
	call("POST", "/products", f.owner, "", map[string]any{"name": "Receipt goods", "product_type": "goods", "price_vnd": 100, "cost_vnd": 20, "tracks_stock": true, "base_unit": "Lon"}, 201, &goods)
	call("POST", "/products", f.owner, "", map[string]any{"name": "Receipt prepared", "product_type": "prepared", "price_vnd": 100}, 201, &prepared)
	body := func(product string, qty, cost, version int64) map[string]any {
		return map[string]any{"supplier_id": supplier.Data.ID, "note": "Purchase note", "version": version, "items": []any{map[string]any{"product_id": product, "quantity": qty, "cost_vnd": cost}}}
	}
	var draft moduleEnvelope[purchaseapi.Action]
	input := body(goods.Data.ID, 2, 30, 0)
	call("POST", "/purchases", f.owner, "purchase-create-0001", input, 201, &draft)
	call("POST", "/purchases", f.owner, "purchase-create-0001", input, 201, &replay)
	if draft.Data != replay.Data {
		t.Fatal("draft retry duplicated identity")
	}
	var stock moduleEnvelope[struct {
		Items []struct {
			Quantity string `json:"quantity"`
		} `json:"items"`
	}]
	call("GET", "/inventory/balances", f.owner, "", nil, 200, &stock)
	if len(stock.Data.Items) != 1 || stock.Data.Items[0].Quantity != "0" {
		t.Fatalf("draft changed stock: %+v", stock)
	}
	var receipt moduleEnvelope[purchaseapi.Receipt]
	call("GET", "/purchases/"+draft.Data.ID, f.owner, "", nil, 200, &receipt)
	if receipt.Data.Total != 60 || receipt.Data.Status != "draft" || len(receipt.Data.Items) != 1 || receipt.Data.Items[0].Unit != "Lon" {
		t.Fatalf("wrong snapshot: %+v", receipt)
	}
	// Posting the same receipt concurrently must create exactly one movement.
	var wg sync.WaitGroup
	results := make(chan error, 4)
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			req, _ := http.NewRequest("POST", f.base+"/api/v1/purchases/"+draft.Data.ID+"/post", bytes.NewBufferString(`{"version":1}`))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", "Bearer "+f.owner)
			req.Header.Set("Idempotency-Key", "purchase-post-0001")
			response, err := f.client.Do(req)
			if err == nil {
				defer response.Body.Close()
				if response.StatusCode != 200 {
					err = fmt.Errorf("post returned %d", response.StatusCode)
				}
			}
			results <- err
		}()
	}
	wg.Wait()
	close(results)
	for err := range results {
		if err != nil {
			t.Fatal(err)
		}
	}
	call("POST", "/purchases/"+draft.Data.ID+"/post", f.owner, "purchase-post-0002", map[string]any{"version": 1}, 200, nil)
	call("PUT", "/purchases/"+draft.Data.ID, f.owner, "purchase-edit-00001", body(goods.Data.ID, 4, 30, 2), 409, nil)
	var second moduleEnvelope[purchaseapi.Action]
	call("POST", "/purchases", f.owner, "purchase-create-0002", body(goods.Data.ID, 3, 40, 0), 201, &second)
	call("PUT", "/purchases/"+second.Data.ID, f.owner, "purchase-edit-00002", body(goods.Data.ID, 3, 41, 1), 200, &replay)
	call("PUT", "/purchases/"+second.Data.ID, f.owner, "purchase-edit-00003", body(goods.Data.ID, 4, 41, 1), 409, nil)
	call("POST", "/purchases/"+second.Data.ID+"/post", f.owner, "purchase-post-0003", map[string]any{"version": 1}, 409, nil)
	call("POST", "/purchases/"+second.Data.ID+"/post", f.owner, "purchase-post-0004", map[string]any{"version": 2}, 200, nil)
	call("GET", "/inventory/balances", f.owner, "", nil, 200, &stock)
	if stock.Data.Items[0].Quantity != "5.000000" {
		t.Fatalf("wrong stock: %+v", stock)
	}
	var count int
	var quantity string
	if err := f.admin.QueryRow(context.Background(), "SELECT count(*),sum(quantity_delta)::text FROM stock_movements").Scan(&count, &quantity); err != nil || count != 2 || quantity != "5.000000" {
		t.Fatalf("ledger mismatch: %d %s %v", count, quantity, err)
	}
	if _, err := f.admin.Exec(context.Background(), "UPDATE stock_movements SET quantity_delta=99"); err == nil {
		t.Fatal("ledger could be modified")
	}
	if _, err := f.admin.Exec(context.Background(), "UPDATE products SET base_unit='Thùng' WHERE id=$1", goods.Data.ID); err == nil {
		t.Fatal("stock base unit changed after ledger history")
	}
	if err := f.runtime.QueryRow(context.Background(), "SELECT count(*) FROM stock_movements").Scan(&count); err != nil || count != 0 {
		t.Fatal("ledger bypassed tenant RLS")
	}
	var suppliers moduleEnvelope[purchaseapi.SupplierResult]
	call("GET", "/suppliers?search=Stock_%25", f.owner, "", nil, 200, &suppliers)
	if suppliers.Data.Total != 1 || suppliers.Data.Debt != 183 {
		t.Fatalf("supplier debt: %+v", suppliers)
	}
	call("DELETE", "/suppliers/"+supplier.Data.ID+"?version=1", f.owner, "", nil, 409, nil)
	var listing moduleEnvelope[purchaseapi.Result]
	call("GET", "/purchases?page_size=1", f.owner, "", nil, 200, &listing)
	if listing.Data.Total != 2 || listing.Data.Amount != 183 || listing.Data.Pagination.TotalPages != 2 {
		t.Fatal("purchase summary/pagination mismatch")
	}
	call("GET", "/purchases/"+draft.Data.ID, f.otherOwner, "", nil, 404, nil)
	call("GET", "/purchases/"+draft.Data.ID, f.otherStoreToken, "", nil, 404, nil)
	call("GET", "/suppliers", f.cashier, "", nil, 403, nil)
	call("GET", "/inventory/movements", f.kitchen, "", nil, 403, nil)
	call("POST", "/purchases", f.otherOwner, "purchase-foreign-001", body(goods.Data.ID, 1, 10, 0), 404, nil)
	call("POST", "/purchases", f.owner, "purchase-prepared-01", body(prepared.Data.ID, 1, 10, 0), 422, nil)
	call("POST", "/purchases", f.owner, "purchase-overflow-01", body(goods.Data.ID, 2, 9007199254740991, 0), 422, nil)
	call("POST", "/purchases", f.owner, "purchase-negative-01", body(goods.Data.ID, -1, 10, 0), 422, nil)
	// A catalogue edit after saving must not silently convert the draft into a different unit.
	var fresh moduleEnvelope[catalogRecord]
	call("POST", "/products", f.owner, "", map[string]any{"name": "Unit guard", "product_type": "goods", "price_vnd": 100, "tracks_stock": true, "base_unit": "Cái"}, 201, &fresh)
	var changed moduleEnvelope[purchaseapi.Action]
	call("POST", "/purchases", f.owner, "purchase-change-0001", body(fresh.Data.ID, 1, 10, 0), 201, &changed)
	if _, err := f.admin.Exec(context.Background(), "UPDATE products SET base_unit='Lon' WHERE id=$1", fresh.Data.ID); err != nil {
		t.Fatal(err)
	}
	call("POST", "/purchases/"+changed.Data.ID+"/post", f.owner, "purchase-change-0002", map[string]any{"version": 1}, 409, nil)
	var moves moduleEnvelope[struct {
		Items []any `json:"items"`
	}]
	call("GET", "/inventory/movements", f.owner, "", nil, 200, &moves)
	if len(moves.Data.Items) != 2 {
		t.Fatal("failed post left a partial movement")
	}
}
