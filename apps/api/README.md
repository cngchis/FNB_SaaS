# FNB SaaS API foundation

Go API foundation for the existing FNB SaaS frontend. The API is a modular monolith; tenant-owned reads and writes must run through `database.WithTenantTx`, which sets transaction-local `app.tenant_id` before executing SQL. The runtime PostgreSQL role has `NOBYPASSRLS` and is not a schema owner.

## Local development

Requirements for native local development: Go 1.22+, PostgreSQL 16, and goose CLI. Docker Compose is optional. `make sqlc` runs the pinned SQLC v1.29.0 CLI through Go.

1. In pgAdmin, create or select a local database (default name: `fnb_saas`) and create the runtime role before applying migrations. Use a strong local password in place of the placeholder:

   ```sql
   CREATE ROLE fnb_app LOGIN PASSWORD 'replace-with-a-local-secret' NOSUPERUSER NOBYPASSRLS;
   ```

   If the role already exists, update it with `ALTER ROLE fnb_app WITH LOGIN PASSWORD 'replace-with-a-local-secret' NOSUPERUSER NOBYPASSRLS;`. The migration connection should use a database administrator that can create tables and grant privileges.
2. Export `MIGRATIONS_DATABASE_URL` with the admin connection string and `DATABASE_URL` with the `fnb_app` connection string. Also export `JWT_SECRET` (at least 32 bytes), `WEB_ORIGIN` (usually `http://localhost:5173`), and bootstrap variables for the initial owner. URL-encode reserved characters in database URL passwords. Use `localhost` as the host for a native API process.
3. Install the matching goose CLI with `go install github.com/pressly/goose/v3/cmd/goose@v3.24.1`, then run `make migrate-up-local` to apply migrations using your local PostgreSQL.
4. Run `make bootstrap-local` once to create the first tenant/store/owner and default payment methods. Bootstrap uses the admin connection and bcrypt-hashes the supplied password.
5. Run `make api-run`. The API is available at `http://localhost:8080`; `GET /healthz`, `GET /readyz`, and `GET /metrics` are exposed outside the versioned API.

`make api-build` and `make api-test` work without Docker. `make migrate-down-local` rolls back the latest migration. The `*-local` targets use environment variables already exported in the shell. Docker Compose targets remain available as an optional isolated setup. The RLS integration test is skipped unless both `TEST_DATABASE_ADMIN_URL` and `TEST_DATABASE_URL` point to a migrated test database using an admin role and `fnb_app` respectively.

The RLS test also accepts `TEST_DATABASE_ADMIN_PASSWORD` and `TEST_DATABASE_PASSWORD` as separate password overrides, so connection strings do not need to contain passwords. It creates two temporary tenants and removes their data after the test. It requires a migrated development or test database and an admin account that can bypass RLS to prepare fixtures.

### Authentication integration check

Keep the API running, then set `AUTH_TEST_TENANT`, `AUTH_TEST_EMAIL`, and `AUTH_TEST_PASSWORD` for a provisioned account. Run `go test -v ./tests -run '^TestAuthLifecycle$' -count=1` from `apps/api`. Optionally set `AUTH_TEST_BASE_URL` (default `http://localhost:8080`). The test checks login, identity context, the role gate, refresh-token rotation, rejection of the old refresh token, logout, and rejection of tokens after logout. It revokes its own session and does not print credentials or tokens. Without credentials it skips rather than verifying a live API.

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

SQL query sources are in `sql/`; run `make sqlc` after changing them or the schema. Generated typed queries are checked in under `internal/dbgen` and are used for tenant lookup, login identity, and membership-store queries. Session and refresh flows still use pgx directly within tenant-scoped transactions.

## Current scope and known limitations

- Order/payment tables are schema foundations only; order creation, payment providers, idempotent checkout, and POS flows are not implemented in this phase.
- Authentication supports one selected store per session. Authorization is currently role-based at the route middleware level; granular permission enforcement and membership administration are future work.
- API build and Go tests pass. PostgreSQL migration and RLS integration still require database credentials configured in pgAdmin. SQLC generation has been run and integrated for the initial auth lookups.
