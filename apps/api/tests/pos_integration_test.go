package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"testing"

	posapi "github.com/cngchis/FNB_SaaS/apps/api/internal/modules/pos"
)

func TestRoomsPOSCash(t *testing.T) {
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
	var room, foreignRoom, product moduleEnvelope[catalogRecord]
	call("POST", "/rooms", f.cashier, "", map[string]string{"name": "Forbidden"}, 403, nil)
	call("POST", "/rooms", f.owner, "", map[string]string{"name": "Bàn 01", "note": "Window"}, 201, &room)
	call("POST", "/rooms", f.owner, "", map[string]string{"name": "bàn 01"}, 409, nil)
	call("POST", "/rooms", f.otherOwner, "", map[string]string{"name": "Other"}, 201, &foreignRoom)
	var otherRooms moduleEnvelope[[]catalogRecord]
	call("GET", "/rooms", f.otherStoreToken, "", nil, 200, &otherRooms)
	if len(otherRooms.Data) != 0 {
		t.Fatal("rooms leaked across stores")
	}
	call("PUT", "/rooms/"+room.Data.ID, f.otherStoreToken, "", map[string]string{"name": "Blocked"}, 404, nil)
	call("POST", "/products", f.owner, "", map[string]any{"name": "Coffee", "product_type": "prepared", "price_vnd": 35000}, 201, &product)
	input := map[string]any{"room_id": room.Data.ID, "discount_vnd": 0, "version": 0, "items": []any{map[string]any{"product_id": product.Data.ID, "quantity": 1, "unit": "", "attributes": []any{}}}}
	var created, replayed, updated moduleEnvelope[posapi.Order]
	call("POST", "/pos/orders", f.cashier, "order-create-key-0001", input, 201, &created)
	call("POST", "/pos/orders", f.cashier, "order-create-key-0001", input, 201, &replayed)
	if created.Data.ID != replayed.Data.ID || created.Data.Total != 35000 {
		t.Fatal("order idempotency or server pricing failed")
	}
	input["discount_vnd"] = 1
	call("POST", "/pos/orders", f.cashier, "order-create-key-0001", input, 409, nil)
	input["discount_vnd"] = 0
	call("POST", "/pos/orders", f.cashier, "order-create-key-0002", input, 409, nil)
	call("GET", "/pos/orders/"+created.Data.ID, f.otherOwner, "", nil, 404, nil)
	call("GET", "/pos/orders/"+created.Data.ID, f.otherStoreToken, "", nil, 404, nil)
	call("GET", "/pos/orders", f.kitchen, "", nil, 403, nil)
	input["room_id"] = foreignRoom.Data.ID
	call("POST", "/pos/orders", f.cashier, "order-create-key-0003", input, 404, nil)
	input["room_id"] = room.Data.ID
	input["version"] = 1
	input["discount_vnd"] = 5000
	input["items"] = []any{map[string]any{"product_id": product.Data.ID, "quantity": 2, "unit": "", "attributes": []any{}}}
	call("PUT", "/pos/orders/"+created.Data.ID, f.cashier, "order-update-key-0001", input, 200, &updated)
	if updated.Data.Total != 65000 || updated.Data.Version != 2 {
		t.Fatal("wrong updated total or revision")
	}
	call("PUT", "/pos/orders/"+created.Data.ID, f.cashier, "order-update-key-0001", input, 200, &replayed)
	call("PUT", "/pos/orders/"+created.Data.ID, f.cashier, "order-update-key-0002", input, 409, nil)
	var count int
	if err := f.admin.QueryRow(context.Background(), "SELECT count(*) FROM order_rounds WHERE order_id=$1", created.Data.ID).Scan(&count); err != nil || count != 2 {
		t.Fatalf("expected two durable ordering rounds, got %d: %v", count, err)
	}
	var first, second moduleEnvelope[posapi.Payment]
	path := "/pos/orders/" + created.Data.ID + "/payments"
	call("POST", path, f.cashier, "cash-payment-key-0001", map[string]any{"received_vnd": 20000}, 200, &first)
	call("POST", path, f.cashier, "cash-payment-key-0001", map[string]any{"received_vnd": 20000}, 200, &first)
	if first.Data.Order.Paid != 20000 || first.Data.Order.Status != "pending_payment" {
		t.Fatal("partial payment failed")
	}
	call("DELETE", "/rooms/"+room.Data.ID, f.owner, "", nil, 409, nil)
	call("POST", path, f.cashier, "cash-payment-key-0001", map[string]any{"received_vnd": 30000}, 409, nil)
	call("POST", path, f.cashier, "cash-payment-key-0002", map[string]any{"received_vnd": 50000}, 200, &second)
	if second.Data.Change != 5000 || second.Data.Applied != 45000 || second.Data.Order.Paid != 65000 || second.Data.Order.Status != "paid" || second.Data.Order.Invoice == nil {
		t.Fatal("settlement, change or invoice failed")
	}
	call("POST", path, f.cashier, "cash-payment-key-0003", map[string]any{"received_vnd": 50000}, 409, nil)
	if err := f.admin.QueryRow(context.Background(), "SELECT count(*) FROM payments WHERE order_id=$1", created.Data.ID).Scan(&count); err != nil || count != 2 {
		t.Fatalf("duplicate payment rows: %d: %v", count, err)
	}
	input["version"] = updated.Data.Version
	call("PUT", "/pos/orders/"+created.Data.ID, f.cashier, "order-update-key-0003", input, 409, nil)
	// Two distinct payment attempts racing to settle an order cannot overcharge it.
	input["version"] = 0
	input["discount_vnd"] = 0
	call("POST", "/pos/orders", f.cashier, "order-create-key-race", input, 201, &created)
	var wg sync.WaitGroup
	statuses := make(chan int, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			req, _ := http.NewRequest("POST", f.base+"/api/v1/pos/orders/"+created.Data.ID+"/payments", bytes.NewBufferString(`{"received_vnd":70000}`))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", "Bearer "+f.cashier)
			req.Header.Set("Idempotency-Key", fmt.Sprintf("cash-race-key-%04d", n))
			response, err := f.client.Do(req)
			if err != nil {
				statuses <- 0
				return
			}
			defer response.Body.Close()
			statuses <- response.StatusCode
		}(i)
	}
	wg.Wait()
	close(statuses)
	success := 0
	for status := range statuses {
		if status == 200 {
			success++
		} else if status != 409 {
			t.Errorf("unexpected racing payment status %d", status)
		}
	}
	if success != 1 {
		t.Fatal("exactly one competing settlement must succeed")
	}
	call("DELETE", "/rooms/"+room.Data.ID, f.owner, "", nil, 200, nil)
	// A zero-value invoice must close cleanly without a fictitious payment row.
	input["room_id"] = nil
	input["discount_vnd"] = 70000
	call("POST", "/pos/orders", f.cashier, "order-create-free-0001", input, 201, &created)
	call("POST", "/pos/orders/"+created.Data.ID+"/payments", f.cashier, "cash-payment-free-0001", map[string]any{"received_vnd": 0}, 200, &second)
	if second.Data.Order.Status != "paid" || second.Data.Order.Invoice == nil || second.Data.Applied != 0 {
		t.Fatal("zero-value checkout failed")
	}
	if err := f.admin.QueryRow(context.Background(), "SELECT count(*) FROM payments WHERE order_id=$1", created.Data.ID).Scan(&count); err != nil || count != 0 {
		t.Fatal("zero-value checkout created a payment")
	}
	// Costs/prices are snapshotted from the server and survive catalog edits.
	call("POST", "/products", f.owner, "", map[string]any{"name": "Canned drink", "product_type": "goods", "price_vnd": 10000, "cost_vnd": 4000}, 201, &product)
	input["discount_vnd"] = 0
	input["items"] = []any{map[string]any{"product_id": product.Data.ID, "quantity": 1}}
	call("POST", "/pos/orders", f.cashier, "order-create-cost-0001", input, 201, &created)
	if created.Data.Items[0].Cost == nil || *created.Data.Items[0].Cost != 4000 {
		t.Fatal("server cost snapshot missing")
	}
	call("PUT", "/products/"+product.Data.ID, f.owner, "", map[string]any{"name": "Canned drink", "product_type": "goods", "price_vnd": 15000, "cost_vnd": 5000}, 200, nil)
	input["version"] = created.Data.Version
	input["items"] = []any{map[string]any{"product_id": product.Data.ID, "quantity": 2}}
	call("PUT", "/pos/orders/"+created.Data.ID, f.cashier, "order-update-cost-0001", input, 200, &updated)
	if updated.Data.Total != 20000 || updated.Data.Items[0].Cost == nil || *updated.Data.Items[0].Cost != 4000 {
		t.Fatal("catalog edit changed historical price or cost")
	}

}
