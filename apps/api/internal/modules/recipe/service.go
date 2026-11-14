package recipe

import (
	"context"
	"encoding/json"
	"errors"
	"sort"

	"github.com/cngchis/FNB_SaaS/apps/api/internal/shared/httpx"
	"github.com/jackc/pgx/v5"
)

func conflict(message string) error {
	return &httpx.PublicError{Status: 409, Code: "recipe_conflict", Message: message}
}

func read(ctx context.Context, tx pgx.Tx, tenant, product string) ([]Recipe, error) {
	rows, err := tx.Query(ctx, `SELECT id::text,version,unit_name,attributes FROM product_recipes WHERE tenant_id=$1 AND product_id=$2 ORDER BY created_at,id`, tenant, product)
	if err != nil {
		return nil, err
	}
	result := []Recipe{}
	for rows.Next() {
		var r Recipe
		var attrs []byte
		if err = rows.Scan(&r.ID, &r.Version, &r.Unit, &attrs); err != nil {
			rows.Close()
			return nil, err
		}
		if err = json.Unmarshal(attrs, &r.Attributes); err != nil {
			rows.Close()
			return nil, err
		}
		result = append(result, r)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	for i := range result {
		if err = ingredients(ctx, tx, tenant, &result[i].Snapshot); err != nil {
			return nil, err
		}
	}
	return result, nil
}
func ingredients(ctx context.Context, tx pgx.Tx, tenant string, s *Snapshot) error {
	rows, err := tx.Query(ctx, `SELECT i.product_id::text,i.quantity::text,i.base_unit,p.name,p.sku,p.cost_vnd FROM recipe_ingredients i JOIN products p ON p.tenant_id=i.tenant_id AND p.id=i.product_id WHERE i.tenant_id=$1 AND i.recipe_id=$2 ORDER BY i.product_id`, tenant, s.ID)
	if err != nil {
		return err
	}
	defer rows.Close()
	s.Ingredients = []Ingredient{}
	for rows.Next() {
		var i Ingredient
		if err = rows.Scan(&i.ProductID, &i.Quantity, &i.BaseUnit, &i.Name, &i.SKU, &i.Cost); err != nil {
			return err
		}
		s.Ingredients = append(s.Ingredients, i)
	}
	return rows.Err()
}

func save(ctx context.Context, tx pgx.Tx, tenant, product string, in Input) (Recipe, error) {
	var result Recipe
	var kind, base string
	if err := tx.QueryRow(ctx, `SELECT product_type,base_unit FROM products WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE`, tenant, product).Scan(&kind, &base); err != nil {
		return result, err
	}
	if kind != "prepared" {
		return result, httpx.Invalid("Recipes are only available for prepared products.")
	}
	if in.Unit != base {
		var exists bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM product_units WHERE tenant_id=$1 AND product_id=$2 AND name=$3)`, tenant, product, in.Unit).Scan(&exists); err != nil {
			return result, err
		}
		if !exists {
			return result, httpx.Invalid("Choose a valid recipe unit.")
		}
	}
	for _, a := range in.Attributes {
		var exists bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM product_variants WHERE tenant_id=$1 AND product_id=$2 AND name=$3 AND (value=$4 OR $4=ANY(string_to_array(replace(value,', ',','),','))) AND deleted_at IS NULL)`, tenant, product, a.Name, a.Value).Scan(&exists); err != nil {
			return result, err
		}
		if !exists {
			return result, httpx.Invalid("Choose valid recipe attributes.")
		}
	}
	key := SelectionKey(in.Unit, in.Attributes)
	err := tx.QueryRow(ctx, `SELECT id::text,version FROM product_recipes WHERE tenant_id=$1 AND product_id=$2 AND selection_key=$3 FOR UPDATE`, tenant, product, key).Scan(&result.ID, &result.Version)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return result, err
	}
	if result.Version != in.Version {
		return result, conflict("The recipe changed. Reload before saving.")
	}
	ordered := append([]IngredientInput{}, in.Ingredients...)
	sort.Slice(ordered, func(i, j int) bool { return ordered[i].ProductID < ordered[j].ProductID })
	for _, i := range ordered {
		var valid bool
		var unit string
		if i.ProductID == product {
			return result, httpx.Invalid("A product cannot consume itself.")
		}
		if err = tx.QueryRow(ctx, `SELECT product_type='goods' AND tracks_stock,base_unit FROM products WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL FOR SHARE`, tenant, i.ProductID).Scan(&valid, &unit); err != nil {
			return result, err
		}
		if !valid || unit != i.BaseUnit {
			return result, httpx.Invalid("Ingredients must be active stock-tracked goods in their current base units.")
		}
	}
	attrs, _ := json.Marshal(in.Attributes)
	if result.ID == "" {
		var count int
		if err = tx.QueryRow(ctx, `SELECT count(*) FROM product_recipes WHERE tenant_id=$1 AND product_id=$2`, tenant, product).Scan(&count); err != nil {
			return result, err
		}
		if count >= 200 {
			return result, httpx.Invalid("A product supports at most 200 recipe selections.")
		}
		err = tx.QueryRow(ctx, `INSERT INTO product_recipes(tenant_id,product_id,selection_key,unit_name,attributes) VALUES($1,$2,$3,$4,$5::jsonb) RETURNING id::text,version`, tenant, product, key, in.Unit, attrs).Scan(&result.ID, &result.Version)
	} else {
		err = tx.QueryRow(ctx, `UPDATE product_recipes SET version=version+1,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING version`, tenant, result.ID).Scan(&result.Version)
		if err == nil {
			_, err = tx.Exec(ctx, `DELETE FROM recipe_ingredients WHERE tenant_id=$1 AND recipe_id=$2`, tenant, result.ID)
		}
	}
	if err != nil {
		return result, err
	}
	for _, i := range ordered {
		if _, err = tx.Exec(ctx, `INSERT INTO recipe_ingredients(tenant_id,recipe_id,product_id,base_unit,quantity) VALUES($1,$2,$3,$4,$5::numeric)`, tenant, result.ID, i.ProductID, i.BaseUnit, i.Quantity); err != nil {
			return result, err
		}
	}
	result.Unit = in.Unit
	result.Attributes = in.Attributes
	return result, ingredients(ctx, tx, tenant, &result.Snapshot)
}

// Resolve freezes a whole recipe for one sold unit. Exact selection wins over
// the same unit's default recipe. Never multiply a different unit's recipe.
func Resolve(ctx context.Context, tx pgx.Tx, tenant, product, unit string, attrs []Attribute) (*Snapshot, error) {
	var result Snapshot
	err := tx.QueryRow(ctx, `SELECT id::text,version FROM product_recipes WHERE tenant_id=$1 AND product_id=$2 AND selection_key IN ($3,$4) ORDER BY (selection_key=$3) DESC LIMIT 1`, tenant, product, SelectionKey(unit, attrs), SelectionKey(unit, nil)).Scan(&result.ID, &result.Version)
	if errors.Is(err, pgx.ErrNoRows) {
		var configured bool
		if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM product_recipes WHERE tenant_id=$1 AND product_id=$2)`, tenant, product).Scan(&configured); err != nil {
			return nil, err
		}
		if configured {
			return nil, &httpx.PublicError{Status: 409, Code: "recipe_missing", Message: "Configure a recipe for the selected unit and attributes before selling."}
		}
		// Legacy/unconfigured prepared items retain their existing behavior until
		// an owner enables recipes by saving the first configuration.
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if err = ingredients(ctx, tx, tenant, &result); err != nil {
		return nil, err
	}
	if len(result.Ingredients) == 0 {
		return nil, conflict("The recipe has no ingredients.")
	}
	return &result, nil
}
