-- name: GetTenantBySlug :one
SELECT id::text AS id, name, slug
FROM tenants
WHERE slug = lower(sqlc.arg(slug)) AND deleted_at IS NULL;

-- name: GetLoginIdentity :one
SELECT u.id::text AS user_id, u.email, u.display_name, u.password_hash,
       m.id::text AS membership_id, m.role_slug AS membership_role, r.name AS role_name
FROM users AS u
JOIN memberships AS m ON m.user_id = u.id AND m.tenant_id::text = sqlc.arg(tenant_id)::text
JOIN roles AS r ON r.slug = m.role_slug
WHERE lower(u.email) = lower(sqlc.arg(email))
  AND m.status = 'active'
  AND u.deleted_at IS NULL
  AND m.deleted_at IS NULL;

-- name: ListMembershipStores :many
SELECT s.id::text AS id, s.name, s.slug
FROM membership_stores AS ms
JOIN stores AS s ON s.id = ms.store_id AND s.tenant_id = ms.tenant_id
WHERE ms.tenant_id::text = sqlc.arg(tenant_id)::text
  AND ms.membership_id::text = sqlc.arg(membership_id)::text
  AND s.deleted_at IS NULL
ORDER BY s.name;
