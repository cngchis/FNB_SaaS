-- name: ReadCashbook :one
-- One row per successful payment: the projection cannot duplicate a collection.
WITH scoped AS (
 SELECT e.id,e.tenant_id,e.store_id,e.code,e.source,e.status,e.direction,e.amount_vnd,e.method,e.category,e.payer_group,e.payer,e.note,e.occurred_at,e.creator,e.branch,e.invoice_code,e.order_id,e.version FROM cashbook_entries e JOIN membership_stores a ON a.tenant_id=e.tenant_id AND a.store_id=e.store_id AND a.membership_id=sqlc.arg(membership_id)
 WHERE e.tenant_id=sqlc.arg(tenant_id) AND (sqlc.narg(store_id)::uuid IS NULL OR e.store_id=sqlc.narg(store_id))
 AND (sqlc.arg(method)::text='' OR e.method=sqlc.arg(method))
), period AS (
 SELECT sc.id,sc.tenant_id,sc.store_id,sc.code,sc.source,sc.status,sc.direction,sc.amount_vnd,sc.method,sc.category,sc.payer_group,sc.payer,sc.note,sc.occurred_at,sc.creator,sc.branch,sc.invoice_code,sc.order_id,sc.version FROM scoped sc WHERE (sqlc.narg(date_from)::timestamptz IS NULL OR sc.occurred_at>=sqlc.narg(date_from)) AND (sqlc.narg(date_until)::timestamptz IS NULL OR sc.occurred_at<sqlc.narg(date_until))
), filtered AS (
 SELECT pr.id,pr.tenant_id,pr.store_id,pr.code,pr.source,pr.status,pr.direction,pr.amount_vnd,pr.method,pr.category,pr.payer_group,pr.payer,pr.note,pr.occurred_at,pr.creator,pr.branch,pr.invoice_code,pr.order_id,pr.version FROM period pr WHERE (sqlc.arg(status)::text='' OR pr.status=sqlc.arg(status))
 AND (pr.code ILIKE sqlc.arg(search)::text OR pr.note ILIKE sqlc.arg(search)::text OR pr.payer ILIKE sqlc.arg(search)::text OR coalesce(pr.invoice_code,'') ILIKE sqlc.arg(search)::text)
), page AS (
 SELECT f.id,f.tenant_id,f.store_id,f.code,f.source,f.status,f.direction,f.amount_vnd,f.method,f.category,f.payer_group,f.payer,f.note,f.occurred_at,f.creator,f.branch,f.invoice_code,f.order_id,f.version FROM filtered f ORDER BY
 CASE WHEN sqlc.arg(sort)::text='code' AND sqlc.arg(direction)::text='asc' THEN f.code END ASC,
 CASE WHEN sqlc.arg(sort)::text='code' AND sqlc.arg(direction)::text='desc' THEN f.code END DESC,
 CASE WHEN sqlc.arg(sort)::text='amount_vnd' AND sqlc.arg(direction)::text='asc' THEN f.amount_vnd END ASC,
 CASE WHEN sqlc.arg(sort)::text='amount_vnd' AND sqlc.arg(direction)::text='desc' THEN f.amount_vnd END DESC,
 CASE WHEN sqlc.arg(sort)::text='occurred_at' AND sqlc.arg(direction)::text='asc' THEN f.occurred_at END ASC,
 CASE WHEN sqlc.arg(sort)::text='occurred_at' AND sqlc.arg(direction)::text='desc' THEN f.occurred_at END DESC,
 f.id ASC LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset)
), totals AS (
 SELECT coalesce((SELECT sum(CASE WHEN direction='in' THEN amount_vnd ELSE -amount_vnd END) FROM scoped WHERE status='posted' AND sqlc.narg(date_from)::timestamptz IS NOT NULL AND occurred_at<sqlc.narg(date_from)),0) AS opening_vnd,
 coalesce(sum(amount_vnd) FILTER(WHERE status='posted' AND direction='in'),0) AS income_vnd,
 coalesce(sum(amount_vnd) FILTER(WHERE status='posted' AND direction='out'),0) AS expense_vnd FROM period
)
SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(page)) FROM page),'[]'::jsonb),
 'total',(SELECT count(*) FROM filtered),
 'summary',(SELECT jsonb_build_object('opening_vnd',opening_vnd,'income_vnd',income_vnd,'expense_vnd',expense_vnd,'closing_vnd',opening_vnd+income_vnd-expense_vnd) FROM totals))::jsonb AS payload;
