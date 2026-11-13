-- name: ReadReport :one
-- Revenue uses issued invoices at first issue time. Cash flow uses settlement time.
-- Aggregate payments and lines before joining orders to avoid multiplication.
WITH issued AS (
 SELECT o.*, i.code AS invoice_code, i.created_at AS issued_at,
 coalesce(c.name,'Khách lẻ') AS customer,
 coalesce((SELECT sum(p.amount_vnd) FROM payments p WHERE p.tenant_id=o.tenant_id AND p.store_id=o.store_id AND p.order_id=o.id AND p.status='succeeded'),0) AS paid_vnd
 FROM invoices i JOIN orders o ON o.tenant_id=i.tenant_id AND o.store_id=i.store_id AND o.id=i.order_id
 LEFT JOIN customers c ON c.tenant_id=o.tenant_id AND c.id=o.customer_id
 WHERE i.tenant_id=sqlc.arg(tenant_id) AND i.store_id=sqlc.arg(store_id)
 AND o.deleted_at IS NULL AND o.status NOT IN ('cancelled','refunded')
 AND i.created_at >= sqlc.arg(date_from)::timestamptz AND i.created_at < sqlc.arg(date_until)::timestamptz
), lines AS (
 SELECT l.*, o.discount_vnd, o.subtotal_vnd,
 coalesce(pc.name,'Khác') AS category,
 CASE WHEN o.subtotal_vnd=0 THEN 0 ELSE floor(l.line_total_vnd::numeric*o.discount_vnd/o.subtotal_vnd) END AS allocated_discount,
 row_number() OVER (PARTITION BY o.id ORDER BY CASE WHEN o.subtotal_vnd=0 THEN 0 ELSE l.line_total_vnd::numeric*o.discount_vnd/o.subtotal_vnd-floor(l.line_total_vnd::numeric*o.discount_vnd/o.subtotal_vnd) END DESC,l.id) AS position
 FROM issued o JOIN order_items l ON l.tenant_id=o.tenant_id AND l.store_id=o.store_id AND l.order_id=o.id
 LEFT JOIN products p ON p.tenant_id=l.tenant_id AND p.id=l.product_id
 LEFT JOIN product_categories pc ON pc.tenant_id=p.tenant_id AND pc.id=p.category_id
), allocated AS (
 SELECT *, line_total_vnd-allocated_discount-CASE WHEN position<=discount_vnd-sum(allocated_discount) OVER (PARTITION BY order_id) THEN 1 ELSE 0 END AS net_vnd
 FROM lines
), summary AS (
 SELECT count(*) AS invoice_count, count(DISTINCT customer_id) AS customer_count,
 coalesce(sum(subtotal_vnd),0) AS subtotal_vnd, coalesce(sum(discount_vnd),0) AS discount_vnd,
 coalesce(sum(total_vnd),0) AS revenue_vnd, coalesce(sum(least(paid_vnd,total_vnd)),0) AS paid_vnd,
 coalesce(sum(greatest(total_vnd-paid_vnd,0)),0) AS debt_vnd FROM issued
), costs AS (
 SELECT CASE WHEN count(*) FILTER (WHERE unit_cost_vnd IS NULL)>0 THEN NULL ELSE coalesce(sum(unit_cost_vnd*quantity),0) END AS cost_vnd,
 count(*) FILTER (WHERE unit_cost_vnd IS NULL) AS missing_cost_lines FROM lines
), settlements AS (
 SELECT pm.method_type AS method, count(*) AS count, sum(p.amount_vnd) AS amount_vnd
 FROM payments p JOIN payment_methods pm ON pm.tenant_id=p.tenant_id AND pm.store_id=p.store_id AND pm.id=p.payment_method_id
 WHERE p.tenant_id=sqlc.arg(tenant_id) AND p.store_id=sqlc.arg(store_id) AND p.status='succeeded'
 AND p.created_at>=sqlc.arg(date_from) AND p.created_at<sqlc.arg(date_until)
 GROUP BY pm.method_type
), flow AS (
 SELECT coalesce(sum(CASE WHEN direction='in' THEN amount_vnd ELSE -amount_vnd END) FILTER(WHERE occurred_at<sqlc.arg(date_from)),0) AS opening_vnd,
 coalesce(sum(amount_vnd) FILTER(WHERE occurred_at>=sqlc.arg(date_from) AND direction='in'),0) AS income_vnd,
 coalesce(sum(amount_vnd) FILTER(WHERE occurred_at>=sqlc.arg(date_from) AND direction='out'),0) AS expense_vnd,
 coalesce(sum(amount_vnd) FILTER(WHERE occurred_at>=sqlc.arg(date_from) AND direction='out' AND category='operating_expense' AND source='manual'),0) AS operating_expense_vnd,
 coalesce(sum(CASE WHEN direction='in' THEN amount_vnd ELSE -amount_vnd END) FILTER(WHERE method='cash'),0) AS cash_closing_vnd
 FROM cashbook_entries WHERE tenant_id=sqlc.arg(tenant_id) AND store_id=sqlc.arg(store_id) AND status='posted' AND occurred_at<sqlc.arg(date_until)
), buckets AS (
 SELECT generate_series(sqlc.arg(date_from)::timestamptz,sqlc.arg(date_until)::timestamptz-interval '1 second',
 CASE WHEN sqlc.arg(granularity)::text='hour' THEN interval '1 hour' ELSE interval '1 day' END) AS at
), series AS (
 SELECT b.at, coalesce(sum(o.total_vnd),0) AS revenue_vnd,
 CASE WHEN coalesce(sum(l.missing),0)>0 THEN NULL ELSE coalesce(sum(l.cost),0) END AS cost_vnd
 FROM buckets b LEFT JOIN issued o ON o.issued_at>=b.at AND o.issued_at<b.at+CASE WHEN sqlc.arg(granularity)::text='hour' THEN interval '1 hour' ELSE interval '1 day' END
 LEFT JOIN LATERAL (SELECT sum(unit_cost_vnd*quantity) AS cost,count(*) FILTER(WHERE unit_cost_vnd IS NULL) AS missing FROM order_items x WHERE x.tenant_id=o.tenant_id AND x.store_id=o.store_id AND x.order_id=o.id) l ON true
 GROUP BY b.at
), groups AS (
 SELECT category AS label, sum(quantity) AS quantity, sum(net_vnd) AS revenue_vnd FROM allocated GROUP BY category
)
SELECT jsonb_build_object(
 'summary',(SELECT to_jsonb(summary)||to_jsonb(costs)||jsonb_build_object('profit_vnd',summary.revenue_vnd-costs.cost_vnd) FROM summary CROSS JOIN costs),
 'flow',(SELECT to_jsonb(flow)||jsonb_build_object('closing_vnd',opening_vnd+income_vnd-expense_vnd) FROM flow),
 'payments',coalesce((SELECT jsonb_agg(to_jsonb(settlements) ORDER BY method) FROM settlements),'[]'::jsonb),
 'series',coalesce((SELECT jsonb_agg(to_jsonb(series)||jsonb_build_object('profit_vnd',revenue_vnd-cost_vnd,
 'income_vnd',(SELECT coalesce(sum(amount_vnd),0) FROM cashbook_entries e WHERE e.tenant_id=sqlc.arg(tenant_id) AND e.store_id=sqlc.arg(store_id) AND e.status='posted' AND e.direction='in' AND e.occurred_at>=series.at AND e.occurred_at<series.at+CASE WHEN sqlc.arg(granularity)::text='hour' THEN interval '1 hour' ELSE interval '1 day' END),
 'payment_count',(SELECT count(*) FROM payments p WHERE p.tenant_id=sqlc.arg(tenant_id) AND p.store_id=sqlc.arg(store_id) AND p.status='succeeded' AND p.created_at>=series.at AND p.created_at<series.at+CASE WHEN sqlc.arg(granularity)::text='hour' THEN interval '1 hour' ELSE interval '1 day' END)) ORDER BY at) FROM series),'[]'::jsonb),
 'groups',coalesce((SELECT jsonb_agg(to_jsonb(groups) ORDER BY revenue_vnd DESC,label) FROM groups),'[]'::jsonb),
 'recent',coalesce((SELECT jsonb_agg(to_jsonb(recent) ORDER BY issued_at DESC,id DESC) FROM (
 SELECT id,invoice_code AS code,issued_at,customer,total_vnd,least(paid_vnd,total_vnd) AS paid_vnd,status,
 coalesce((SELECT string_agg(DISTINCT pm.method_type,', ' ORDER BY pm.method_type) FROM payments p JOIN payment_methods pm ON pm.tenant_id=p.tenant_id AND pm.store_id=p.store_id AND pm.id=p.payment_method_id WHERE p.tenant_id=o.tenant_id AND p.store_id=o.store_id AND p.order_id=o.id AND p.status='succeeded'),'') AS methods
 FROM issued o ORDER BY issued_at DESC,id DESC LIMIT 10) recent),'[]'::jsonb)
)::jsonb AS payload;
