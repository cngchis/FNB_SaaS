-- name: ReadInvoices :one
-- A single statement gives rows, payment totals and metrics the same snapshot.
WITH matched AS (
 SELECT i.id, i.code, i.created_at AS issued_at, o.id AS order_id,
 o.order_code, o.created_at AS arrived_at, o.subtotal_vnd, o.discount_vnd,
 o.total_vnd, coalesce(p.paid_vnd,0)::bigint AS paid_vnd,
 coalesce(r.name,'Mang về')::text AS room, coalesce(c.name,'Khách lẻ')::text AS customer,
 s.name AS branch, coalesce(u.display_name,'—')::text AS creator,
 CASE WHEN o.status='cancelled' THEN 'cancelled' WHEN o.status='paid' THEN 'paid' ELSE 'unpaid' END::text AS status
 FROM invoices i
 JOIN orders o ON o.tenant_id=i.tenant_id AND o.store_id=i.store_id AND o.id=i.order_id
 JOIN stores s ON s.tenant_id=i.tenant_id AND s.id=i.store_id
 LEFT JOIN rooms r ON r.tenant_id=o.tenant_id AND r.store_id=o.store_id AND r.id=o.room_id
 LEFT JOIN customers c ON c.tenant_id=o.tenant_id AND c.id=o.customer_id
 LEFT JOIN users u ON u.id=o.created_by
 LEFT JOIN LATERAL (
  SELECT sum(p.amount_vnd) AS paid_vnd FROM payments p
  WHERE p.tenant_id=o.tenant_id AND p.store_id=o.store_id AND p.order_id=o.id AND p.status='succeeded'
 ) p ON true
 WHERE i.tenant_id=sqlc.arg(tenant_id) AND i.store_id=sqlc.arg(store_id) AND o.deleted_at IS NULL
 AND (sqlc.narg(id)::uuid IS NULL OR i.id=sqlc.narg(id))
 AND (i.code ILIKE sqlc.arg(search) OR o.order_code ILIKE sqlc.arg(search) OR coalesce(c.name,'Khách lẻ') ILIKE sqlc.arg(search) OR coalesce(r.name,'Mang về') ILIKE sqlc.arg(search))
 AND (sqlc.narg(date_from)::timestamptz IS NULL OR o.created_at >= sqlc.narg(date_from))
 AND (sqlc.narg(date_until)::timestamptz IS NULL OR o.created_at < sqlc.narg(date_until))
), filtered AS (
 SELECT * FROM matched WHERE sqlc.arg(status)::text='' OR status=sqlc.arg(status)
), page AS (
 SELECT * FROM filtered ORDER BY
 CASE WHEN sqlc.arg(sort)::text='code' AND sqlc.arg(direction)::text='asc' THEN code END ASC,
 CASE WHEN sqlc.arg(sort)::text='code' AND sqlc.arg(direction)::text='desc' THEN code END DESC,
 CASE WHEN sqlc.arg(sort)::text='order_code' AND sqlc.arg(direction)::text='asc' THEN order_code END ASC,
 CASE WHEN sqlc.arg(sort)::text='order_code' AND sqlc.arg(direction)::text='desc' THEN order_code END DESC,
 CASE WHEN sqlc.arg(sort)::text='room' AND sqlc.arg(direction)::text='asc' THEN room END ASC,
 CASE WHEN sqlc.arg(sort)::text='room' AND sqlc.arg(direction)::text='desc' THEN room END DESC,
 CASE WHEN sqlc.arg(sort)::text='customer' AND sqlc.arg(direction)::text='asc' THEN customer END ASC,
 CASE WHEN sqlc.arg(sort)::text='customer' AND sqlc.arg(direction)::text='desc' THEN customer END DESC,
 CASE WHEN sqlc.arg(sort)::text='subtotal_vnd' AND sqlc.arg(direction)::text='asc' THEN subtotal_vnd END ASC,
 CASE WHEN sqlc.arg(sort)::text='subtotal_vnd' AND sqlc.arg(direction)::text='desc' THEN subtotal_vnd END DESC,
 CASE WHEN sqlc.arg(sort)::text='total_vnd' AND sqlc.arg(direction)::text='asc' THEN total_vnd END ASC,
 CASE WHEN sqlc.arg(sort)::text='total_vnd' AND sqlc.arg(direction)::text='desc' THEN total_vnd END DESC,
 CASE WHEN sqlc.arg(sort)::text='paid_vnd' AND sqlc.arg(direction)::text='asc' THEN paid_vnd END ASC,
 CASE WHEN sqlc.arg(sort)::text='paid_vnd' AND sqlc.arg(direction)::text='desc' THEN paid_vnd END DESC,
 CASE WHEN sqlc.arg(sort)::text='arrived_at' AND sqlc.arg(direction)::text='asc' THEN arrived_at END ASC,
 CASE WHEN sqlc.arg(sort)::text='arrived_at' AND sqlc.arg(direction)::text='desc' THEN arrived_at END DESC,
 CASE WHEN sqlc.arg(sort)::text='status' AND sqlc.arg(direction)::text='asc' THEN status END ASC,
 CASE WHEN sqlc.arg(sort)::text='status' AND sqlc.arg(direction)::text='desc' THEN status END DESC,
 id ASC LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset)
)
SELECT jsonb_build_object(
 'items',coalesce((SELECT jsonb_agg(to_jsonb(page) || jsonb_build_object('items',coalesce((
  SELECT jsonb_agg(jsonb_build_object('product_id',l.product_id,'name',l.product_name,'sku',coalesce(l.sku,''),'quantity',l.quantity::bigint,'unit',l.unit_name,'attributes',l.attributes,'price_vnd',l.unit_price_vnd,'amount_vnd',l.line_total_vnd) ORDER BY l.created_at,l.id)
  FROM order_items l WHERE l.tenant_id=sqlc.arg(tenant_id) AND l.store_id=sqlc.arg(store_id) AND l.order_id=page.order_id
 ),'[]'::jsonb))) FROM page),'[]'::jsonb),
 'summary', (SELECT jsonb_build_object('count',count(*),'today_count',count(*) FILTER (WHERE (arrived_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date),'total_vnd',coalesce(sum(total_vnd) FILTER (WHERE status<>'cancelled'),0),'unpaid_count',count(*) FILTER (WHERE status='unpaid'),'unpaid_vnd',coalesce(sum(greatest(total_vnd-paid_vnd,0)) FILTER (WHERE status='unpaid'),0)) FROM filtered)
)::jsonb AS payload;
