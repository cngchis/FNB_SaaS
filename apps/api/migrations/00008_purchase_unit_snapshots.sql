-- +goose Up
ALTER TABLE purchase_receipt_items ADD COLUMN base_unit_name text NOT NULL DEFAULT '';
UPDATE purchase_receipt_items SET base_unit_name=unit_name;
ALTER TABLE purchase_receipt_items ADD COLUMN unit_ratio numeric(12,3) NOT NULL DEFAULT 1 CHECK(unit_ratio>0);
ALTER TABLE purchase_receipt_items ADD COLUMN base_quantity numeric(24,6) GENERATED ALWAYS AS (quantity::numeric*unit_ratio) STORED;
-- A purchased pack can have a fractional VND cost per base unit. Do not round it
-- into an invented integer cost; the receipt retains the exact pack cost/total.
ALTER TABLE stock_movements DROP CONSTRAINT stock_movement_source;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movement_source CHECK(
 (kind='purchase' AND receipt_item_id IS NOT NULL AND order_id IS NULL AND stocktake_item_id IS NULL AND quantity_delta>0) OR
 (kind='sale' AND receipt_item_id IS NULL AND order_id IS NOT NULL AND stocktake_item_id IS NULL AND quantity_delta<>0) OR
 (kind='stocktake' AND receipt_item_id IS NULL AND order_id IS NULL AND stocktake_item_id IS NOT NULL AND quantity_delta<>0));

-- +goose Down
-- +goose StatementBegin
DO $body$ BEGIN
 IF EXISTS(SELECT 1 FROM purchase_receipt_items WHERE unit_ratio<>1 OR unit_name<>base_unit_name)
 OR EXISTS(SELECT 1 FROM stock_movements WHERE kind='purchase' AND unit_cost_vnd IS NULL) THEN
  RAISE EXCEPTION 'Cannot roll back purchase unit snapshots with converted receipt history';
 END IF;
END $body$;
-- +goose StatementEnd
ALTER TABLE stock_movements DROP CONSTRAINT stock_movement_source;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movement_source CHECK(
 (kind='purchase' AND unit_cost_vnd IS NOT NULL AND receipt_item_id IS NOT NULL AND order_id IS NULL AND stocktake_item_id IS NULL AND quantity_delta>0) OR
 (kind='sale' AND receipt_item_id IS NULL AND order_id IS NOT NULL AND stocktake_item_id IS NULL AND quantity_delta<>0) OR
 (kind='stocktake' AND receipt_item_id IS NULL AND order_id IS NULL AND stocktake_item_id IS NOT NULL AND quantity_delta<>0));
ALTER TABLE purchase_receipt_items DROP COLUMN base_quantity,DROP COLUMN unit_ratio,DROP COLUMN base_unit_name;
