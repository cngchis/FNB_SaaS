-- name: ListCustomerGroups :many
SELECT g.*, (SELECT count(*) FROM customers c WHERE c.tenant_id = g.tenant_id AND c.group_id = g.id AND c.deleted_at IS NULL)::bigint AS members
FROM customer_groups g WHERE g.tenant_id = $1 AND g.deleted_at IS NULL ORDER BY g.name, g.id;

-- name: GetCustomerGroup :one
SELECT * FROM customer_groups WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL FOR SHARE;

-- name: CreateCustomerGroup :one
INSERT INTO customer_groups (tenant_id, name, condition, benefit, is_active) VALUES ($1,$2,$3,$4,$5) RETURNING *;

-- name: UpdateCustomerGroup :one
UPDATE customer_groups SET name = $3, condition = $4, benefit = $5, is_active = $6, updated_at = now()
WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING *;

-- name: DetachCustomerGroup :exec
UPDATE customers SET group_id = NULL, updated_at = now() WHERE tenant_id = $1 AND group_id = $2;

-- name: DeleteCustomerGroup :execrows
UPDATE customer_groups SET deleted_at = now(), updated_at = now() WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL;

-- name: CountCustomers :one
SELECT count(*) FROM customers c WHERE c.tenant_id = sqlc.arg(tenant_id) AND c.deleted_at IS NULL
AND (c.name ILIKE sqlc.arg(search) OR coalesce(c.phone, '') ILIKE sqlc.arg(search) OR coalesce(c.email, '') ILIKE sqlc.arg(search))
AND (sqlc.narg(group_id)::uuid IS NULL OR c.group_id = sqlc.narg(group_id));

-- name: ListCustomers :many
SELECT c.*, g.name AS group_name,
(SELECT count(*) FROM orders o WHERE o.tenant_id = c.tenant_id AND o.store_id = sqlc.arg(store_id) AND o.customer_id = c.id AND o.deleted_at IS NULL AND o.status = 'paid')::bigint AS order_count,
(SELECT coalesce(sum(o.total_vnd), 0) FROM orders o WHERE o.tenant_id = c.tenant_id AND o.store_id = sqlc.arg(store_id) AND o.customer_id = c.id AND o.deleted_at IS NULL AND o.status = 'paid')::bigint AS spent_vnd
FROM customers c LEFT JOIN customer_groups g ON g.tenant_id = c.tenant_id AND g.id = c.group_id AND g.deleted_at IS NULL
WHERE c.tenant_id = sqlc.arg(tenant_id) AND c.deleted_at IS NULL
AND (c.name ILIKE sqlc.arg(search) OR coalesce(c.phone, '') ILIKE sqlc.arg(search) OR coalesce(c.email, '') ILIKE sqlc.arg(search))
AND (sqlc.narg(group_id)::uuid IS NULL OR c.group_id = sqlc.narg(group_id))
ORDER BY
CASE WHEN sqlc.arg(sort)::text = 'name' AND sqlc.arg(direction)::text = 'asc' THEN c.name END ASC,
CASE WHEN sqlc.arg(sort)::text = 'name' AND sqlc.arg(direction)::text = 'desc' THEN c.name END DESC,
CASE WHEN sqlc.arg(sort)::text = 'points' AND sqlc.arg(direction)::text = 'asc' THEN c.points END ASC,
CASE WHEN sqlc.arg(sort)::text = 'points' AND sqlc.arg(direction)::text = 'desc' THEN c.points END DESC,
CASE WHEN sqlc.arg(sort)::text = 'created_at' AND sqlc.arg(direction)::text = 'asc' THEN c.created_at END ASC,
CASE WHEN sqlc.arg(sort)::text = 'created_at' AND sqlc.arg(direction)::text = 'desc' THEN c.created_at END DESC,
c.id ASC LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: GetCustomer :one
SELECT * FROM customers WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL;

-- name: GetCustomerDetails :one
SELECT c.*, g.name AS group_name,
(SELECT count(*) FROM orders o WHERE o.tenant_id = c.tenant_id AND o.store_id = sqlc.arg(store_id) AND o.customer_id = c.id AND o.deleted_at IS NULL AND o.status = 'paid')::bigint AS order_count,
(SELECT coalesce(sum(o.total_vnd), 0) FROM orders o WHERE o.tenant_id = c.tenant_id AND o.store_id = sqlc.arg(store_id) AND o.customer_id = c.id AND o.deleted_at IS NULL AND o.status = 'paid')::bigint AS spent_vnd
FROM customers c LEFT JOIN customer_groups g ON g.tenant_id = c.tenant_id AND g.id = c.group_id AND g.deleted_at IS NULL
WHERE c.tenant_id = sqlc.arg(tenant_id) AND c.id = sqlc.arg(id) AND c.deleted_at IS NULL;

-- name: CreateCustomer :one
INSERT INTO customers (tenant_id, name, phone, email, note, group_id, points) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *;

-- name: UpdateCustomer :one
UPDATE customers SET name = $3, phone = $4, email = $5, note = $6, group_id = $7, points = coalesce(sqlc.narg(points)::bigint, points), updated_at = now()
WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING *;

-- name: DeleteCustomer :execrows
UPDATE customers SET deleted_at = now(), updated_at = now() WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL;

-- name: GetCustomerDebt :one
-- Only issued, outstanding invoices are receivables; drafts are not debt.
SELECT c.id AS customer_id,
 (SELECT coalesce(sum(greatest(o.total_vnd-coalesce((SELECT sum(p.amount_vnd) FROM payments p WHERE p.tenant_id=o.tenant_id AND p.store_id=o.store_id AND p.order_id=o.id AND p.status='succeeded'),0),0)),0)::numeric
  FROM orders o JOIN invoices i ON i.tenant_id=o.tenant_id AND i.store_id=o.store_id AND i.order_id=o.id
  WHERE o.tenant_id=c.tenant_id AND o.store_id=sqlc.arg(store_id) AND o.customer_id=c.id AND o.deleted_at IS NULL AND o.status NOT IN ('cancelled','refunded','paid')
  AND (sqlc.narg(exclude_order_id)::uuid IS NULL OR o.id<>sqlc.narg(exclude_order_id))) AS outstanding_vnd
FROM customers c WHERE c.tenant_id=sqlc.arg(tenant_id) AND c.id=sqlc.arg(id) AND c.deleted_at IS NULL
AND (sqlc.narg(exclude_order_id)::uuid IS NULL OR EXISTS(SELECT 1 FROM orders x WHERE x.tenant_id=c.tenant_id AND x.store_id=sqlc.arg(store_id) AND x.id=sqlc.narg(exclude_order_id) AND x.deleted_at IS NULL));

-- name: LockCustomerForDeletion :one
SELECT id FROM customers WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE;

-- name: CustomerHasOpenOrders :one
SELECT EXISTS(SELECT 1 FROM orders WHERE tenant_id=$1 AND customer_id=$2 AND deleted_at IS NULL AND status IN ('open','estimated','pending_payment'))::boolean;
