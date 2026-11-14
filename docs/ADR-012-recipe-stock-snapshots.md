# ADR-012: Recipe snapshots and ingredient stock

Date: 2026-11-14. Status: backend implemented; recipe editor UI pending explicit approval.

## Source of truth and scope

Recipes belong to a tenant's prepared product; ingredient quantities use each ingredient's base stock unit. Only active stock-tracked goods may be ingredients. Nested prepared recipes are rejected. All stores share the catalog recipe but consume their own JWT-selected stock balance.

A recipe selection contains one sale unit and a complete set of selected attribute pairs. The exact selection wins; otherwise the same unit's empty-attribute recipe is the default. Recipes are never scaled automatically between sale units. Each converted sale unit needs its own recipe to avoid ambiguous size/conversion rules.

## Compatibility

Existing prepared products without any recipes retain their legacy behavior. Saving the first recipe enables recipe enforcement for new selections on that product. A configured product without a matching recipe is rejected. Existing order lines keep their original snapshots, including legacy lines without a recipe. Increasing a legacy line after recipe enablement is rejected; recreate that selection to capture a recipe. No historical stock deduction is backfilled.

## Transactions and snapshots

Owner/manager recipe writes require an idempotency key and the current recipe version. The prepared-product lock serializes recipe edits with order creation. Recipe ingredients and selector validation commit atomically with the deduplication response. Unknown response retries return the stored result; a changed payload under the same key conflicts.

New order lines and ordering-round deltas capture recipe ID/version, ingredient identities/names/base units, exact per-sale quantities and catalog cost snapshots. Existing lines preserve that snapshot even when increased. Removing a current line does not erase its ordering-round recipe history. The first payment (including partial payment) consumes the whole order; subsequent debt collection never repeats the issue. Edits to an issued receivable reconcile only the stock difference. All ingredient and retail demands are aggregated before balance locks, in sorted product order.

Payment/order, invoice, cashbook payment, ledger movements, balances and idempotency records share the existing database transaction. Shortage or a concurrent losing checkout rolls back every effect. Estimated orders do not reserve stock.

## Precision and costs

Ingredient quantities are positive decimal strings with at most six decimal places, at most 1,000,000,000 per sale unit. Go rational arithmetic and browser BigInt avoid floating-point stock arithmetic. Multiplication by integer order quantity remains exact at ledger precision.

Cost uses catalog ingredient costs captured with the recipe snapshot, not FIFO/weighted-average valuation. A missing cost or fractional VND total remains null; no invented rounding or zero substitution. Posted stock remains the authority; the browser warning is advisory and can be stale.

## Schema and rollback

Migration 9 adds normalized recipes/ingredients with forced RLS and composite tenant foreign keys, plus order recipe snapshots. Product/ingredient stock identity changes and deletion are guarded. Rollback refuses to discard configured recipes or order snapshots. No real database is migrated by test fixtures.

No existing UI layout, CSS, route, component structure or baseline is changed. The requested recipe editor requires an explicit UI FREEZE exception before implementation.
