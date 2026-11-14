package inventory

import (
	"context"
	"fmt"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/modules/auth"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/shared/httpx"
	"github.com/jackc/pgx/v5"
	"math/big"
	"sort"
)

func lockProducts(ctx context.Context, tx pgx.Tx, who auth.Identity, ids []string) error {
	sort.Strings(ids)
	for _, id := range ids {
		var valid bool
		if err := tx.QueryRow(ctx, `SELECT product_type='goods' AND tracks_stock FROM products WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL FOR SHARE`, who.TenantID, id).Scan(&valid); err != nil {
			return err
		}
		if !valid {
			return httpx.Invalid("Only stock-tracked goods can be counted.")
		}
	}
	return Lock(ctx, tx, who, ids)
}
func save(ctx context.Context, tx pgx.Tx, who auth.Identity, id string, in Input) (Action, error) {
	result := Action{ID: id}
	if id != "" {
		var status string
		var version int64
		if err := tx.QueryRow(ctx, `SELECT status,version FROM stocktakes WHERE tenant_id=$1 AND store_id=$2 AND id=$3 FOR UPDATE`, who.TenantID, who.StoreID, id).Scan(&status, &version); err != nil {
			return result, err
		}
		if status != "draft" || version != in.Version {
			return result, conflict("Stocktake changed or is already posted.")
		}
	}
	ids := []string{}
	seen := map[string]bool{}
	for _, line := range in.Items {
		if !ValidQuantity(line.Counted) || seen[line.ProductID] {
			return result, httpx.Invalid("Invalid counted quantity or duplicate product.")
		}
		seen[line.ProductID] = true
		ids = append(ids, line.ProductID)
	}
	if err := lockProducts(ctx, tx, who, ids); err != nil {
		return result, err
	}
	if id == "" {
		var number int64
		if err := tx.QueryRow(ctx, `INSERT INTO entity_counters(tenant_id,entity,value) VALUES($1,'stocktake',1) ON CONFLICT(tenant_id,entity) DO UPDATE SET value=entity_counters.value+1 RETURNING value`, who.TenantID).Scan(&number); err != nil {
			return result, err
		}
		if err := tx.QueryRow(ctx, `INSERT INTO stocktakes(tenant_id,store_id,code,note,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id::text,version`, who.TenantID, who.StoreID, fmt.Sprintf("KK%06d", number), in.Note, who.UserID).Scan(&result.ID, &result.Version); err != nil {
			return result, err
		}
		id = result.ID
	} else {
		if err := tx.QueryRow(ctx, `UPDATE stocktakes SET note=$4,version=version+1,updated_at=now() WHERE tenant_id=$1 AND store_id=$2 AND id=$3 RETURNING version`, who.TenantID, who.StoreID, id, in.Note).Scan(&result.Version); err != nil {
			return result, err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM stocktake_items WHERE tenant_id=$1 AND store_id=$2 AND stocktake_id=$3`, who.TenantID, who.StoreID, id); err != nil {
			return result, err
		}
	}
	for _, line := range in.Items {
		var version int64
		if err := tx.QueryRow(ctx, `SELECT version FROM stock_balances WHERE tenant_id=$1 AND store_id=$2 AND product_id=$3`, who.TenantID, who.StoreID, line.ProductID).Scan(&version); err != nil {
			return result, err
		}
		if version != line.BalanceVersion {
			return result, conflict("Stock moved while counting. Refresh quantities before saving.")
		}
		if _, err := tx.Exec(ctx, `INSERT INTO stocktake_items(tenant_id,store_id,stocktake_id,product_id,product_name,sku,unit_name,system_quantity,counted_quantity,balance_version) SELECT $1,$2,$3,p.id,p.name,p.sku,p.base_unit,b.quantity,$5::numeric,b.version FROM products p JOIN stock_balances b ON b.tenant_id=p.tenant_id AND b.product_id=p.id AND b.store_id=$2 WHERE p.tenant_id=$1 AND p.id=$4`, who.TenantID, who.StoreID, id, line.ProductID, line.Counted); err != nil {
			return result, err
		}
	}
	return result, nil
}
func post(ctx context.Context, tx pgx.Tx, who auth.Identity, id string, expected int64) (Action, error) {
	result := Action{ID: id}
	var status string
	if err := tx.QueryRow(ctx, `SELECT status,version FROM stocktakes WHERE tenant_id=$1 AND store_id=$2 AND id=$3 FOR UPDATE`, who.TenantID, who.StoreID, id).Scan(&status, &result.Version); err != nil {
		return result, err
	}
	if status == "posted" {
		return result, nil
	}
	if expected != result.Version {
		return result, conflict("Stocktake changed. Reload before posting.")
	}
	rows, err := tx.Query(ctx, `SELECT id::text,product_id::text,unit_name,system_quantity::text,counted_quantity::text,balance_version FROM stocktake_items WHERE tenant_id=$1 AND store_id=$2 AND stocktake_id=$3 ORDER BY product_id`, who.TenantID, who.StoreID, id)
	if err != nil {
		return result, err
	}
	lines := []Item{}
	ids := []string{}
	for rows.Next() {
		var l Item
		if err = rows.Scan(&l.ID, &l.ProductID, &l.Unit, &l.System, &l.Counted, &l.BalanceVersion); err != nil {
			rows.Close()
			return result, err
		}
		lines = append(lines, l)
		ids = append(ids, l.ProductID)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return result, err
	}
	if len(lines) == 0 {
		return result, httpx.Invalid("Empty stocktake cannot be posted.")
	}
	if err = lockProducts(ctx, tx, who, ids); err != nil {
		return result, err
	}
	for _, l := range lines {
		var version int64
		var unit string
		if err = tx.QueryRow(ctx, `SELECT b.version,p.base_unit FROM stock_balances b JOIN products p ON p.tenant_id=b.tenant_id AND p.id=b.product_id WHERE b.tenant_id=$1 AND b.store_id=$2 AND b.product_id=$3`, who.TenantID, who.StoreID, l.ProductID).Scan(&version, &unit); err != nil {
			return result, err
		}
		if version != l.BalanceVersion || unit != l.Unit {
			return result, conflict("Stock or product settings changed. Refresh and recount before posting.")
		}
		counted, _ := new(big.Rat).SetString(l.Counted)
		system, _ := new(big.Rat).SetString(l.System)
		delta := counted.Sub(counted, system)
		if delta.Sign() != 0 {
			if err = Apply(ctx, tx, who, l.ProductID, delta.FloatString(6), unit, "stocktake", nil, &l.ID, nil); err != nil {
				return result, err
			}
		} else {
			if _, err = tx.Exec(ctx, `UPDATE stock_balances SET version=version+1,initialized=true,updated_at=now() WHERE tenant_id=$1 AND store_id=$2 AND product_id=$3`, who.TenantID, who.StoreID, l.ProductID); err != nil {
				return result, err
			}
		}
	}
	err = tx.QueryRow(ctx, `UPDATE stocktakes SET status='posted',version=version+1,posted_at=now(),updated_at=now() WHERE tenant_id=$1 AND store_id=$2 AND id=$3 RETURNING version`, who.TenantID, who.StoreID, id).Scan(&result.Version)
	return result, err
}
