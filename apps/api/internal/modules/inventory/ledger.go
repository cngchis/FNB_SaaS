package inventory

import (
	"context"
	"sort"

	"github.com/cngchis/FNB_SaaS/apps/api/internal/modules/auth"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/shared/httpx"
	"github.com/jackc/pgx/v5"
)

// Lock balances in product order across every writer. Even a missing balance is
// materialized and locked, so concurrent first sales cannot both spend it.
func Lock(ctx context.Context, tx pgx.Tx, who auth.Identity, ids []string) error {
	sort.Strings(ids)
	for _, id := range ids {
		if _, err := tx.Exec(ctx, `INSERT INTO stock_balances(tenant_id,store_id,product_id,initialized) SELECT $1,$2,p.id,p.created_at>=s.inventory_started_at FROM products p JOIN stores s ON s.tenant_id=p.tenant_id AND s.id=$2 WHERE p.tenant_id=$1 AND p.id=$3 ON CONFLICT DO NOTHING`, who.TenantID, who.StoreID, id); err != nil {
			return err
		}
		var quantity string
		if err := tx.QueryRow(ctx, `SELECT quantity::text FROM stock_balances WHERE tenant_id=$1 AND store_id=$2 AND product_id=$3 FOR UPDATE`, who.TenantID, who.StoreID, id).Scan(&quantity); err != nil {
			return err
		}
	}
	return nil
}

// Apply is called only after Lock and inside the business transaction. A failed
// decrement rolls back the order/payment, ledger, balance and idempotency key.
func Apply(ctx context.Context, tx pgx.Tx, who auth.Identity, product, delta, unit, kind string, order, stocktake *string, cost *int64) error {
	tag, err := tx.Exec(ctx, `UPDATE stock_balances SET quantity=quantity+$4::numeric,version=version+1,initialized=initialized OR $5,updated_at=now() WHERE tenant_id=$1 AND store_id=$2 AND product_id=$3 AND quantity+$4::numeric>=0 AND (initialized OR $5)`, who.TenantID, who.StoreID, product, delta, kind == "stocktake")
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return &httpx.PublicError{Status: 409, Code: "insufficient_stock", Message: "Insufficient stock. Receive or count stock before selling."}
	}
	_, err = tx.Exec(ctx, `INSERT INTO stock_movements(tenant_id,store_id,product_id,quantity_delta,unit_name,unit_cost_vnd,kind,order_id,stocktake_item_id,created_by) VALUES($1,$2,$3,$4::numeric,$5,$6,$7,$8,$9,$10)`, who.TenantID, who.StoreID, product, delta, unit, cost, kind, order, stocktake, who.UserID)
	return err
}
