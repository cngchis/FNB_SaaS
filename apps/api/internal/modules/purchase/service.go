package purchase

import (
	"context"
	"sort"

	"github.com/cngchis/FNB_SaaS/apps/api/internal/dbgen"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/modules/auth"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/modules/inventory"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/shared/httpx"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

func validateItems(items []ItemInput) error {
	if len(items) == 0 || len(items) > 500 {
		return httpx.Invalid("Provide between 1 and 500 receipt items.")
	}
	var total int64
	seen := map[string]bool{}
	for _, item := range items {
		if item.ExpectedRatio != "" && !validRatio(item.ExpectedRatio) {
			return httpx.Invalid("Invalid expected unit ratio.")
		}
		if item.Quantity < 1 || item.Quantity > 1000000000 || item.Cost < 0 || item.Cost > maxMoney {
			return httpx.Invalid("Invalid purchase quantity or cost.")
		}
		if seen[item.ProductID] {
			return httpx.Invalid("A product may only occur once in a receipt.")
		}
		seen[item.ProductID] = true
		if item.Cost > maxMoney/item.Quantity {
			return httpx.Invalid("The line amount is too large.")
		}
		line := item.Quantity * item.Cost
		if total > maxMoney-line {
			return httpx.Invalid("The receipt total is too large.")
		}
		total += line
	}
	return nil
}
func uuid(value string) pgtype.UUID { var id pgtype.UUID; _ = id.Scan(value); return id }
func lockReceipt(ctx context.Context, tx pgx.Tx, who auth.Identity, id string) (string, int64, error) {
	var status string
	var version int64
	err := tx.QueryRow(ctx, `SELECT status,version FROM purchase_receipts WHERE tenant_id=$1 AND store_id=$2 AND id=$3 FOR UPDATE`, who.TenantID, who.StoreID, id).Scan(&status, &version)
	return status, version, err
}
func lockSupplier(ctx context.Context, tx pgx.Tx, tenant, id string) error {
	var found string
	return tx.QueryRow(ctx, `SELECT id::text FROM suppliers WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL FOR SHARE`, tenant, id).Scan(&found)
}
func save(ctx context.Context, tx pgx.Tx, who auth.Identity, id string, in Input) (Action, error) {
	var result Action
	if id != "" {
		status, version, err := lockReceipt(ctx, tx, who, id)
		if err != nil {
			return result, err
		}
		if status != "draft" {
			return result, immutable()
		}
		if version != in.Version {
			return result, conflict("The receipt changed. Reopen before saving.")
		}
	}
	if err := lockSupplier(ctx, tx, who.TenantID, in.SupplierID); err != nil {
		return result, err
	}
	// Deterministic product lock order avoids deadlocks across overlapping receipts.
	inputs := append([]ItemInput(nil), in.Items...)
	sort.Slice(inputs, func(i, j int) bool { return inputs[i].ProductID < inputs[j].ProductID })
	prior := map[string]*unitSnapshot{}
	if id != "" {
		rows, err := tx.Query(ctx, `SELECT product_id::text,unit_name,base_unit_name,unit_ratio::text,product_name,sku FROM purchase_receipt_items WHERE tenant_id=$1 AND store_id=$2 AND receipt_id=$3`, who.TenantID, who.StoreID, id)
		if err != nil {
			return result, err
		}
		for rows.Next() {
			var productID string
			var snapshot unitSnapshot
			if err = rows.Scan(&productID, &snapshot.Unit, &snapshot.Base, &snapshot.Ratio, &snapshot.Name, &snapshot.SKU); err != nil {
				rows.Close()
				return result, err
			}
			prior[productID] = &snapshot
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return result, err
		}
	}
	snapshots := make([]unitSnapshot, 0, len(inputs))
	q := dbgen.New(tx)
	var total int64
	for _, item := range inputs {
		product, err := q.LockProduct(ctx, dbgen.LockProductParams{TenantID: uuid(who.TenantID), ID: uuid(item.ProductID)})
		if err != nil {
			return result, err
		}
		if product.ProductType != "goods" || !product.TracksStock {
			return result, httpx.Invalid("Only stock-tracked goods can be received.")
		}
		snapshot, err := resolveUnit(ctx, tx, who.TenantID, product, item, prior[item.ProductID])
		if err != nil {
			return result, err
		}
		snapshots = append(snapshots, snapshot)
		total += item.Cost * item.Quantity
	}
	if id == "" {
		code, err := nextCode(ctx, tx, who.TenantID, "purchase", "PN")
		if err != nil {
			return result, err
		}
		if err := tx.QueryRow(ctx, `INSERT INTO purchase_receipts(tenant_id,store_id,supplier_id,code,total_vnd,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id::text,version`, who.TenantID, who.StoreID, in.SupplierID, code, total, in.Note, who.UserID).Scan(&result.ID, &result.Version); err != nil {
			return result, err
		}
		id = result.ID
	} else {
		if err := tx.QueryRow(ctx, `UPDATE purchase_receipts SET supplier_id=$4,total_vnd=$5,note=$6,version=version+1,updated_at=now() WHERE tenant_id=$1 AND store_id=$2 AND id=$3 RETURNING id::text,version`, who.TenantID, who.StoreID, id, in.SupplierID, total, in.Note).Scan(&result.ID, &result.Version); err != nil {
			return result, err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM purchase_receipt_items WHERE tenant_id=$1 AND store_id=$2 AND receipt_id=$3`, who.TenantID, who.StoreID, id); err != nil {
			return result, err
		}
	}
	for i, item := range inputs {
		p := snapshots[i]
		if _, err := tx.Exec(ctx, `INSERT INTO purchase_receipt_items(tenant_id,store_id,receipt_id,product_id,product_name,sku,unit_name,quantity,unit_cost_vnd,total_vnd,base_unit_name,unit_ratio) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::numeric)`, who.TenantID, who.StoreID, id, item.ProductID, p.Name, p.SKU, p.Unit, item.Quantity, item.Cost, item.Quantity*item.Cost, p.Base, p.Ratio); err != nil {
			return result, err
		}
	}
	return result, nil
}
func post(ctx context.Context, tx pgx.Tx, who auth.Identity, id string, expected int64) (Action, error) {
	status, version, err := lockReceipt(ctx, tx, who, id)
	if err != nil {
		return Action{}, err
	}
	result := Action{ID: id, Version: version}
	if status == "posted" {
		return result, nil
	}
	if expected != version {
		return result, conflict("The receipt changed. Reopen before posting.")
	}
	type line struct {
		ID, ProductID, Unit, Base, Ratio, BaseQuantity string
		Quantity, Cost                                 int64
	}
	rows, err := tx.Query(ctx, `SELECT id::text,product_id::text,unit_name,quantity,unit_cost_vnd,base_unit_name,unit_ratio::text FROM purchase_receipt_items WHERE tenant_id=$1 AND store_id=$2 AND receipt_id=$3 ORDER BY product_id`, who.TenantID, who.StoreID, id)
	if err != nil {
		return result, err
	}
	var lines []line
	for rows.Next() {
		var l line
		if err := rows.Scan(&l.ID, &l.ProductID, &l.Unit, &l.Quantity, &l.Cost, &l.Base, &l.Ratio); err != nil {
			rows.Close()
			return result, err
		}
		l.BaseQuantity, err = baseQuantity(l.Quantity, l.Ratio)
		if err != nil {
			rows.Close()
			return result, err
		}
		lines = append(lines, l)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return result, err
	}
	if len(lines) == 0 {
		return result, httpx.Invalid("An empty receipt cannot be posted.")
	}
	q := dbgen.New(tx)
	for _, l := range lines {
		product, err := q.LockProduct(ctx, dbgen.LockProductParams{TenantID: uuid(who.TenantID), ID: uuid(l.ProductID)})
		if err != nil {
			return result, err
		}
		if product.ProductType != "goods" || !product.TracksStock || product.BaseUnit != l.Base {
			return result, conflict("A product's stock settings or base unit changed. Reopen and save the draft.")
		}
	}
	ids := make([]string, 0, len(lines))
	for _, l := range lines {
		ids = append(ids, l.ProductID)
	}
	if err = inventory.Lock(ctx, tx, who, ids); err != nil {
		return result, err
	}
	for _, l := range lines {
		if _, err := tx.Exec(ctx, `INSERT INTO stock_movements(tenant_id,store_id,product_id,receipt_item_id,quantity_delta,unit_name,unit_cost_vnd,created_by) VALUES($1,$2,$3,$4,$5::numeric,$6,$7,$8)`, who.TenantID, who.StoreID, l.ProductID, l.ID, l.BaseQuantity, l.Base, baseCost(l.Cost, l.Ratio), who.UserID); err != nil {
			return result, err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO stock_balances(tenant_id,store_id,product_id,quantity) VALUES($1,$2,$3,$4::numeric) ON CONFLICT(tenant_id,store_id,product_id) DO UPDATE SET quantity=stock_balances.quantity+excluded.quantity,version=stock_balances.version+1,updated_at=now()`, who.TenantID, who.StoreID, l.ProductID, l.BaseQuantity); err != nil {
			return result, err
		}
	}
	err = tx.QueryRow(ctx, `UPDATE purchase_receipts SET status='posted',posted_by=$4,posted_at=now(),version=version+1,updated_at=now() WHERE tenant_id=$1 AND store_id=$2 AND id=$3 RETURNING version`, who.TenantID, who.StoreID, id, who.UserID).Scan(&result.Version)
	return result, err
}
