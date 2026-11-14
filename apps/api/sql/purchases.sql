-- name: ReadSuppliers :one
WITH matched AS (
 SELECT s.id,s.code,s.name,s.contact,s.phone,s.address,s.note,s.version,
 coalesce((SELECT sum(r.total_vnd) FROM purchase_receipts r WHERE r.tenant_id=s.tenant_id AND r.store_id=sqlc.arg(store_id) AND r.supplier_id=s.id AND r.status='posted'),0) AS debt_vnd
 FROM suppliers s WHERE s.tenant_id=sqlc.arg(tenant_id) AND s.deleted_at IS NULL
 AND (s.name ILIKE sqlc.arg(search) OR s.code ILIKE sqlc.arg(search) OR s.phone ILIKE sqlc.arg(search))
), page AS (
 SELECT * FROM matched ORDER BY
 CASE WHEN sqlc.arg(sort)::text='name' AND sqlc.arg(direction)::text='asc' THEN name END ASC,
 CASE WHEN sqlc.arg(sort)::text='name' AND sqlc.arg(direction)::text='desc' THEN name END DESC,
 CASE WHEN sqlc.arg(sort)::text='debt_vnd' AND sqlc.arg(direction)::text='asc' THEN debt_vnd END ASC,
 CASE WHEN sqlc.arg(sort)::text='debt_vnd' AND sqlc.arg(direction)::text='desc' THEN debt_vnd END DESC,
 id LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset)
) SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(page)) FROM page),'[]'::jsonb),'total',(SELECT count(*) FROM matched),'debt_vnd',(SELECT coalesce(sum(debt_vnd),0) FROM matched))::jsonb AS payload;

-- name: ReadPurchases :one
WITH matched AS (
 SELECT r.id,r.code,r.status,r.total_vnd,r.note,r.version,r.supplier_id,r.created_at,r.posted_at,
 s.name AS supplier,b.name AS branch,coalesce(u.display_name,'—') AS creator
 FROM purchase_receipts r JOIN suppliers s ON s.tenant_id=r.tenant_id AND s.id=r.supplier_id
 JOIN stores b ON b.tenant_id=r.tenant_id AND b.id=r.store_id LEFT JOIN users u ON u.id=r.created_by
 WHERE r.tenant_id=sqlc.arg(tenant_id) AND r.store_id=sqlc.arg(store_id)
 AND (sqlc.narg(id)::uuid IS NULL OR r.id=sqlc.narg(id))
 AND (r.code ILIKE sqlc.arg(search) OR s.name ILIKE sqlc.arg(search))
), page AS (
 SELECT * FROM matched ORDER BY
 CASE WHEN sqlc.arg(direction)::text='asc' THEN created_at END ASC,
 CASE WHEN sqlc.arg(direction)::text='desc' THEN created_at END DESC, id DESC LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset)
) SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(page)||jsonb_build_object('items',coalesce((
 SELECT jsonb_agg(jsonb_build_object('id',l.id,'product_id',l.product_id,'name',l.product_name,'sku',l.sku,'unit',l.unit_name,'quantity',l.quantity,'cost_vnd',l.unit_cost_vnd,'total_vnd',l.total_vnd) ORDER BY l.id)
 FROM purchase_receipt_items l WHERE l.tenant_id=sqlc.arg(tenant_id) AND l.store_id=sqlc.arg(store_id) AND l.receipt_id=page.id),'[]'::jsonb))) FROM page),'[]'::jsonb),
 'total',(SELECT count(*) FROM matched),'total_vnd',(SELECT coalesce(sum(total_vnd),0) FROM matched),
 'draft_count',(SELECT count(*) FROM matched WHERE status='draft'))::jsonb AS payload;

-- name: ReadStockBalances :many
SELECT p.id AS product_id,p.sku,p.name,p.base_unit,coalesce(b.quantity,0)::text AS quantity
FROM products p JOIN stores s ON s.tenant_id=p.tenant_id AND s.id=sqlc.arg(store_id) LEFT JOIN stock_balances b ON b.tenant_id=p.tenant_id AND b.store_id=sqlc.arg(store_id) AND b.product_id=p.id
WHERE p.tenant_id=sqlc.arg(tenant_id) AND p.deleted_at IS NULL AND p.product_type='goods' AND p.tracks_stock
AND coalesce(b.initialized,p.created_at>=s.inventory_started_at)
AND (p.name ILIKE sqlc.arg(search) OR p.sku ILIKE sqlc.arg(search))
ORDER BY p.name,p.id LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: ReadStockMovements :many
SELECT m.id,m.product_id,p.name,p.sku,m.quantity_delta::text AS quantity_delta,m.unit_name,m.unit_cost_vnd,m.created_at,coalesce(r.code,o.order_code,t.code) AS receipt_code
FROM stock_movements m JOIN products p ON p.tenant_id=m.tenant_id AND p.id=m.product_id
LEFT JOIN purchase_receipt_items l ON l.tenant_id=m.tenant_id AND l.store_id=m.store_id AND l.id=m.receipt_item_id
LEFT JOIN purchase_receipts r ON r.tenant_id=l.tenant_id AND r.store_id=l.store_id AND r.id=l.receipt_id
LEFT JOIN orders o ON o.tenant_id=m.tenant_id AND o.store_id=m.store_id AND o.id=m.order_id
LEFT JOIN stocktake_items si ON si.tenant_id=m.tenant_id AND si.store_id=m.store_id AND si.id=m.stocktake_item_id
LEFT JOIN stocktakes t ON t.tenant_id=si.tenant_id AND t.store_id=si.store_id AND t.id=si.stocktake_id
WHERE m.tenant_id=sqlc.arg(tenant_id) AND m.store_id=sqlc.arg(store_id)
AND (sqlc.narg(product_id)::uuid IS NULL OR m.product_id=sqlc.narg(product_id))
ORDER BY m.created_at DESC,m.id DESC LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);
