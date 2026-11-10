-- +goose Up
CREATE TABLE rooms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id uuid NOT NULL,
    name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
    note text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    UNIQUE (tenant_id, store_id, id),
    FOREIGN KEY (tenant_id, store_id) REFERENCES stores(tenant_id, id)
);
CREATE UNIQUE INDEX rooms_name_idx ON rooms(tenant_id, store_id, lower(name)) WHERE deleted_at IS NULL;
ALTER TABLE orders ADD COLUMN room_id uuid, ADD COLUMN note text NOT NULL DEFAULT '',
    ADD COLUMN version bigint NOT NULL DEFAULT 1,
    ADD CONSTRAINT orders_room_fk FOREIGN KEY (tenant_id, store_id, room_id) REFERENCES rooms(tenant_id, store_id, id);
CREATE UNIQUE INDEX orders_room_open_idx ON orders(tenant_id, store_id, room_id)
    WHERE room_id IS NOT NULL AND deleted_at IS NULL AND status IN ('open','estimated','pending_payment');
ALTER TABLE order_items ADD COLUMN line_key text NOT NULL DEFAULT '', ADD COLUMN unit_name text NOT NULL DEFAULT '',
    ADD COLUMN attributes jsonb NOT NULL DEFAULT '[]', ADD COLUMN unit_cost_vnd bigint CHECK (unit_cost_vnd >= 0);
CREATE TABLE order_rounds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id uuid NOT NULL, order_id uuid NOT NULL, revision bigint NOT NULL,
    created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, store_id, id), UNIQUE (tenant_id, store_id, order_id, revision),
    FOREIGN KEY (tenant_id, store_id, order_id) REFERENCES orders(tenant_id, store_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, created_by) REFERENCES memberships(tenant_id, user_id)
);
CREATE TABLE order_round_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id uuid NOT NULL, round_id uuid NOT NULL, product_id uuid NOT NULL,
    line_key text NOT NULL, product_name text NOT NULL, quantity_delta bigint NOT NULL CHECK (quantity_delta <> 0),
    unit_price_vnd bigint NOT NULL CHECK (unit_price_vnd >= 0),
    unit_cost_vnd bigint CHECK (unit_cost_vnd >= 0), unit_name text NOT NULL DEFAULT '', attributes jsonb NOT NULL DEFAULT '[]',
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, store_id, round_id) REFERENCES order_rounds(tenant_id, store_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)
);
CREATE TABLE invoices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id uuid NOT NULL, order_id uuid NOT NULL, code text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, store_id, order_id), UNIQUE(tenant_id, code),
    FOREIGN KEY(tenant_id, store_id, order_id) REFERENCES orders(tenant_id, store_id, id)
);
CREATE TABLE api_requests (
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, store_id uuid NOT NULL,
    operation text NOT NULL, key text NOT NULL, request_hash text NOT NULL, response jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(tenant_id, store_id, operation, key),
    FOREIGN KEY(tenant_id, store_id) REFERENCES stores(tenant_id, id)
);
ALTER TABLE entity_counters DROP CONSTRAINT entity_counters_entity_check;
ALTER TABLE entity_counters ADD CONSTRAINT entity_counters_entity_check CHECK(entity IN ('product','order','invoice'));
-- +goose StatementBegin
DO $$
DECLARE item text;
BEGIN
    FOREACH item IN ARRAY ARRAY['rooms','order_rounds','order_round_items','invoices','api_requests'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', item);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', item);
        EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', item);
        IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='fnb_app') THEN
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO fnb_app', item);
        END IF;
    END LOOP;
END $$;
-- +goose StatementEnd

-- +goose Down
DELETE FROM entity_counters WHERE entity IN ('order','invoice');
ALTER TABLE entity_counters DROP CONSTRAINT entity_counters_entity_check;
ALTER TABLE entity_counters ADD CONSTRAINT entity_counters_entity_check CHECK(entity = 'product');
DROP TABLE api_requests, invoices, order_round_items, order_rounds;
ALTER TABLE order_items DROP COLUMN line_key, DROP COLUMN unit_name, DROP COLUMN attributes, DROP COLUMN unit_cost_vnd;
DROP INDEX orders_room_open_idx;
ALTER TABLE orders DROP CONSTRAINT orders_room_fk, DROP COLUMN room_id, DROP COLUMN note, DROP COLUMN version;
DROP TABLE rooms;
