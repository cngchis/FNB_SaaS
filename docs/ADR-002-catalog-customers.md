# ADR-002: Transactional catalog and tenant-wide customer profiles

Date: 2026-11-10
Status: Accepted for the catalog/customer backend milestone

## Context

The existing UI stores menu attributes, conversion units and customer groups locally. The backend foundation has tenant RLS, session store context and integer money, but no CRUD endpoints for these modules. UI rendering is frozen.

## Decision

- Add product and customer domain modules with Gin handlers, application services and SQLC queries; keep the modular monolith and existing authentication middleware.
- Execute every tenant-owned operation in a transaction through `WithTenantQueries`, backed by transaction-local tenant context and forced RLS. Reject tenant/store assignment in request bodies.
- Share catalog and customer profiles across the tenant. Scope customer order metrics to the selected authenticated store; compute them from paid orders instead of accepting client totals.
- Represent attributes and conversion units as normalized child records. Store conversion ratios as PostgreSQL numeric exposed as decimal strings; keep monetary amounts integer VND.
- Allocate product codes through a per-tenant transactional counter. Save product fields and replace child collections atomically; serialize edits by locking the product row. Reference category/group rows are locked while validating assignments.
- Use full replacement PUT, soft deletes, strict JSON validation and explicit role gates. Keep existing frontend rendering and storage behavior untouched until visual baselines exist.

## Consequences

- New endpoints can be tested independently of the prototype UI. No browser or CSS changes are required in this milestone.
- Prepared products cannot manually set cost or track product stock. Ingredient inventory and recipe-derived costs are deferred.
- Child IDs are not stable across PUT; later order items must preserve snapshots and must not rely on these IDs as immutable historical pricing records.
- Last completed PUT wins; optimistic version checks are deferred. Group/category soft deletes detach references and keep unique names reserved.
- Object storage uploads, loyalty rule execution, order/payment creation and frontend HTTP wiring remain separate work.
- Native integration tests have run against PostgreSQL 18.3; the new CI workflow targets PostgreSQL 16 and still requires a GitHub run to verify that version.
