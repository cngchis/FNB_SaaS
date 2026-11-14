# ADR-010: Transactional stock ledger, nonnegative stock and counted opening balances

Date: 2026-11-14. Status: implemented; extra draft UI actions await approval under UI FREEZE.

## Decision

- The append-only stock movement ledger owns quantity history. `stock_balances` is its synchronous projection, updated in the same tenant transaction. Quantities use exact PostgreSQL numeric values and Go rational arithmetic; money remains integer VND. Lon and Thùng share one base-unit balance.
- Posted purchase receipts add stock. The first successful checkout (including a partial cash payment or zero-total checkout) issues stock for the entire goods order. Later debt collections do not issue stock again. Estimated orders do not reserve stock; simultaneous estimates can exist, but insufficient stock blocks checkout.
- Issued, still editable receivables reconcile only their quantity change in the same order-update transaction. Decreases restore stock. There is no automatic stock effect for prepared or non-stock-tracked goods; recipes/BOM remain separate work.
- Every ordered line snapshots whether it tracks stock, its base unit and its conversion ratio. Existing snapshots survive catalog price/ratio changes. Products referenced by stock or order history cannot change stock identity or be deleted. A legacy unresolved conversion blocks checkout instead of guessing a ratio.
- Writers lock products and balance rows in product UUID order. Missing balance rows are materialized before locking. A conditional update and a database nonnegative constraint prevent overselling. Payment, invoice, stock movement, balance and idempotency response commit or roll back together. A replay returns the committed result, and a failed transaction does not consume its key.
- Each stocktake line captures a balance version and quantity. Posting locks all involved balances, compares versions and base units, and records the exact difference. Any intervening movement or other count requires a recount, even if the quantity later returns to the same number. Zero-difference counts still advance the balance version.
- Stocktake create/update/post endpoints support drafts and optimistic document versions. The existing frontend Save action uses atomic create-and-confirm; it does not leave half-created documents after a timeout. Dedicated draft buttons are not added without UI approval.
- New tables force tenant RLS; handlers additionally enforce store scope and owner/manager permissions for counts. Quantity reads also serve cashier/kitchen roles. Client-supplied tenant/store IDs are never trusted.

## Cutover and compatibility

Stop the old API before applying migration 7. The old schema only records incoming stock, so pre-cutover goods require a physical opening count per store. They expose unknown balances as null/`—` and cannot be checked out until confirmed. Incoming purchases alone do not certify an old opening balance. Newly created goods start at known zero; ordinary receipts then increase stock.

Historical invoices are marked as already issued. Migration does not fabricate historical outbound movements or deduct their items again. Current catalog ratios are captured for legacy open lines when available; unresolved units require recreating the order. A physical count corrects the old incoming-only projection through an auditable adjustment. No demo inventory is imported.

Migration rollback refuses to discard posted sale/stocktake movements. Empty fixture schemas still support up/down/up. Do not roll back a live store to work around an application error.

## Read models and limits

Quantity and retail-value summaries remain unknown until all relevant opening balances are confirmed. Retail value is floored to integer VND in SQL and displayed as BigInt; it is not FIFO/weighted-average valuation. Sale/count movement costs are null when no defensible base-unit cost is available. Existing invoice item cost snapshots remain unchanged.

Balance projections can be reconciled by summing ledger deltas by tenant/store/product. A repair must also invalidate draft balance versions; no automated rebuild command is introduced here. Cache updates follow successful mutations; no new realtime transport is added.

The prototype has no minimum-stock configuration, so minimum/low-stock metrics and their filter remain unknown/disabled. Mobile selectors hiding inventory rows beyond six remain frozen pending explicit approval. Purchasing in converted units, refunds/cancellations, reservations, BOM and accounting valuation are not implemented by this change.
