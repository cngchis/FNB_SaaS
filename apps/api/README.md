# FNB SaaS API foundation

Go API foundation for the existing FNB SaaS frontend. The API is a modular monolith; tenant-owned reads and writes must run through `database.WithTenantTx`, which sets transaction-local `app.tenant_id` before executing SQL. The runtime PostgreSQL role has `NOBYPASSRLS` and is not a schema owner.

## Local development

### Saved native backend configuration

`make api-run` (also available as `make api-run-local`) automatically reads
[`apps/api/.env`](./.env) when present. Without that file it uses the exported
environment as before. This does not change the container startup command or
load secrets into Vite's frontend configuration.

For a fresh checkout, copy [`.env.example`](./.env.example) to `.env` inside
`apps/api`, set `PGPASSWORD` to the runtime `fnb_app` password, and replace
`JWT_SECRET` with a value generated once using `openssl rand -hex 32`.
Keep values shell-quoted as shown in the example and protect the file with
`chmod 600 apps/api/.env` from the project root. The file is ignored by Git.
Do not put backend passwords or JWT signing secrets in frontend `VITE_*` values.

Then each startup from the project root only needs:

```bash
make api-run
```

The file's values take precedence over exported variables for this local target.
Migration and bootstrap commands still use their separately exported admin
configuration; they do not read this runtime `.env` file. A direct
`go run ./cmd/api` also still requires exported environment variables.

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

### Migration round-trip check

Set `TEST_DATABASE_ADMIN_URL` and optionally `TEST_DATABASE_ADMIN_PASSWORD`, then run `go test -v ./internal/database -run '^TestMigrationRoundTrip$' -count=1` from `apps/api`. The account needs permission to create and drop databases. The test creates a unique temporary database from `template0`, applies migrations, rolls them back to version zero, checks that application tables are removed, and applies migrations again. Only the newly created database is migrated and deleted; the database named in the admin URL is used as the control connection.

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

### Catalog and customer APIs

Authenticated CRUD endpoints are available for `/api/v1/products`, `/api/v1/product-categories`, `/api/v1/customers`, and `/api/v1/customer-groups`. Apply migration `00002_catalog_customers.sql` with `make migrate-up-local` and restart the API; do not bootstrap an existing tenant again. The frontend supports authenticated API mode with `VITE_USE_MOCK=false`; mock mode remains the default.

The [catalog/customer API guide](../../docs/catalog-customers-api.md) documents payloads, filters, role gates, full-replacement PUT behavior and remaining limitations. Reads/writes use SQLC inside tenant-scoped transactions. Product codes are allocated atomically per tenant, units have exact decimal conversion ratios and independent integer prices/costs, and customer order metrics are computed from paid orders in the authenticated store.

With `TEST_DATABASE_ADMIN_URL` and `TEST_DATABASE_URL` (plus optional password overrides) configured, run `go test -v ./tests -run '^TestCatalogCustomersAPI$' -count=1`. This test creates and removes its own temporary database, starts a real HTTP test server and exercises validation, authorization, cross-tenant isolation, CRUD and concurrent code allocation. The admin needs database-creation privileges and the runtime role must be `fnb_app` without superuser/BYPASSRLS.

- Migration 3 implements store-scoped rooms, versioned orders/rounds, idempotent saves and cash settlement with invoices. Apply it using the admin migration connection, restart the API and do not bootstrap again. See [POS progress and rollout](../../docs/rooms-pos-progress-vi.md) and [ADR-003](../../docs/ADR-003-rooms-pos-cash.md). QR providers, offline outbox, cancellation/refunds and report read models remain pending. Read-only Management invoice endpoints are available at `/api/v1/invoices` and `/api/v1/invoices/:id`; see [invoice integration progress](../../docs/invoices-api-progress-vi.md).
- Authentication supports one selected store per session. Authorization is currently role-based at the route middleware level; granular permission enforcement and membership administration are future work.
- Stock ledgers, recipe-derived costs and object storage/image uploads are not implemented. `image_url` accepts URLs or absolute asset paths, not base64 data URLs.
- Live integration checks need database/account credentials supplied through environment variables. SQLC generation covers catalog, customers and initial auth lookups; session queries still use pgx directly.
- The API GitHub Actions workflow targets PostgreSQL 16; it has not run yet. Agent-executed native integration checks used an isolated PostgreSQL 18.3 cluster, not the user's existing database.
