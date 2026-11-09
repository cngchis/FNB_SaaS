-- name: NextProductNumber :one
INSERT INTO entity_counters (tenant_id, entity, value) VALUES (sqlc.arg(tenant_id), 'product', 1)
ON CONFLICT (tenant_id, entity) DO UPDATE SET value = entity_counters.value + 1 RETURNING value;

-- name: ListProductCategories :many
SELECT * FROM product_categories WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name, id;

-- name: GetProductCategory :one
SELECT * FROM product_categories WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL FOR SHARE;

-- name: CreateProductCategory :one
INSERT INTO product_categories (tenant_id, name) VALUES ($1, $2) RETURNING *;

-- name: UpdateProductCategory :one
UPDATE product_categories SET name = $3, updated_at = now() WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING *;

-- name: DeleteProductCategory :execrows
UPDATE product_categories SET deleted_at = now(), updated_at = now() WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL;

-- name: DetachProductCategory :exec
UPDATE products SET category_id = NULL, updated_at = now() WHERE tenant_id = $1 AND category_id = $2;

-- name: CountProducts :one
SELECT count(*) FROM products p
WHERE p.tenant_id = sqlc.arg(tenant_id) AND p.deleted_at IS NULL
AND (p.name ILIKE sqlc.arg(search) OR p.sku ILIKE sqlc.arg(search))
AND (sqlc.narg(category_id)::uuid IS NULL OR p.category_id = sqlc.narg(category_id))
AND (sqlc.arg(product_type)::text = '' OR p.product_type = sqlc.arg(product_type))
AND (sqlc.arg(availability)::text = '' OR p.availability = sqlc.arg(availability));

-- name: ListProducts :many
SELECT p.*, c.name AS category_name FROM products p
LEFT JOIN product_categories c ON c.tenant_id = p.tenant_id AND c.id = p.category_id AND c.deleted_at IS NULL
WHERE p.tenant_id = sqlc.arg(tenant_id) AND p.deleted_at IS NULL
AND (p.name ILIKE sqlc.arg(search) OR p.sku ILIKE sqlc.arg(search))
AND (sqlc.narg(category_id)::uuid IS NULL OR p.category_id = sqlc.narg(category_id))
AND (sqlc.arg(product_type)::text = '' OR p.product_type = sqlc.arg(product_type))
AND (sqlc.arg(availability)::text = '' OR p.availability = sqlc.arg(availability))
ORDER BY
CASE WHEN sqlc.arg(sort)::text = 'name' AND sqlc.arg(direction)::text = 'asc' THEN p.name END ASC,
CASE WHEN sqlc.arg(sort)::text = 'name' AND sqlc.arg(direction)::text = 'desc' THEN p.name END DESC,
CASE WHEN sqlc.arg(sort)::text = 'sku' AND sqlc.arg(direction)::text = 'asc' THEN p.sku END ASC,
CASE WHEN sqlc.arg(sort)::text = 'sku' AND sqlc.arg(direction)::text = 'desc' THEN p.sku END DESC,
CASE WHEN sqlc.arg(sort)::text = 'price_vnd' AND sqlc.arg(direction)::text = 'asc' THEN p.price_vnd END ASC,
CASE WHEN sqlc.arg(sort)::text = 'price_vnd' AND sqlc.arg(direction)::text = 'desc' THEN p.price_vnd END DESC,
CASE WHEN sqlc.arg(sort)::text = 'created_at' AND sqlc.arg(direction)::text = 'asc' THEN p.created_at END ASC,
CASE WHEN sqlc.arg(sort)::text = 'created_at' AND sqlc.arg(direction)::text = 'desc' THEN p.created_at END DESC,
p.id ASC LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: GetProduct :one
SELECT * FROM products WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL;

-- name: LockProduct :one
SELECT * FROM products WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL FOR UPDATE;

-- name: CreateProduct :one
INSERT INTO products (tenant_id, sku, name, category_id, product_type, menu_type, base_unit, price_vnd, cost_vnd, tracks_stock, is_visible, is_extra, earns_points, availability, image_url)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *;

-- name: UpdateProduct :one
UPDATE products SET name = $3, category_id = $4, product_type = $5, menu_type = $6, base_unit = $7,
price_vnd = $8, cost_vnd = $9, tracks_stock = $10, is_visible = $11, is_extra = $12, earns_points = $13,
availability = $14, image_url = $15, updated_at = now()
WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING *;

-- name: DeleteProduct :execrows
UPDATE products SET deleted_at = now(), updated_at = now() WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL;

-- name: ListProductAttributes :many
SELECT * FROM product_variants WHERE tenant_id = sqlc.arg(tenant_id) AND product_id = ANY(sqlc.arg(product_ids)::uuid[]) AND deleted_at IS NULL ORDER BY name, value;

-- name: ListProductUnits :many
SELECT * FROM product_units WHERE tenant_id = sqlc.arg(tenant_id) AND product_id = ANY(sqlc.arg(product_ids)::uuid[]) ORDER BY name;

-- name: ClearProductAttributes :exec
DELETE FROM product_variants WHERE tenant_id = $1 AND product_id = $2;

-- name: ClearProductUnits :exec
DELETE FROM product_units WHERE tenant_id = $1 AND product_id = $2;

-- name: CreateProductAttribute :exec
INSERT INTO product_variants (tenant_id, product_id, name, value, price_delta_vnd) VALUES ($1,$2,$3,$4,$5);

-- name: CreateProductUnit :exec
INSERT INTO product_units (tenant_id, product_id, name, ratio, price_vnd, cost_vnd) VALUES ($1,$2,$3,$4,$5,$6);
