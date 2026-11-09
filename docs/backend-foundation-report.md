# FNB SaaS Backend Foundation Report

**Date:** 2026-11-10

**Scope:** Backend foundation, PostgreSQL schema, catalog and customer APIs. Existing frontend UI and CSS were left unchanged.

## Summary

A Go modular-monolith API foundation and PostgreSQL 16 target configuration were added under the existing `FNB_SaaS` project. The implementation now includes catalog/customer CRUD in addition to tenant-aware persistence, authentication, middleware and migrations. Full POS workflows remain outside this phase. Native PostgreSQL is the user's local workflow; Docker is optional.

## Architecture delivered

- **API:** Go 1.22 module with Gin, pgx, goose, zerolog, JWT, and bcrypt dependencies. The API has configuration loading, graceful shutdown, consistent JSON responses, request IDs, structured request logs, and health/readiness/metrics endpoints.
- **Authentication:** Login, refresh-token rotation, logout, bearer authentication, tenant/store context, and role-based route checks. Passwords use bcrypt; refresh tokens are opaque and only their SHA-256 hashes are persisted. JWT secrets come from environment configuration.
- **Tenant isolation:** Tenant-owned database work uses transaction-local `app.tenant_id`. Forced row-level security policies are applied to tenant tables; runtime role `fnb_app` is configured without `BYPASSRLS`. Composite foreign keys constrain tenant/store references.
- **Schema:** Goose migration includes tenants, stores, users, memberships, roles/permissions, auth sessions, product categories/products/variants, customers, orders/order items, payment methods, and payments. Monetary values use integer VND columns.
- **Local runtime:** Docker Compose provisions PostgreSQL, runs migrations before the API, and offers a one-time bootstrap command for the first tenant/store/owner. The API image builds with Go 1.23 and runs as a non-root Alpine user.
- **SQLC:** SQLC v1.29.0 generated typed query code in `apps/api/internal/dbgen`. Tenant lookup, login identity, and membership-store reads use generated queries; session and refresh flows still use pgx directly.
- **Business APIs:** Products/categories and customers/groups support authenticated CRUD, role gates, validation and soft deletion. Products/customers support filtering, literal search, sorting and pagination. Product child attributes/units are replaced atomically; per-tenant codes are allocated with a transactional counter. Customer paid-order metrics are calculated in SQL for the selected store.
- **Migration 2:** Adds menu metadata, product conversion units, customer groups/points and entity counters with forced RLS. See the [API contract](./catalog-customers-api.md) and [ADR-002](./ADR-002-catalog-customers.md).
- **CI:** A [GitHub Actions workflow](../.github/workflows/api.yml) defines formatting, SQLC drift, vet, build and race-enabled integration checks against PostgreSQL 16. No GitHub run has been executed yet.

## Main files

- API entry point: [`apps/api/cmd/api/main.go`](../apps/api/cmd/api/main.go)
- Authentication: [`apps/api/internal/modules/auth/auth.go`](../apps/api/internal/modules/auth/auth.go)
- Tenant transaction helper: [`apps/api/internal/database/pool.go`](../apps/api/internal/database/pool.go)
- Initial schema: [`apps/api/migrations/00001_foundation.sql`](../apps/api/migrations/00001_foundation.sql)
- Docker image: [`apps/api/Dockerfile`](../apps/api/Dockerfile)
- Compose stack: [`deploy/docker-compose.yml`](../deploy/docker-compose.yml)
- Local environment template: [`deploy/.env.example`](../deploy/.env.example)
- Make targets: [`Makefile`](../Makefile)
- API setup guide: [`apps/api/README.md`](../apps/api/README.md)
- Tenant isolation integration test: [`apps/api/internal/database/tenant_isolation_test.go`](../apps/api/internal/database/tenant_isolation_test.go)

## API routes

| Route | Purpose | Authentication |
|---|---|---|
| `GET /healthz` | Process health | No |
| `GET /readyz` | Database readiness | No |
| `GET /metrics` | Prometheus request counters | No |
| `POST /api/v1/auth/login` | Sign in for a tenant and accessible store | No |
| `POST /api/v1/auth/refresh` | Rotate refresh token and issue access token | No |
| `POST /api/v1/auth/logout` | Revoke current session | Bearer token |
| `GET /api/v1/me` | Return authenticated identity and tenant/store context | Bearer token |
| `GET /api/v1/admin/access-check` | Example owner/manager authorization gate | Bearer token + role |

Responses use `{ "data": ... }`; errors use `{ "error": { "code": "...", "message": "..." } }`.

## Local usage

For a native local PostgreSQL installation, create the `fnb_app` role in pgAdmin before migration, export `DATABASE_URL`, `MIGRATIONS_DATABASE_URL`, `JWT_SECRET`, `WEB_ORIGIN`, and the `BOOTSTRAP_*` variables in the shell, then run `make migrate-up-local`, `make bootstrap-local`, and `make api-run`. Use `localhost` in the database URLs. `make api-build` and `make api-test` run without Docker. The Compose-based `make up` flow remains optional.

Use distinct owner/runtime database passwords and URL-encode reserved characters in database URLs. The bootstrap command is intentionally separate so normal `make up` does not create demo accounts.

## Verification status

| Check | Result |
|---|---|
| Whitespace scan | Completed; no trailing whitespace found in added files |
| Go formatting | Passed: `gofmt` run on Go sources |
| Go tests | Passed: unit tests and real catalog/customer HTTP integration, RLS and migration round-trip on an isolated native PostgreSQL 18.3 cluster; external auth lifecycle skipped without credentials |
| Go build | Passed: `go build ./...` |
| PostgreSQL migration / RLS integration test | User confirmed migration, bootstrap, readiness, login, and a PASS result for the RLS test on local database `fnb_saas`; credentials are not available to the agent |
| Full authentication lifecycle | User confirmed PASS for the login/refresh/logout lifecycle integration test |
| Migration rollback/reapply | User confirmed PASS for TestMigrationRoundTrip: up, down to version zero, and up again in a temporary database |
| SQLC generation | Passed: SQLC v1.29.0 generated auth lookups, catalog and customer queries |
| Go vet | Passed: `go vet ./...` |
| Race detector | Passed: `go test -race ./... -count=1` with native PostgreSQL 18.3 integration fixtures |
| PostgreSQL 16 / GitHub CI | Configured, not executed; local database checks used PostgreSQL 18.3 |
| Compose validation/startup | Not run: Docker was not used; native local PostgreSQL is the requested workflow |
| Frontend visual checks | Not applicable to this backend-only change; no frontend/CSS files were edited |

Foundation checks were previously confirmed by the user. The agent additionally ran migration 1+2 rollback/reapply, RLS and catalog/customer HTTP integration on a temporary PostgreSQL 18.3 cluster using a private Unix socket. The existing database was not modified. Frontend integration, PostgreSQL 16 verification and a live CI run remain pending.

## Out of scope / follow-up

- Order and payment endpoints, idempotent POS checkout, and payment-provider integrations.
- Frontend API wiring; backend product/customer repository endpoints are implemented.
- Granular permission enforcement, membership management, and multi-store switching within an active session.
- Extending SQLC-generated query usage to session repositories.
- Executing the configured backend CI and adding frontend visual baseline automation before UI wiring.
