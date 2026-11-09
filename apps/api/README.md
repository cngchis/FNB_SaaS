# FNB SaaS API foundation

Go API foundation for the existing FNB SaaS frontend. The API is a modular monolith; tenant-owned reads and writes must run through `database.WithTenantTx`, which sets transaction-local `app.tenant_id` before executing SQL. The runtime PostgreSQL role has `NOBYPASSRLS` and is not a schema owner.

## Local development

Requirements: Docker Compose v2, Go 1.22+, and `sqlc` v2 for query generation.

1. From the repository root, copy `deploy/.env.example` to `deploy/.env` and replace every placeholder with local values. Use distinct passwords for the database owner and runtime role. URL-encode reserved characters in database URL passwords.
2. Run `make up` to start PostgreSQL 16, apply goose migrations, build the API image, and start the API.
3. Run `make bootstrap` once to create the first tenant/store/owner and default payment methods. Bootstrap uses the owner connection and bcrypt-hashes the supplied password.
4. The API is available at `http://localhost:8080`. `GET /healthz`, `GET /readyz`, and `GET /metrics` are exposed outside the versioned API.

`make down` stops services while preserving the named database volume. `make migrate-up` and `make migrate-down` apply or roll back the latest migration. `make api-test` runs Go tests. The RLS integration test is skipped unless both `TEST_DATABASE_ADMIN_URL` and `TEST_DATABASE_URL` point to a migrated test database using the owner and `fnb_app` roles respectively.

## API foundation

All JSON responses use `{ "data": ... }`; errors use `{ "error": { "code": "...", "message": "..." } }`. A request ID is returned in `X-Request-ID` and included in structured logs.

- `POST /api/v1/auth/login`: tenant slug, email, password, optional accessible store ID; returns short-lived access JWT and opaque refresh token.
- `POST /api/v1/auth/refresh`: rotates the refresh token and issues a new access token.
- `POST /api/v1/auth/logout`: revokes the current refresh session; requires a bearer access token.
- `GET /api/v1/me`: authenticated tenant, store, membership, user, and role context.
- `GET /api/v1/admin/access-check`: example owner/manager role gate.

Passwords are bcrypt-hashed. Refresh tokens are random opaque values; only their SHA-256 hashes are stored. JWT signing keys are supplied through `JWT_SECRET` and startup fails if it is missing or shorter than 32 bytes. The bootstrap account is provisioned explicitly and the API does not expose public registration.

## Database and tenancy

`migrations/00001_foundation.sql` creates tenants, stores, global user identities, tenant memberships/store grants, role/permission definitions, sessions, catalog, customers, orders with normalized order items, payment methods, and payments. Tenant/store relationships use composite foreign keys. Tenant-owned tables use forced PostgreSQL RLS policies based on transaction-local `app.tenant_id`. Global identity lookup is limited to tenant members by its RLS policy.

SQL query sources are in `sql/`; run `make sqlc` after changing them or the schema. Generated `internal/dbgen` is build output and is intentionally not checked in yet; the current foundation uses pgx directly while query generation is staged for module repositories.

## Current scope and known limitations

- Order/payment tables are schema foundations only; order creation, payment providers, idempotent checkout, and POS flows are not implemented in this phase.
- Authentication supports one selected store per session. Authorization is currently role-based at the route middleware level; granular permission enforcement and membership administration are future work.
- PostgreSQL migration, API build, Compose startup, and integration tests must be run in an environment with Go and Docker installed.
