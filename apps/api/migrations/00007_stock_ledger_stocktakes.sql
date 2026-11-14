-- +goose Up
ALTER TABLE stores ADD COLUMN inventory_started_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE stock_balances ADD COLUMN initialized boolean NOT NULL DEFAULT false;
ALTER TABLE stock_balances ADD COLUMN version bigint NOT NULL DEFAULT 0;
UPDATE stock_balances SET version=1;
ALTER TABLE stock_balances ADD CONSTRAINT stock_balances_nonnegative CHECK(quantity>=0);
ALTER TABLE orders ADD COLUMN stock_posted_at timestamptz;
-- Historical invoices are not silently re-issued against today's stock.
UPDATE orders o SET stock_posted_at=now() WHERE EXISTS(SELECT 1 FROM invoices i WHERE i.tenant_id=o.tenant_id AND i.store_id=o.store_id AND i.order_id=o.id);
ALTER TABLE order_items ADD COLUMN stock_tracked boolean NOT NULL DEFAULT false;
ALTER TABLE order_items ADD COLUMN stock_ratio numeric(18,3);
ALTER TABLE order_items ADD COLUMN stock_base_unit text NOT NULL DEFAULT '';
UPDATE order_items l SET stock_tracked=p.product_type='goods' AND p.tracks_stock,
 stock_ratio=CASE WHEN l.unit_name='' OR l.unit_name=p.base_unit THEN 1 ELSE (SELECT u.ratio FROM product_units u WHERE u.tenant_id=p.tenant_id AND u.product_id=p.id AND u.name=l.unit_name) END,
 stock_base_unit=p.base_unit FROM products p WHERE p.tenant_id=l.tenant_id AND p.id=l.product_id;
ALTER TABLE entity_counters DROP CONSTRAINT entity_counters_entity_check;
ALTER TABLE entity_counters ADD CONSTRAINT entity_counters_entity_check CHECK(entity IN ('product','order','invoice','cashbook','supplier','purchase','stocktake'));
CREATE TABLE stocktakes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),store_id uuid NOT NULL,
 code text NOT NULL,status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','posted')),note text NOT NULL DEFAULT '',version bigint NOT NULL DEFAULT 1,
 created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),posted_at timestamptz,
 UNIQUE(tenant_id,store_id,id),UNIQUE(tenant_id,code),
 FOREIGN KEY(tenant_id,store_id) REFERENCES stores(tenant_id,id),FOREIGN KEY(tenant_id,created_by) REFERENCES memberships(tenant_id,user_id)
);
CREATE INDEX stocktakes_store_idx ON stocktakes(tenant_id,store_id,created_at DESC,id);
CREATE TABLE stocktake_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,store_id uuid NOT NULL,stocktake_id uuid NOT NULL,product_id uuid NOT NULL,
 product_name text NOT NULL,sku text NOT NULL,unit_name text NOT NULL,system_quantity numeric(24,6) NOT NULL CHECK(system_quantity>=0),
 balance_version bigint NOT NULL,
 counted_quantity numeric(24,6) NOT NULL CHECK(counted_quantity BETWEEN 0 AND 1000000000),
 UNIQUE(tenant_id,store_id,id,product_id),UNIQUE(tenant_id,store_id,stocktake_id,product_id),
 FOREIGN KEY(tenant_id,store_id,stocktake_id) REFERENCES stocktakes(tenant_id,store_id,id),FOREIGN KEY(tenant_id,product_id) REFERENCES products(tenant_id,id)
);
ALTER TABLE stock_movements ALTER COLUMN receipt_item_id DROP NOT NULL;
ALTER TABLE stock_movements ALTER COLUMN unit_cost_vnd DROP NOT NULL;
ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_quantity_delta_check;
ALTER TABLE stock_movements ADD COLUMN kind text NOT NULL DEFAULT 'purchase' CHECK(kind IN ('purchase','sale','stocktake'));
ALTER TABLE stock_movements ADD COLUMN order_id uuid;
ALTER TABLE stock_movements ADD COLUMN stocktake_item_id uuid;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_order_fk FOREIGN KEY(tenant_id,store_id,order_id) REFERENCES orders(tenant_id,store_id,id);
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_stocktake_fk FOREIGN KEY(tenant_id,store_id,stocktake_item_id,product_id) REFERENCES stocktake_items(tenant_id,store_id,id,product_id);
ALTER TABLE stock_movements ADD CONSTRAINT stock_movement_source CHECK(
 (kind='purchase' AND unit_cost_vnd IS NOT NULL AND receipt_item_id IS NOT NULL AND order_id IS NULL AND stocktake_item_id IS NULL AND quantity_delta>0) OR
 (kind='sale' AND receipt_item_id IS NULL AND order_id IS NOT NULL AND stocktake_item_id IS NULL AND quantity_delta<>0) OR
 (kind='stocktake' AND receipt_item_id IS NULL AND order_id IS NULL AND stocktake_item_id IS NOT NULL AND quantity_delta<>0));
CREATE UNIQUE INDEX stock_movements_stocktake_once ON stock_movements(tenant_id,store_id,stocktake_item_id) WHERE stocktake_item_id IS NOT NULL;
-- +goose StatementBegin
DO $body$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['stocktakes','stocktake_items'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY tenant_isolation ON %I USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',t);
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='fnb_app') THEN EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO fnb_app',t); END IF;
 END LOOP;
END $body$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION protect_stock_product_identity() RETURNS trigger LANGUAGE plpgsql AS $body$ BEGIN
 IF (NEW.base_unit IS DISTINCT FROM OLD.base_unit OR NEW.product_type IS DISTINCT FROM OLD.product_type OR NEW.tracks_stock IS DISTINCT FROM OLD.tracks_stock OR (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL))
 AND (EXISTS(SELECT 1 FROM stock_movements WHERE tenant_id=OLD.tenant_id AND product_id=OLD.id) OR EXISTS(SELECT 1 FROM order_items WHERE tenant_id=OLD.tenant_id AND product_id=OLD.id)) THEN
  RAISE EXCEPTION 'A product with stock or order history cannot change stock identity or be deleted' USING ERRCODE='23514';
 END IF; RETURN NEW;
END $body$;
-- +goose StatementEnd

-- +goose Down
-- Do not discard posted inventory audit history during rollback.
-- +goose StatementBegin
DO $body$ BEGIN
 IF EXISTS(SELECT 1 FROM stock_movements WHERE kind<>'purchase') THEN RAISE EXCEPTION 'Cannot roll back posted stock history'; END IF;
END $body$;
-- +goose StatementEnd
ALTER TABLE stock_movements DROP CONSTRAINT stock_movement_source,DROP CONSTRAINT stock_movements_order_fk,DROP CONSTRAINT stock_movements_stocktake_fk;
DROP INDEX stock_movements_stocktake_once;
ALTER TABLE stock_movements DROP COLUMN kind,DROP COLUMN order_id,DROP COLUMN stocktake_item_id;
ALTER TABLE stock_movements ALTER COLUMN receipt_item_id SET NOT NULL;
ALTER TABLE stock_movements ALTER COLUMN unit_cost_vnd SET NOT NULL;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_quantity_delta_check CHECK(quantity_delta>0);
DROP TABLE stocktake_items,stocktakes;
DELETE FROM api_requests WHERE operation LIKE 'stocktake:%';
DELETE FROM entity_counters WHERE entity='stocktake';
ALTER TABLE entity_counters DROP CONSTRAINT entity_counters_entity_check;
ALTER TABLE entity_counters ADD CONSTRAINT entity_counters_entity_check CHECK(entity IN ('product','order','invoice','cashbook','supplier','purchase'));
ALTER TABLE orders DROP COLUMN stock_posted_at;
ALTER TABLE order_items DROP COLUMN stock_tracked,DROP COLUMN stock_ratio,DROP COLUMN stock_base_unit;
ALTER TABLE stock_balances DROP CONSTRAINT stock_balances_nonnegative;
ALTER TABLE stock_balances DROP COLUMN version,DROP COLUMN initialized;
ALTER TABLE stores DROP COLUMN inventory_started_at;

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION protect_stock_product_identity() RETURNS trigger LANGUAGE plpgsql AS $body$ BEGIN
 IF (NEW.base_unit IS DISTINCT FROM OLD.base_unit OR NEW.product_type IS DISTINCT FROM OLD.product_type OR NEW.tracks_stock IS DISTINCT FROM OLD.tracks_stock OR (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL))
 AND EXISTS(SELECT 1 FROM stock_movements WHERE tenant_id=OLD.tenant_id AND product_id=OLD.id) THEN
 RAISE EXCEPTION 'A product with stock history cannot change stock identity or be deleted' USING ERRCODE='23514'; END IF; RETURN NEW;
END $body$;
-- +goose StatementEnd
