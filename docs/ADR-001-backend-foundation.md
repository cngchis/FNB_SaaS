# ADR-001: Backend foundation and tenant isolation

- Status: accepted
- Date: 2026-11-10

## Context

The existing React/Vite UI is frozen. The backend needs a PostgreSQL foundation for a multi-tenant Retail & F&B SaaS without changing existing frontend rendering or implementing full POS workflows in this phase.

## Decisions

- Keep the existing frontend in place; add a Go modular monolith under `apps/api` and local runtime configuration under `deploy`.
- Use PostgreSQL 16, pgx, goose migrations, and a dedicated `fnb_app` role with `NOBYPASSRLS` for runtime requests.
- Require tenant-scoped database work to run in a transaction that sets `app.tenant_id` using transaction-local `set_config`.
- Keep user identity global while tenant membership and session scope control access; store grants are explicit per membership.
- Use bcrypt for passwords, signed short-lived HS256 access tokens, and random rotating refresh tokens stored only as hashes.
- Store money as integer VND (`bigint`) and order items as normalized rows rather than display strings.
- Keep SQLC configuration and query sources alongside pgx; generate typed repository code when the toolchain is available and module repositories are introduced.

## Consequences

- Application queries must use `WithTenantTx`; querying tenant tables with the runtime pool directly intentionally returns no tenant data through RLS.
- First-run initialization scripts only create the runtime role for a fresh PostgreSQL data volume. Changing runtime credentials on an existing volume requires updating the role explicitly.
- Backend build and database integration checks require Go and Docker Compose, which were unavailable during initial implementation review.
