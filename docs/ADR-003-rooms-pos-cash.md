# ADR-003: Store-scoped rooms, versioned orders and cash settlement

Date: 2026-11-10. Status: implemented locally; production rollout pending.

## Context

The catalog/customer APIs exist, but the POS was backed by prototype storage.
The user authorized a POS toolbar change with isolated, closable order tabs.
Management layout and existing CSS rules remain frozen.

## Decisions

- Migration 3 adds rooms, normalized ordering rounds, invoices and transactional
  idempotency records. Existing order/item tables are extended rather than replaced.
- Rooms and orders belong to a tenant and selected store. All queries execute in
  `WithTenantTx` with transaction-local tenant context and forced RLS. Composite
  foreign keys prevent cross-tenant/store associations.
- Only one active order can occupy a non-null room. Takeaway has no room and may
  have multiple active orders. Owners/managers manage rooms; cashiers may read
  rooms and operate orders; kitchen cannot access POS mutations/history.
- The API calculates integer VND totals from catalog records. Clients send only
  product selections, quantities and discount, never authoritative prices/costs.
  Existing lines retain price/cost snapshots when catalog prices change.
- Optimistic order revisions reject stale updates. Each accepted revision records
  signed item deltas in an ordering round, including unit/attribute snapshots.
- Save/payment requests require idempotency keys. Payload hashes and exact results
  are stored in the same transaction as the business writes. Reusing a key with
  different input conflicts. Rollbacks leave neither partial payments nor receipts.
- Order locking serializes cash payments. Applied amount cannot exceed outstanding
  balance. Overpayment is change, not revenue. Partial settlement retains occupancy;
  full settlement releases it. Zero-value invoices create no fictitious payment.
- SQLC provides typed room queries. POS transaction workflows use parameterized pgx
  directly, consistent with existing auth transaction workflows. Future extraction
  into generated queries must preserve transaction/lock semantics.
- Frontend API mode uses TanStack Query scoped by tenant/store/user. Server orders
  survive reload; unsaved tab carts are memory-only. Mock mode remains separate.

## Limits and follow-up

Cash only. QR is explicitly unavailable until a provider, signature verification and
webhook idempotency are implemented. There is no IndexedDB offline outbox yet: API
mode refuses offline checkout and must not claim that it queued/settled an order.
There is no cancellation/refund endpoint, stock deduction, SQL cashbook/report read
model, automatic customer points or object-storage upload. Management invoices and
reports remain prototype pages with their existing demo notice. POS history is
limited to the latest 100 invoices in the selected store.

Idempotency records currently have no expiry/cleanup job; define retention before
production and do not silently expire keys while offline clients may retry them.
Frontend access/refresh tokens remain memory-only; reload requires login.
