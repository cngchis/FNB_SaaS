-- +goose Up
-- Preserve the previous effective visibility when splitting the base/unit flags.
ALTER TABLE product_units ADD COLUMN is_visible boolean NOT NULL DEFAULT true;
UPDATE product_units u SET is_visible = p.is_visible
FROM products p WHERE p.tenant_id = u.tenant_id AND p.id = u.product_id;

-- +goose Down
ALTER TABLE product_units DROP COLUMN is_visible;
