-- +goose Up
ALTER TABLE products
    ADD COLUMN menu_type text NOT NULL DEFAULT 'other' CHECK (menu_type IN ('drink', 'food', 'other')),
    ADD COLUMN availability text NOT NULL DEFAULT 'available' CHECK (availability IN ('available', 'unavailable')),
    ADD COLUMN is_extra boolean NOT NULL DEFAULT false,
    ADD COLUMN earns_points boolean NOT NULL DEFAULT true,
    ADD COLUMN image_url text,
    ADD CONSTRAINT prepared_product_cost_check CHECK (product_type <> 'prepared' OR (cost_vnd IS NULL AND NOT tracks_stock));

CREATE TABLE product_units (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id uuid NOT NULL,
    name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
    ratio numeric(12,3) NOT NULL CHECK (ratio > 0),
    price_vnd bigint NOT NULL CHECK (price_vnd >= 0),
    cost_vnd bigint CHECK (cost_vnd IS NULL OR cost_vnd >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, product_id, name),
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE customer_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
    condition text NOT NULL DEFAULT '',
    benefit text NOT NULL DEFAULT '',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, name)
);
ALTER TABLE customers
    ADD COLUMN group_id uuid,
    ADD COLUMN points bigint NOT NULL DEFAULT 0 CHECK (points >= 0),
    ADD CONSTRAINT customers_group_fk FOREIGN KEY (tenant_id, group_id)
        REFERENCES customer_groups(tenant_id, id) ON DELETE SET NULL (group_id);
CREATE INDEX customers_group_idx ON customers (tenant_id, group_id) WHERE deleted_at IS NULL;
CREATE INDEX orders_customer_paid_idx ON orders (tenant_id, store_id, customer_id)
    INCLUDE (total_vnd) WHERE deleted_at IS NULL AND status = 'paid';

CREATE TABLE entity_counters (
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    entity text NOT NULL CHECK (entity = 'product'),
    value bigint NOT NULL CHECK (value >= 0),
    PRIMARY KEY (tenant_id, entity)
);
INSERT INTO entity_counters (tenant_id, entity, value)
SELECT tenant_id, 'product', max(substring(sku FROM '^M([0-9]{1,15})$')::bigint)
FROM products WHERE sku ~ '^M[0-9]{1,15}$' GROUP BY tenant_id;

-- +goose StatementBegin
DO $$
DECLARE table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY['product_units', 'customer_groups', 'entity_counters'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
        EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', table_name);
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fnb_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON product_units, customer_groups, entity_counters TO fnb_app;
    END IF;
END $$;
-- +goose StatementEnd

-- +goose Down
DROP INDEX orders_customer_paid_idx;
DROP TABLE entity_counters;
ALTER TABLE customers DROP CONSTRAINT customers_group_fk, DROP COLUMN group_id, DROP COLUMN points;
DROP TABLE customer_groups;
DROP TABLE product_units;
ALTER TABLE products DROP CONSTRAINT prepared_product_cost_check,
    DROP COLUMN menu_type, DROP COLUMN availability, DROP COLUMN is_extra,
    DROP COLUMN earns_points, DROP COLUMN image_url;
