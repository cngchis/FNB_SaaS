-- +goose Up
ALTER TABLE entity_counters DROP CONSTRAINT entity_counters_entity_check;
ALTER TABLE entity_counters ADD CONSTRAINT entity_counters_entity_check CHECK(entity IN ('product','order','invoice','cashbook','supplier','purchase'));
CREATE TABLE suppliers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 code text NOT NULL, name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
 contact text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '', address text NOT NULL DEFAULT '', note text NOT NULL DEFAULT '',
 version bigint NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,code)
);
CREATE UNIQUE INDEX suppliers_name_idx ON suppliers(tenant_id,lower(name)) WHERE deleted_at IS NULL;
CREATE TABLE purchase_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), store_id uuid NOT NULL,
 supplier_id uuid NOT NULL, code text NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','posted')),
 total_vnd bigint NOT NULL CHECK(total_vnd BETWEEN 0 AND 9007199254740991), note text NOT NULL DEFAULT '',
 version bigint NOT NULL DEFAULT 1, created_by uuid NOT NULL, posted_by uuid, posted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,store_id,id), UNIQUE(tenant_id,code),
 FOREIGN KEY(tenant_id,store_id) REFERENCES stores(tenant_id,id), FOREIGN KEY(tenant_id,supplier_id) REFERENCES suppliers(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES memberships(tenant_id,user_id), FOREIGN KEY(tenant_id,posted_by) REFERENCES memberships(tenant_id,user_id),
 CHECK((status='draft' AND posted_at IS NULL AND posted_by IS NULL) OR (status='posted' AND posted_at IS NOT NULL AND posted_by IS NOT NULL))
);
CREATE INDEX purchase_receipts_store_idx ON purchase_receipts(tenant_id,store_id,created_at DESC,id);
CREATE INDEX purchase_receipts_supplier_idx ON purchase_receipts(tenant_id,supplier_id,status);
CREATE TABLE purchase_receipt_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), store_id uuid NOT NULL, receipt_id uuid NOT NULL,
 product_id uuid NOT NULL, product_name text NOT NULL, sku text NOT NULL, unit_name text NOT NULL,
 quantity bigint NOT NULL CHECK(quantity BETWEEN 1 AND 1000000000), unit_cost_vnd bigint NOT NULL CHECK(unit_cost_vnd BETWEEN 0 AND 9007199254740991),
 total_vnd bigint NOT NULL CHECK(total_vnd BETWEEN 0 AND 9007199254740991 AND total_vnd=quantity::numeric*unit_cost_vnd),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,store_id,id,product_id), UNIQUE(tenant_id,store_id,receipt_id,product_id),
 FOREIGN KEY(tenant_id,store_id,receipt_id) REFERENCES purchase_receipts(tenant_id,store_id,id),
 FOREIGN KEY(tenant_id,product_id) REFERENCES products(tenant_id,id)
);
CREATE TABLE stock_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), store_id uuid NOT NULL, product_id uuid NOT NULL,
 receipt_item_id uuid NOT NULL, quantity_delta numeric(24,6) NOT NULL CHECK(quantity_delta>0),
 unit_name text NOT NULL, unit_cost_vnd bigint NOT NULL CHECK(unit_cost_vnd BETWEEN 0 AND 9007199254740991),
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,store_id,receipt_item_id),
 FOREIGN KEY(tenant_id,store_id,receipt_item_id,product_id) REFERENCES purchase_receipt_items(tenant_id,store_id,id,product_id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES memberships(tenant_id,user_id)
);
CREATE INDEX stock_movements_product_idx ON stock_movements(tenant_id,store_id,product_id,created_at,id);
-- The ledger is the source of truth; this projection can be rebuilt by summing it.
CREATE TABLE stock_balances (
 tenant_id uuid NOT NULL REFERENCES tenants(id), store_id uuid NOT NULL, product_id uuid NOT NULL,
 quantity numeric(24,6) NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,store_id,product_id),
 FOREIGN KEY(tenant_id,store_id) REFERENCES stores(tenant_id,id), FOREIGN KEY(tenant_id,product_id) REFERENCES products(tenant_id,id)
);
-- +goose StatementBegin
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['suppliers','purchase_receipts','purchase_receipt_items','stock_movements','stock_balances'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',table_name);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='fnb_app') THEN
   EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO fnb_app',table_name);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='fnb_app') THEN REVOKE UPDATE,DELETE ON stock_movements FROM fnb_app; END IF;
END $$;
-- +goose StatementEnd
-- Prevent accidental mutation of the audit ledger even by table owners.
-- +goose StatementBegin
CREATE FUNCTION reject_stock_movement_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'Stock movements are append-only' USING ERRCODE='23514';
END $$;
-- +goose StatementEnd
CREATE TRIGGER stock_movements_immutable BEFORE UPDATE OR DELETE ON stock_movements FOR EACH ROW EXECUTE FUNCTION reject_stock_movement_change();

-- +goose StatementBegin
CREATE FUNCTION protect_stock_product_identity() RETURNS trigger LANGUAGE plpgsql AS $body$ BEGIN
 IF (NEW.base_unit IS DISTINCT FROM OLD.base_unit OR NEW.product_type IS DISTINCT FROM OLD.product_type OR NEW.tracks_stock IS DISTINCT FROM OLD.tracks_stock OR (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL))
 AND EXISTS(SELECT 1 FROM stock_movements WHERE tenant_id=OLD.tenant_id AND product_id=OLD.id) THEN
  RAISE EXCEPTION 'A product with stock history cannot change stock identity or be deleted' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $body$;
-- +goose StatementEnd
CREATE TRIGGER products_stock_identity BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION protect_stock_product_identity();

-- +goose Down
DELETE FROM api_requests WHERE operation LIKE 'purchase:%' OR operation LIKE 'supplier:%';
DROP TRIGGER products_stock_identity ON products;
DROP FUNCTION protect_stock_product_identity();
DROP TABLE stock_balances;
DROP TABLE stock_movements;
DROP FUNCTION reject_stock_movement_change();
DROP TABLE purchase_receipt_items;
DROP TABLE purchase_receipts;
DROP TABLE suppliers;
DELETE FROM entity_counters WHERE entity IN ('supplier','purchase');
ALTER TABLE entity_counters DROP CONSTRAINT entity_counters_entity_check;
ALTER TABLE entity_counters ADD CONSTRAINT entity_counters_entity_check CHECK(entity IN ('product','order','invoice','cashbook'));
