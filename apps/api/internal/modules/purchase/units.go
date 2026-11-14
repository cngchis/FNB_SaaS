package purchase

import (
	"context"
	"math/big"
	"regexp"
	"strings"

	"github.com/cngchis/FNB_SaaS/apps/api/internal/dbgen"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/shared/httpx"
	"github.com/jackc/pgx/v5"
)

type unitSnapshot struct{ Unit, Base, Ratio, Name, SKU string }

var conversionPattern = regexp.MustCompile(`^[0-9]{1,9}(\.[0-9]{1,3})?$`)

func validRatio(value string) bool {
	if !conversionPattern.MatchString(value) {
		return false
	}
	r, ok := new(big.Rat).SetString(value)
	return ok && r.Sign() > 0
}
func sameRatio(a, b string) bool {
	if !validRatio(a) || !validRatio(b) {
		return false
	}
	x, _ := new(big.Rat).SetString(a)
	y, _ := new(big.Rat).SetString(b)
	return x.Cmp(y) == 0
}
func resolveUnit(ctx context.Context, tx pgx.Tx, tenant string, p dbgen.Product, in ItemInput, prior *unitSnapshot) (unitSnapshot, error) {
	name := strings.TrimSpace(in.Unit)
	if name == "" {
		if prior != nil {
			name = prior.Unit
		} else {
			name = p.BaseUnit
		}
	}
	snapshot := unitSnapshot{Unit: name, Base: p.BaseUnit, Ratio: "1", Name: p.Name, SKU: p.Sku}
	if prior != nil && prior.Unit == name && !in.RefreshUnit {
		snapshot = *prior
	} else if name != p.BaseUnit {
		if err := tx.QueryRow(ctx, `SELECT ratio::text FROM product_units WHERE tenant_id=$1 AND product_id=$2 AND name=$3`, tenant, p.ID, name).Scan(&snapshot.Ratio); err != nil {
			if err == pgx.ErrNoRows {
				return snapshot, httpx.Invalid("Choose a valid purchase unit.")
			}
			return snapshot, err
		}
	}
	if in.ExpectedBase != "" && in.ExpectedBase != snapshot.Base {
		return snapshot, conflict("The base unit changed. Reload the product before saving.")
	}
	if in.ExpectedRatio != "" && !sameRatio(in.ExpectedRatio, snapshot.Ratio) {
		return snapshot, conflict("The unit conversion changed. Reload the product before saving.")
	}
	return snapshot, nil
}
func baseQuantity(quantity int64, ratio string) (string, error) {
	if quantity < 1 || quantity > 1000000000 || !validRatio(ratio) {
		return "", httpx.Invalid("Invalid purchase conversion.")
	}
	r, _ := new(big.Rat).SetString(ratio)
	return r.Mul(r, new(big.Rat).SetInt64(quantity)).FloatString(6), nil
}
func baseCost(cost int64, ratio string) *int64 {
	if cost < 0 || !validRatio(ratio) {
		return nil
	}
	r, _ := new(big.Rat).SetString(ratio)
	value := new(big.Rat).Quo(new(big.Rat).SetInt64(cost), r)
	if !value.IsInt() || !value.Num().IsInt64() {
		return nil
	}
	n := value.Num().Int64()
	if n > maxMoney {
		return nil
	}
	return &n
}
