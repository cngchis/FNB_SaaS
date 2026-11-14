package pos

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/cngchis/FNB_SaaS/apps/api/internal/modules/auth"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/shared/httpx"
	"github.com/jackc/pgx/v5"
)

// The database transaction owns pricing, optimistic revisions, room occupancy,
// idempotency and payment state. No client totals or display strings are trusted.
func readOrders(ctx context.Context, tx pgx.Tx, who auth.Identity, id *string, state string, limit, offset int32) ([]Order, error) {
	rows, err := tx.Query(ctx, `SELECT o.id::text,o.order_code,o.room_id::text,coalesce(r.name,'Mang về'),o.customer_id::text,coalesce(c.name,'Khách lẻ'),o.note,o.status,o.version,o.subtotal_vnd,o.discount_vnd,o.total_vnd,
 coalesce((SELECT sum(p.amount_vnd) FROM payments p WHERE p.tenant_id=o.tenant_id AND p.store_id=o.store_id AND p.order_id=o.id AND p.status='succeeded'),0)::bigint,
 i.code,o.created_at,o.updated_at FROM orders o LEFT JOIN rooms r ON r.tenant_id=o.tenant_id AND r.store_id=o.store_id AND r.id=o.room_id
 LEFT JOIN customers c ON c.tenant_id=o.tenant_id AND c.id=o.customer_id LEFT JOIN invoices i ON i.tenant_id=o.tenant_id AND i.store_id=o.store_id AND i.order_id=o.id
 WHERE o.tenant_id=$1 AND o.store_id=$2 AND o.deleted_at IS NULL AND ($3::uuid IS NULL OR o.id=$3)
 AND ($4='all' OR ($4='open' AND o.status IN ('open','estimated','pending_payment')) OR ($4='history' AND i.id IS NOT NULL))
 ORDER BY o.updated_at DESC,o.id LIMIT $5 OFFSET $6`, who.TenantID, who.StoreID, id, state, limit, offset)
	if err != nil {
		return nil, err
	}
	orders := []Order{}
	ids := []string{}
	positions := map[string]int{}
	for rows.Next() {
		var o Order
		if err := rows.Scan(&o.ID, &o.Code, &o.RoomID, &o.Room, &o.CustomerID, &o.Customer, &o.Note, &o.Status, &o.Version, &o.Subtotal, &o.Discount, &o.Total, &o.Paid, &o.Invoice, &o.CreatedAt, &o.UpdatedAt); err != nil {
			rows.Close()
			return nil, err
		}
		o.Items = []Line{}
		positions[o.ID] = len(orders)
		ids = append(ids, o.ID)
		orders = append(orders, o)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return orders, nil
	}
	lines, err := tx.Query(ctx, `SELECT order_id::text,product_id::text,line_key,product_name,coalesce(sku,''),quantity::bigint,unit_name,attributes,unit_price_vnd,line_total_vnd,unit_cost_vnd,stock_tracked,stock_ratio::text,stock_base_unit FROM order_items WHERE tenant_id=$1 AND store_id=$2 AND order_id=ANY($3::uuid[]) ORDER BY created_at,id`, who.TenantID, who.StoreID, ids)
	if err != nil {
		return nil, err
	}
	defer lines.Close()
	for lines.Next() {
		var oid string
		var l Line
		var attrs []byte
		if err := lines.Scan(&oid, &l.ProductID, &l.Key, &l.Name, &l.SKU, &l.Quantity, &l.Unit, &attrs, &l.Price, &l.Amount, &l.Cost, &l.StockTracked, &l.StockRatio, &l.StockBase); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(attrs, &l.Attributes); err != nil {
			return nil, err
		}
		n := positions[oid]
		orders[n].Items = append(orders[n].Items, l)
	}
	return orders, lines.Err()
}
func readOne(ctx context.Context, tx pgx.Tx, who auth.Identity, id string) (Order, error) {
	rows, err := readOrders(ctx, tx, who, &id, "all", 1, 0)
	if err != nil {
		return Order{}, err
	}
	if len(rows) == 0 {
		return Order{}, httpx.Missing()
	}
	return rows[0], nil
}
func counter(ctx context.Context, tx pgx.Tx, tenant, entity, prefix string) (string, error) {
	var n int64
	err := tx.QueryRow(ctx, `INSERT INTO entity_counters(tenant_id,entity,value) VALUES($1,$2,1) ON CONFLICT(tenant_id,entity) DO UPDATE SET value=entity_counters.value+1 RETURNING value`, tenant, entity).Scan(&n)
	return fmt.Sprintf("%s%06d", prefix, n), err
}

func replay(ctx context.Context, tx pgx.Tx, who auth.Identity, operation, key string, input any, output any) (bool, error) {
	encoded, err := json.Marshal(input)
	if err != nil {
		return false, err
	}
	sum := sha256.Sum256(encoded)
	hash := hex.EncodeToString(sum[:])
	_, err = tx.Exec(ctx, `INSERT INTO api_requests(tenant_id,store_id,operation,key,request_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`, who.TenantID, who.StoreID, operation, key, hash)
	if err != nil {
		return false, err
	}
	var priorHash string
	var response []byte
	err = tx.QueryRow(ctx, `SELECT request_hash,response FROM api_requests WHERE tenant_id=$1 AND store_id=$2 AND operation=$3 AND key=$4 FOR UPDATE`, who.TenantID, who.StoreID, operation, key).Scan(&priorHash, &response)
	if err != nil {
		return false, err
	}
	if priorHash != hash {
		return false, conflict("The idempotency key was already used for a different payload.")
	}
	if response == nil {
		return false, nil
	}
	return true, json.Unmarshal(response, output)
}
func complete(ctx context.Context, tx pgx.Tx, who auth.Identity, operation, key string, output any) error {
	data, err := json.Marshal(output)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `UPDATE api_requests SET response=$5::jsonb WHERE tenant_id=$1 AND store_id=$2 AND operation=$3 AND key=$4`, who.TenantID, who.StoreID, operation, key, data)
	return err
}

// Existing order lines retain snapshots; increasing them requires a saleable unit.
func checkUnitSale(ctx context.Context, tx pgx.Tx, who auth.Identity, in LineInput) error {
	var saleable bool
	err := tx.QueryRow(ctx, `SELECT p.availability='available' AND CASE WHEN $3='' OR $3=p.base_unit THEN p.is_visible ELSE COALESCE((SELECT u.is_visible FROM product_units u WHERE u.tenant_id=p.tenant_id AND u.product_id=p.id AND u.name=$3),false) END FROM products p WHERE p.tenant_id=$1 AND p.id=$2 AND p.deleted_at IS NULL FOR SHARE`, who.TenantID, in.ProductID, in.Unit).Scan(&saleable)
	if err != nil {
		return err
	}
	if !saleable {
		return httpx.Invalid("Product unit is not available for sale.")
	}
	return nil
}

func priceLine(ctx context.Context, tx pgx.Tx, who auth.Identity, in LineInput, old map[string]Line) (Line, error) {
	sort.Slice(in.Attributes, func(i, j int) bool { return in.Attributes[i].Name < in.Attributes[j].Name })
	if in.Attributes == nil {
		in.Attributes = []Attribute{}
	}
	canonical, _ := json.Marshal(struct {
		Product    string
		Unit       string
		Attributes []Attribute
	}{in.ProductID, in.Unit, in.Attributes})
	sum := sha256.Sum256(canonical)
	line := Line{LineInput: in, Key: hex.EncodeToString(sum[:])}
	if prior, ok := old[line.Key]; ok {
		if in.Quantity > prior.Quantity {
			if err := checkUnitSale(ctx, tx, who, in); err != nil {
				return line, err
			}
		}
		line.Name = prior.Name
		line.SKU = prior.SKU
		line.Price = prior.Price
		line.Cost = prior.Cost
		line.StockTracked = prior.StockTracked
		line.StockRatio = prior.StockRatio
		line.StockBase = prior.StockBase
		var err error
		line.Amount, err = lineAmount(line.Price, line.Quantity)
		return line, err
	}
	var visible bool
	var available string
	var base string
	err := tx.QueryRow(ctx, `SELECT name,sku,price_vnd,base_unit,is_visible,availability,cost_vnd FROM products WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL FOR SHARE`, who.TenantID, in.ProductID).Scan(&line.Name, &line.SKU, &line.Price, &base, &visible, &available, &line.Cost)
	if err != nil {
		return line, err
	}
	if available != "available" {
		return line, httpx.Invalid("Product is not available for sale.")
	}
	if in.Unit != "" && in.Unit != base {
		err = tx.QueryRow(ctx, `SELECT price_vnd,cost_vnd,is_visible FROM product_units WHERE tenant_id=$1 AND product_id=$2 AND name=$3`, who.TenantID, in.ProductID, in.Unit).Scan(&line.Price, &line.Cost, &visible)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return line, httpx.Invalid("Choose a valid product unit.")
			}
			return line, err
		}
		line.Name += " · " + in.Unit
	}
	if !visible {
		return line, httpx.Invalid("Product unit is not available for sale.")
	}
	seen := map[string]bool{}
	for _, a := range in.Attributes {
		if seen[a.Name] {
			return line, httpx.Invalid("Choose only one option for each attribute.")
		}
		seen[a.Name] = true
		var delta int64
		err = tx.QueryRow(ctx, `SELECT price_delta_vnd FROM product_variants WHERE tenant_id=$1 AND product_id=$2 AND name=$3 AND (value=$4 OR $4=ANY(string_to_array(replace(value,', ',','),','))) AND deleted_at IS NULL LIMIT 1`, who.TenantID, in.ProductID, a.Name, a.Value).Scan(&delta)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return line, httpx.Invalid("Choose a valid product attribute.")
			}
			return line, err
		}
		if delta > 0 && line.Price > maxMoney-delta || delta < 0 && line.Price < -delta {
			return line, httpx.Invalid("Invalid option price.")
		}
		line.Price += delta
		line.Name += " · " + a.Name + " " + a.Value
	}
	if err = snapshotStock(ctx, tx, who, &line); err != nil {
		return line, err
	}
	line.Amount, err = lineAmount(line.Price, in.Quantity)
	return line, err
}

func saveOrder(ctx context.Context, tx pgx.Tx, who auth.Identity, id *string, in Input, key string) (Order, error) {
	operation := "order:create"
	if id != nil {
		operation = "order:update:" + *id
	}
	var result Order
	done, err := replay(ctx, tx, who, operation, key, in, &result)
	if err != nil || done {
		return result, err
	}
	// Room rows are locked before order rows consistently with room CRUD.
	if in.RoomID != nil {
		var found string
		if err := tx.QueryRow(ctx, `SELECT id::text FROM rooms WHERE tenant_id=$1 AND store_id=$2 AND id=$3 AND deleted_at IS NULL FOR UPDATE`, who.TenantID, who.StoreID, in.RoomID).Scan(&found); err != nil {
			return result, err
		}
	}
	if in.CustomerID != nil {
		var found string
		if err := tx.QueryRow(ctx, `SELECT id::text FROM customers WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL FOR SHARE`, who.TenantID, in.CustomerID).Scan(&found); err != nil {
			return result, err
		}
	}
	old := map[string]Line{}
	version := int64(1)
	paid := int64(0)
	stockPosted := false
	priorLines := []Line{}
	if id != nil {
		var currentVersion int64
		var status string
		err = tx.QueryRow(ctx, `SELECT version,status,stock_posted_at IS NOT NULL FROM orders WHERE tenant_id=$1 AND store_id=$2 AND id=$3 AND deleted_at IS NULL FOR UPDATE`, who.TenantID, who.StoreID, *id).Scan(&currentVersion, &status, &stockPosted)
		if err != nil {
			return result, err
		}
		if currentVersion != in.Version {
			return result, conflict("The order changed. Reload before saving.")
		}
		if status == "paid" || status == "cancelled" || status == "refunded" {
			return result, conflict("This order can no longer be edited.")
		}
		prior, err := readOne(ctx, tx, who, *id)
		if err != nil {
			return result, err
		}
		// Issued receivables cannot silently move to another customer.
		if prior.Invoice != nil && ((prior.CustomerID == nil) != (in.CustomerID == nil) || (prior.CustomerID != nil && in.CustomerID != nil && *prior.CustomerID != *in.CustomerID)) {
			return result, conflict("An issued invoice cannot be reassigned to a different customer.")
		}
		paid = prior.Paid
		priorLines = prior.Items
		for _, line := range prior.Items {
			old[line.Key] = line
		}
		version = currentVersion + 1
	}
	lines := []Line{}
	subtotal := int64(0)
	seen := map[string]bool{}
	// Lock in UUID order without changing the cashier's item display order.
	productIDs := make([]string, 0, len(in.Items))
	for _, entry := range in.Items {
		productIDs = append(productIDs, entry.ProductID)
	}
	sort.Strings(productIDs)
	for _, productID := range productIDs {
		var found string
		if err := tx.QueryRow(ctx, `SELECT id::text FROM products WHERE tenant_id=$1 AND id=$2 FOR SHARE`, who.TenantID, productID).Scan(&found); err != nil {
			return result, err
		}
	}
	for _, entry := range in.Items {
		line, err := priceLine(ctx, tx, who, entry, old)
		if err != nil {
			return result, err
		}
		if seen[line.Key] {
			return result, httpx.Invalid("Merge duplicate product selections before saving.")
		}
		seen[line.Key] = true
		if subtotal > maxMoney-line.Amount {
			return result, httpx.Invalid("Order amount is too large.")
		}
		subtotal += line.Amount
		lines = append(lines, line)
	}
	if in.Discount > subtotal || subtotal-in.Discount < paid {
		return result, httpx.Invalid("Discount or total cannot invalidate received payments.")
	}
	status := "estimated"
	if paid > 0 {
		status = "pending_payment"
	}
	orderType := "takeaway"
	if in.RoomID != nil {
		orderType = "dine_in"
	}
	var oid string
	if id == nil {
		var code string
		code, err = counter(ctx, tx, who.TenantID, "order", "DH")
		if err != nil {
			return result, err
		}
		err = tx.QueryRow(ctx, `INSERT INTO orders(tenant_id,store_id,customer_id,order_code,order_type,status,subtotal_vnd,discount_vnd,total_vnd,idempotency_key,created_by,room_id,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id::text`, who.TenantID, who.StoreID, in.CustomerID, code, orderType, status, subtotal, in.Discount, subtotal-in.Discount, key, who.UserID, in.RoomID, in.Note).Scan(&oid)
	} else {
		oid = *id
		_, err = tx.Exec(ctx, `UPDATE orders SET customer_id=$4,room_id=$5,note=$6,subtotal_vnd=$7,discount_vnd=$8,total_vnd=$9,status=$10,version=$11,order_type=$12,updated_at=now() WHERE tenant_id=$1 AND store_id=$2 AND id=$3`, who.TenantID, who.StoreID, oid, in.CustomerID, in.RoomID, in.Note, subtotal, in.Discount, subtotal-in.Discount, status, version, orderType)
	}
	if err != nil {
		return result, err
	}
	var round string
	err = tx.QueryRow(ctx, `INSERT INTO order_rounds(tenant_id,store_id,order_id,revision,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id::text`, who.TenantID, who.StoreID, oid, version, who.UserID).Scan(&round)
	if err != nil {
		return result, err
	}
	if _, err = tx.Exec(ctx, `DELETE FROM order_items WHERE tenant_id=$1 AND store_id=$2 AND order_id=$3`, who.TenantID, who.StoreID, oid); err != nil {
		return result, err
	}
	deltas := map[string]Line{}
	for k, l := range old {
		l.Quantity = -l.Quantity
		deltas[k] = l
	}
	for _, l := range lines {
		attrs, _ := json.Marshal(l.Attributes)
		_, err = tx.Exec(ctx, `INSERT INTO order_items(tenant_id,store_id,order_id,product_id,product_name,sku,quantity,unit_price_vnd,line_total_vnd,line_key,unit_name,attributes,unit_cost_vnd,stock_tracked,stock_ratio,stock_base_unit) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15::numeric,$16)`, who.TenantID, who.StoreID, oid, l.ProductID, l.Name, l.SKU, l.Quantity, l.Price, l.Amount, l.Key, l.Unit, attrs, l.Cost, l.StockTracked, l.StockRatio, l.StockBase)
		if err != nil {
			return result, err
		}
		delta := l
		delta.Quantity += deltas[l.Key].Quantity
		deltas[l.Key] = delta
	}
	for _, l := range deltas {
		if l.Quantity == 0 {
			continue
		}
		_, err = tx.Exec(ctx, `INSERT INTO order_round_items(tenant_id,store_id,round_id,product_id,line_key,product_name,quantity_delta,unit_price_vnd,unit_cost_vnd,unit_name,attributes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`, who.TenantID, who.StoreID, round, l.ProductID, l.Key, l.Name, l.Quantity, l.Price, l.Cost, l.Unit, func() []byte { data, _ := json.Marshal(l.Attributes); return data }())
		if err != nil {
			return result, err
		}
	}
	if stockPosted {
		if err = postStock(ctx, tx, who, oid, priorLines, lines); err != nil {
			return result, err
		}
	}
	result, err = readOne(ctx, tx, who, oid)
	if err != nil {
		return result, err
	}
	return result, complete(ctx, tx, who, operation, key, result)
}

func payCash(ctx context.Context, tx pgx.Tx, who auth.Identity, id, key string, received int64) (Payment, error) {
	var result Payment
	operation := "cash:" + id
	done, err := replay(ctx, tx, who, operation, key, received, &result)
	if err != nil || done {
		return result, err
	}
	var locked string
	err = tx.QueryRow(ctx, `SELECT id::text FROM orders WHERE tenant_id=$1 AND store_id=$2 AND id=$3 AND deleted_at IS NULL FOR UPDATE`, who.TenantID, who.StoreID, id).Scan(&locked)
	if err != nil {
		return result, err
	}
	order, err := readOne(ctx, tx, who, id)
	if err != nil {
		return result, err
	}
	if order.Status == "paid" || order.Status == "cancelled" || order.Status == "refunded" {
		return result, conflict("Order is already closed.")
	}
	due := order.Total - order.Paid
	if due < 0 || (due > 0 && received <= 0) {
		return result, httpx.Invalid("No payment is due.")
	}
	amount := received
	if amount > due {
		amount = due
	}
	var alreadyPosted bool
	if err = tx.QueryRow(ctx, `SELECT stock_posted_at IS NOT NULL FROM orders WHERE tenant_id=$1 AND store_id=$2 AND id=$3`, who.TenantID, who.StoreID, id).Scan(&alreadyPosted); err != nil {
		return result, err
	}
	if !alreadyPosted {
		if err = postStock(ctx, tx, who, id, nil, order.Items); err != nil {
			return result, err
		}
		if _, err = tx.Exec(ctx, `UPDATE orders SET stock_posted_at=now() WHERE tenant_id=$1 AND store_id=$2 AND id=$3`, who.TenantID, who.StoreID, id); err != nil {
			return result, err
		}
	}
	if amount > 0 {
		var method string
		err = tx.QueryRow(ctx, `SELECT id::text FROM payment_methods WHERE tenant_id=$1 AND store_id=$2 AND method_type='cash' AND is_active AND deleted_at IS NULL ORDER BY created_at LIMIT 1`, who.TenantID, who.StoreID).Scan(&method)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return result, httpx.Invalid("Configure an active cash payment method.")
			}
			return result, err
		}
		receiptCode, codeErr := counter(ctx, tx, who.TenantID, "cashbook", "TTHD")
		if codeErr != nil {
			return result, codeErr
		}
		_, err = tx.Exec(ctx, `INSERT INTO payments(tenant_id,store_id,order_id,payment_method_id,amount_vnd,status,idempotency_key,receipt_code,created_by) VALUES($1,$2,$3,$4,$5,'succeeded',$6,$7,$8)`, who.TenantID, who.StoreID, id, method, amount, key, receiptCode, who.UserID)
		if err != nil {
			return result, err
		}
	}
	status := "pending_payment"
	if order.Paid+amount == order.Total {
		status = "paid"
	}
	if _, err = tx.Exec(ctx, `UPDATE orders SET status=$4,version=version+1,updated_at=now() WHERE tenant_id=$1 AND store_id=$2 AND id=$3`, who.TenantID, who.StoreID, id, status); err != nil {
		return result, err
	}
	if order.Invoice == nil {
		code, err := counter(ctx, tx, who.TenantID, "invoice", "HD")
		if err != nil {
			return result, err
		}
		if _, err = tx.Exec(ctx, `INSERT INTO invoices(tenant_id,store_id,order_id,code) VALUES($1,$2,$3,$4)`, who.TenantID, who.StoreID, id, code); err != nil {
			return result, err
		}
	}
	result.Order, err = readOne(ctx, tx, who, id)
	if err != nil {
		return result, err
	}
	result.Received = received
	result.Applied = amount
	result.Change = received - amount
	return result, complete(ctx, tx, who, operation, key, result)
}

func validKey(key string) bool {
	if len(key) < 16 || len(key) > 100 {
		return false
	}
	return strings.IndexFunc(key, func(r rune) bool {
		return !(r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '-' || r == '_')
	}) < 0
}
