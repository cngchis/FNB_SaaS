-- +goose Up
CREATE TABLE product_recipes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), product_id uuid NOT NULL,
 selection_key text NOT NULL, unit_name text NOT NULL, attributes jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(attributes)='array'),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,product_id,selection_key), FOREIGN KEY(tenant_id,product_id) REFERENCES products(tenant_id,id)
);
CREATE TABLE recipe_ingredients (
 tenant_id uuid NOT NULL, recipe_id uuid NOT NULL, product_id uuid NOT NULL, base_unit text NOT NULL,
 quantity numeric(18,6) NOT NULL CHECK(quantity>0 AND quantity<=1000000000),
 PRIMARY KEY(tenant_id,recipe_id,product_id), FOREIGN KEY(tenant_id,recipe_id) REFERENCES product_recipes(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,product_id) REFERENCES products(tenant_id,id)
);
CREATE INDEX recipe_ingredients_product_idx ON recipe_ingredients(tenant_id,product_id);
ALTER TABLE order_items ADD COLUMN recipe_snapshot jsonb CHECK(recipe_snapshot IS NULL OR jsonb_typeof(recipe_snapshot)='object');
ALTER TABLE order_round_items ADD COLUMN recipe_snapshot jsonb CHECK(recipe_snapshot IS NULL OR jsonb_typeof(recipe_snapshot)='object');
CREATE INDEX order_items_recipe_idx ON order_items USING gin(recipe_snapshot jsonb_path_ops) WHERE recipe_snapshot IS NOT NULL;
CREATE INDEX order_round_items_recipe_idx ON order_round_items USING gin(recipe_snapshot jsonb_path_ops) WHERE recipe_snapshot IS NOT NULL;
-- +goose StatementBegin
DO $body$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['product_recipes','recipe_ingredients'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY tenant_isolation ON %I USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',t);
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='fnb_app') THEN EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO fnb_app',t); END IF;
 END LOOP;
END $body$;
-- +goose StatementEnd
-- Protect both current recipe identities and ingredients in historical orders.
-- +goose StatementBegin
CREATE FUNCTION protect_recipe_identity() RETURNS trigger LANGUAGE plpgsql AS $body$ BEGIN
 IF (NEW.base_unit IS DISTINCT FROM OLD.base_unit OR NEW.product_type IS DISTINCT FROM OLD.product_type OR NEW.tracks_stock IS DISTINCT FROM OLD.tracks_stock OR (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL))
 AND (EXISTS(SELECT 1 FROM product_recipes WHERE tenant_id=OLD.tenant_id AND product_id=OLD.id)
 OR EXISTS(SELECT 1 FROM recipe_ingredients WHERE tenant_id=OLD.tenant_id AND product_id=OLD.id)
 OR EXISTS(SELECT 1 FROM order_items WHERE tenant_id=OLD.tenant_id AND recipe_snapshot @> jsonb_build_object('ingredients',jsonb_build_array(jsonb_build_object('product_id',OLD.id::text))))
 OR EXISTS(SELECT 1 FROM order_round_items WHERE tenant_id=OLD.tenant_id AND recipe_snapshot @> jsonb_build_object('ingredients',jsonb_build_array(jsonb_build_object('product_id',OLD.id::text))))) THEN
 RAISE EXCEPTION 'A recipe product or ingredient with recipe history cannot change stock identity or be deleted' USING ERRCODE='23514';
 END IF; RETURN NEW;
END $body$;
-- +goose StatementEnd
CREATE TRIGGER recipe_identity_guard BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION protect_recipe_identity();

-- +goose Down
-- +goose StatementBegin
DO $body$ BEGIN
 IF EXISTS(SELECT 1 FROM product_recipes) OR EXISTS(SELECT 1 FROM order_items WHERE recipe_snapshot IS NOT NULL) OR EXISTS(SELECT 1 FROM order_round_items WHERE recipe_snapshot IS NOT NULL) THEN
 RAISE EXCEPTION 'Cannot discard recipe configuration or order snapshots'; END IF;
END $body$;
-- +goose StatementEnd
DROP TRIGGER recipe_identity_guard ON products;
DROP FUNCTION protect_recipe_identity();
ALTER TABLE order_items DROP COLUMN recipe_snapshot;
ALTER TABLE order_round_items DROP COLUMN recipe_snapshot;
DROP TABLE recipe_ingredients,product_recipes;
