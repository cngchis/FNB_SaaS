# ADR-004: Management invoice read model

Date: 2026-11-10. Status: implemented locally.

## Context

The POS stores normalized orders, item rounds, payments and invoice identities.
Management invoices still used prototype storage. The current UI is frozen, so
this change wires existing rows, details, metrics and actions to server data.

## Decisions

- Add read-only `/api/v1/invoices` and `/api/v1/invoices/:id` endpoints for owner,
  manager and cashier. No separate invoice CRUD write path is introduced.
- Use SQLC in tenant-scoped transactions. Both invoice and order tenant/store
  keys are checked; forced RLS continues to protect the underlying tables.
- Query issued invoices only: an estimated order with no invoice is not included.
  Partial payments produce an unpaid invoice; zero-value settled orders are paid.
- Read rows, normalized lines, succeeded-payment sums and filtered summaries in
  one SQL statement, giving them a consistent PostgreSQL statement snapshot.
  Do not copy invoice data to localStorage or calculate summary totals from one
  paginated page. These are live SQL projections, not separately persisted copies.
- VND values remain integers. Summaries that exceed JavaScript's safe integer
  range are rejected rather than rounded. API order quantities are integers,
  matching the POS contract.
- Date filters use order arrival time, corresponding to the existing “Giờ đến”
  column. YYYY-MM-DD boundaries use UTC+07:00. The start is inclusive; the end is
  the exclusive start of the following day. Issued timestamp is also returned.
- Filtered totals are invoice value after discount, not collected cash/revenue
  recognition. The existing daily count metric counts arrivals today within the
  current filters; unpaid count covers all matching unpaid invoices.
- Frontend queries and CSV exports are scoped to tenant/store/user. Desktop uses
  server pagination; mobile uses the existing infinite-scroll pattern. Mock mode
  and its visual snapshots remain unchanged.
- The existing add action routes to POS. Edit opens existing detail and explains
  read-only behavior; delete reports that cancellation/refund requires its own
  workflow. Neither action opens a misleading edit/delete form or writes demo data.
- No receiver is recorded in the current schema, so its cell is `—` rather than
  inventing an employee. Creator, customer, room and branch names use current joined
  records. Immutable identity/name snapshots are a future audit requirement.

## Limits and rollout

No new migration or dependency. Existing installations need migrations 1–3, then
restart API and frontend. UI date controls require explicit approval under the UI
freeze and are not added by this change; API date filtering is available now.
Invoice cancellation, refunds, collections, cashbook/report projections, QR,
offline outbox and image uploads remain separate work.

The projection reflects edits to an unpaid order and later payments immediately;
POS already rejects changes to paid orders. CSV is paged and not a cross-request
snapshot, so concurrent new invoices/updates may change it during export. A fixed
snapshot export/job is future work if strict audit-grade exports are required.
