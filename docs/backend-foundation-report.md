# FNB SaaS Backend Foundation Report

**Date:** 2026-11-10

**Scope:** Backend foundation and PostgreSQL schema. Existing frontend UI and CSS were left unchanged.

## Summary

A Go modular-monolith API foundation and PostgreSQL 16 setup were added under the existing `FNB_SaaS` project. The implementation establishes tenant-aware persistence, initial authentication, API middleware, database migrations, and local container orchestration. Full POS workflows and business modules are outside this phase.

## Architecture delivered

- **API:** Go 1.22 module with Gin, pgx, goose, zerolog, JWT, and bcrypt dependencies. The API has configuration loading, graceful shutdown, consistent JSON responses, request IDs, structured request logs, and health/readiness/metrics endpoints.
- **Authentication:** Login, refresh-token rotation, logout, bearer authentication, tenant/store context, and role-based route checks. Passwords use bcrypt; refresh tokens are opaque and only their SHA-256 hashes are persisted. JWT secrets come from environment configuration.
- **Tenant isolation:** Tenant-owned database work uses transaction-local `app.tenant_id`. Forced row-level security policies are applied to tenant tables; runtime role `fnb_app` is configured without `BYPASSRLS`. Composite foreign keys constrain tenant/store references.
- **Schema:** Goose migration includes tenants, stores, users, memberships, roles/permissions, auth sessions, product categories/products/variants, customers, orders/order items, payment methods, and payments. Monetary values use integer VND columns.
- **Local runtime:** Docker Compose provisions PostgreSQL, runs migrations before the API, and offers a one-time bootstrap command for the first tenant/store/owner. The API image builds with Go 1.23 and runs as a non-root Alpine user.
- **SQLC:** SQLC v1.29.0 generated typed query code in `apps/api/internal/dbgen`. Tenant lookup, login identity, and membership-store reads use generated queries; session and refresh flows still use pgx directly.

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
| Go tests | Passed: `go test ./...`; PostgreSQL RLS integration test skipped because test database URLs are not configured |
| Go build | Passed: `go build ./...` |
| PostgreSQL migration / RLS integration test | User confirmed migration, bootstrap, readiness, login, and a PASS result for the RLS test on local database `fnb_saas`; credentials are not available to the agent |
| Full authentication lifecycle | Integration test added; live execution still requires account credentials and the running API |
| SQLC generation | Passed: generated with SQLC v1.29.0; initial auth lookups use generated query methods |
| Compose validation/startup | Not run: Docker was not used; native local PostgreSQL is the requested workflow |
| Frontend visual checks | Not applicable to this backend-only change; no frontend/CSS files were edited |

The API has compiled. Local migration, bootstrap, basic login, and cross-tenant isolation have been confirmed by the user. The complete authentication lifecycle test still needs a live run; this report distinguishes user-confirmed results from agent-executed checks.

## Out of scope / follow-up

- Order and payment endpoints, idempotent POS checkout, and payment-provider integrations.
- Product/customer repository endpoints and frontend API wiring.
- Granular permission enforcement, membership management, and multi-store switching within an active session.
- Extending SQLC-generated query usage to session and business module repositories.
- CI execution and the full authentication lifecycle integration run.
