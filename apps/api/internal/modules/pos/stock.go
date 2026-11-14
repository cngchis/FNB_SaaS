package pos

import (
	"context"
	"math/big"
	"sort"

	"github.com/cngchis/FNB_SaaS/apps/api/internal/modules/auth"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/modules/inventory"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/shared/httpx"
	"github.com/jackc/pgx/v5"
)

func snapshotStock(ctx context.Context, tx pgx.Tx, who auth.Identity, line *Line) error {
	return tx.QueryRow(ctx, `SELECT product_type='goods' AND tracks_stock,base_unit,CASE WHEN $3='' OR $3=base_unit THEN '1' ELSE (SELECT u.ratio::text FROM product_units u WHERE u.tenant_id=p.tenant_id AND u.product_id=p.id AND u.name=$3) END FROM products p WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL FOR SHARE`, who.TenantID, line.ProductID, line.Unit).Scan(&line.StockTracked, &line.StockBase, &line.StockRatio)
}

// Quantities are exact rational numbers, serialized to the ledger's six decimal
// places. Unit ratios are snapshotted when ordering, never read at payment time.
func stockDeltas(old, lines []Line) (map[string]*big.Rat, map[string]string, error) {
	deltas := map[string]*big.Rat{}
	units := map[string]string{}
	add := func(items []Line, sign int64) error {
		for _, line := range items {
			if !line.StockTracked {
				continue
			}
			if line.StockRatio == nil {
				return &httpx.PublicError{Status: 409, Code: "stock_snapshot_missing", Message: "Recreate the legacy order with valid units before payment."}
			}
			ratio, ok := new(big.Rat).SetString(*line.StockRatio)
			if !ok || ratio.Sign() <= 0 {
				return httpx.Invalid("Invalid stock conversion snapshot.")
			}
			quantity := new(big.Rat).Mul(ratio, new(big.Rat).SetInt64(line.Quantity*sign))
			if deltas[line.ProductID] == nil {
				deltas[line.ProductID] = new(big.Rat)
			}
			deltas[line.ProductID].Add(deltas[line.ProductID], quantity)
			units[line.ProductID] = line.StockBase
		}
		return nil
	}
	if err := add(old, 1); err != nil {
		return nil, nil, err
	}
	if err := add(lines, -1); err != nil {
		return nil, nil, err
	}
	return deltas, units, nil
}
func postStock(ctx context.Context, tx pgx.Tx, who auth.Identity, id string, old, lines []Line) error {
	deltas, units, err := stockDeltas(old, lines)
	if err != nil {
		return err
	}
	ids := []string{}
	for product, delta := range deltas {
		if delta.Sign() != 0 {
			ids = append(ids, product)
		}
	}
	sort.Strings(ids)
	// Product locks precede balance locks, just as in receiving and stocktaking.
	for _, product := range ids {
		var found string
		if err = tx.QueryRow(ctx, `SELECT id::text FROM products WHERE tenant_id=$1 AND id=$2 FOR SHARE`, who.TenantID, product).Scan(&found); err != nil {
			return err
		}
	}
	if err = inventory.Lock(ctx, tx, who, ids); err != nil {
		return err
	}
	for _, product := range ids {
		var initialized bool
		if err = tx.QueryRow(ctx, `SELECT initialized FROM stock_balances WHERE tenant_id=$1 AND store_id=$2 AND product_id=$3`, who.TenantID, who.StoreID, product).Scan(&initialized); err != nil {
			return err
		}
		if !initialized {
			return &httpx.PublicError{Status: 409, Code: "stock_uninitialized", Message: "Count opening stock for legacy goods before selling."}
		}
		if err = inventory.Apply(ctx, tx, who, product, deltas[product].FloatString(6), units[product], "sale", &id, nil, nil); err != nil {
			return err
		}
	}
	return nil
}
