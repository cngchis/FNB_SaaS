-- name: ListRooms :many
SELECT r.*, o.id AS open_order_id FROM rooms r LEFT JOIN orders o
ON o.tenant_id=r.tenant_id AND o.store_id=r.store_id AND o.room_id=r.id
AND o.deleted_at IS NULL AND o.status IN ('open','estimated','pending_payment')
WHERE r.tenant_id=$1 AND r.store_id=$2 AND r.deleted_at IS NULL ORDER BY r.name, r.id;

-- name: GetRoom :one
SELECT * FROM rooms WHERE tenant_id=$1 AND store_id=$2 AND id=$3 AND deleted_at IS NULL FOR UPDATE;

-- name: CreateRoom :one
INSERT INTO rooms(tenant_id,store_id,name,note) VALUES($1,$2,$3,$4) RETURNING *;

-- name: UpdateRoom :one
UPDATE rooms SET name=$4,note=$5,updated_at=now() WHERE tenant_id=$1 AND store_id=$2 AND id=$3 AND deleted_at IS NULL RETURNING *;

-- name: DeleteRoom :execrows
UPDATE rooms r SET deleted_at=now(),updated_at=now() WHERE r.tenant_id=$1 AND r.store_id=$2 AND r.id=$3 AND r.deleted_at IS NULL
AND NOT EXISTS(SELECT 1 FROM orders o WHERE o.tenant_id=r.tenant_id AND o.store_id=r.store_id AND o.room_id=r.id AND o.deleted_at IS NULL AND o.status IN ('open','estimated','pending_payment'));
