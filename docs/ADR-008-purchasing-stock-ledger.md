# ADR-008: Purchasing drafts and an append-only receipt ledger

## Decision

Add a purchasing domain to the existing modular monolith. Migration 5 creates tenant-owned suppliers, store-owned purchase receipts/items, an append-only incoming stock ledger and a rebuildable stock balance projection. Every new table has forced tenant RLS. No new dependencies, extensions or services.

Suppliers are shared within a tenant. Receipt, movement, balance and supplier-debt reads always use the JWT-selected store. Owner/manager can operate purchasing; cashier/kitchen cannot. Supplier names/codes are tenant-unique; supplier debt is derived from posted receipts in the selected store, not a freely editable balance.

## Commands and invariants

- Creating/saving a draft records normalized items and historical name/SKU/base-unit/cost snapshots, without changing stock.
- Posting locks the receipt, checks its optimistic version, locks products in deterministic ID order, validates current stock eligibility and base-unit identity, appends exactly one movement per receipt item, increments balances and marks the receipt posted in one PostgreSQL transaction.
- Quantities currently accept whole base units only, 1 through 1,000,000,000. Unit costs and totals are integer VND within JavaScript's safe range. Multiplication/addition are checked before writing. Prepared/untracked products and duplicate product lines are rejected. Alternate packaging conversion is not implemented in this phase.
- An idempotency record, request hash and exact response commit with each supplier/receipt create/update/post. An unknown commit is safely replayed. Different payloads on the same key conflict. Posting an already-posted receipt with another key is a no-op.
- Supplier and receipt edits require current versions. A referenced supplier cannot be deleted. Posted receipts cannot be edited through the API; no unaudited delete/reversal endpoint is exposed.
- Runtime has no UPDATE/DELETE permission on movements; a database trigger also rejects their mutation by table owners. Product stock identity and soft deletion are blocked once stock history exists, preventing unit reinterpretation. Catalogue price/cost edits remain allowed and never rewrite recorded receipt costs.
- The ledger is the source of truth. Balances are updated synchronously in the posting transaction and can be rebuilt from grouped ledger sums. The projection has no independent public write endpoint.

## Scope limits

This is the **incoming purchasing foundation**, not complete perpetual inventory. POS sales, recipes/BOM, stocktakes, transfers, opening balances and audited reversals are not yet ledger sources. Do not replace inventory reports with these incoming-only balances or claim these balances are complete physical stock.

Posting does not pay a supplier or create a cashbook expense automatically. Supplier payments/allocations are not implemented; manual cashbook expenses are not silently matched to receipts. Current supplier debt therefore includes all posted receipt value. Catalogue product cost is not automatically replaced by last purchase cost or a purported weighted average.

## UI freeze

The supplier screen uses its existing DOM/classes/layout. Its existing debt input becomes read-only in API mode; search, sorting, paging, expansion, CRUD and CSV use scoped API data. Mock-mode rendering remains unchanged.

The purchase screen currently has no posting confirmation or reopen action and contains a fixed demo-data caption. Two explicit UI FREEZE approvals have been requested: an existing-style modal with save-draft/post actions plus opening rows, and replacing the API-mode demo caption. No approval has arrived. Therefore that screen remains an explicitly identified prototype; the API and typed frontend repository are ready, but the purchase screen is not falsely labelled connected. Do not interpret a generic request to continue as approval of these UI exceptions.

## Rollout

Run migration 5 as the migration administrator, then restart the API. Do not bootstrap again or import prototype balances. Do not run down migrations against real posted receipts: rollback removes the purchasing tables and history. The migration rollback is verified only in isolated test databases.

The cashbook migration-backfill test now explicitly rolls down to version 3, preserving its original coverage after adding migration 5. Four extra supplier/purchase screenshots were captured before frontend changes; older baselines remain unchanged.
