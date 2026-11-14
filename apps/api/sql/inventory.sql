-- name: InventoryQuantities :one
SELECT coalesce(jsonb_agg(jsonb_build_object('product_id',p.id,'quantity',CASE WHEN coalesce(b.initialized,p.created_at>=s.inventory_started_at) THEN coalesce(b.quantity,0)::text ELSE NULL::text END,'balance_version',coalesce(b.version,0))),'[]'::jsonb)::jsonb AS payload
FROM products p JOIN stores s ON s.tenant_id=p.tenant_id AND s.id=sqlc.arg(store_id) LEFT JOIN stock_balances b ON b.tenant_id=p.tenant_id AND b.store_id=sqlc.arg(store_id) AND b.product_id=p.id
WHERE p.tenant_id=sqlc.arg(tenant_id) AND p.id=ANY(sqlc.arg(product_ids)::uuid[]) AND p.deleted_at IS NULL AND p.product_type='goods' AND p.tracks_stock;

-- name: InventorySummary :one
SELECT jsonb_build_object('sku_count',count(*),'quantity',CASE WHEN bool_and(coalesce(b.initialized,p.created_at>=s.inventory_started_at)) IS NOT FALSE THEN coalesce(sum(coalesce(b.quantity,0)),0)::text ELSE NULL::text END,
 'retail_value_vnd',CASE WHEN bool_and(coalesce(b.initialized,p.created_at>=s.inventory_started_at)) IS NOT FALSE THEN floor(coalesce(sum(coalesce(b.quantity,0)*p.price_vnd),0))::text ELSE NULL::text END)::jsonb AS payload
FROM products p JOIN stores s ON s.tenant_id=p.tenant_id AND s.id=sqlc.arg(store_id) LEFT JOIN stock_balances b ON b.tenant_id=p.tenant_id AND b.store_id=sqlc.arg(store_id) AND b.product_id=p.id
WHERE p.tenant_id=sqlc.arg(tenant_id) AND p.deleted_at IS NULL AND p.product_type='goods' AND p.tracks_stock;

-- name: ReadStocktakes :one
WITH matched AS (
 SELECT t.id,t.code,t.status,t.note,t.version,t.created_at,s.name AS branch,u.display_name AS creator
 FROM stocktakes t JOIN stores s ON s.tenant_id=t.tenant_id AND s.id=t.store_id JOIN users u ON u.id=t.created_by
 WHERE t.tenant_id=sqlc.arg(tenant_id) AND t.store_id=sqlc.arg(store_id) AND (sqlc.narg(id)::uuid IS NULL OR t.id=sqlc.narg(id))
), page AS (SELECT * FROM matched ORDER BY created_at DESC,id LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset))
SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(page)||jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'product_id',l.product_id,'name',l.product_name,'sku',l.sku,'unit',l.unit_name,'system_quantity',l.system_quantity::text,'counted_quantity',l.counted_quantity::text,'balance_version',l.balance_version) ORDER BY l.product_id) FROM stocktake_items l WHERE l.tenant_id=sqlc.arg(tenant_id) AND l.store_id=sqlc.arg(store_id) AND l.stocktake_id=page.id),'[]'::jsonb))) FROM page),'[]'::jsonb),'total',(SELECT count(*) FROM matched))::jsonb AS payload;
