# ADR-007: Store-scoped reporting from invoices and settled cash movements

## Decision

Expose `GET /api/v1/reports/summary?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&granularity=hour|day` to owner, manager and cashier. Kitchen is denied. Reports always use the authenticated JWT store, even for an owner with multiple store grants. There is no new store selector or implicit tenant-wide aggregation.

Use one SQLC statement in the existing tenant-local transaction. PostgreSQL RLS and explicit tenant/store predicates both apply. No materialized cache, schema migration, dependency or new service is needed. Recompute from source rows on every request. Browser queries refresh every 30 seconds and are keyed by tenant/store/user/range; no cross-scope placeholder data is retained.

## Accounting semantics

- Revenue: issued, noncancelled/nonrefunded invoices, attributed to first invoice issue time, not order arrival or payment date. Drafts are excluded. Unpaid invoice value is included in revenue.
- Discount: the order-level recorded discount. Category amounts use net line amounts after proportional discount allocation. Allocate integer VND by flooring shares, then give remaining VND to lines ordered by fractional remainder and line ID. Group totals reconcile exactly to revenue.
- Payment summaries: succeeded payment `amount_vnd`, at payment creation/settlement time for the current synchronous cash flow. Never use received/tendered cash, change, order totals per payment or the number of ordering rounds.
- `paid_vnd` and `debt_vnd` refer to current balances of the selected invoice cohort; late collections change these balances without creating new revenue. Settlement totals are a separate period-based measure.
- Cost: historical `order_items.unit_cost_vnd * quantity`; never the latest catalog cost. Any unknown cost makes the affected bucket and total cost/profit null. Empty buckets are zero. Negative gross profit is valid. Gross profit is revenue minus cost, before operating expenses.
- Manual posted operating-expense vouchers supply operating expense; purchase expense is not automatically a cost of goods sold.
- Cashbook opening/income/expense/closing are recorded ledger amounts, not verified physical cash or external bank balances. Pending vouchers are excluded.
- Registered customer counts exclude anonymous purchases. Recent invoices are capped at ten; aggregates have no such cap. Category names reflect current catalog classification because category snapshots are not yet stored.
- Vietnam business time is fixed UTC+07. Date ends are inclusive in the API and exclusive next midnight in SQL. Hourly ranges are limited to one day, daily ranges to 366 days. Reject aggregates outside JavaScript's safe integer range, including costs and negative profits. Decode SQL JSON numbers exactly and normalize integral numeric values to integer JSON tokens; never pass monetary validation through floating-point conversion.

## UI preservation and limits

Existing DOM/classes/CSS/routes and mock-mode screenshot baselines remain unchanged. Connected values replace demo values; missing data is a dash, not demo fallback. Loading/error/unknown-cost information uses existing toast/empty-state patterns. Period selection, CSV export and chart series use the same scoped payload.

The dashboard payment donut has labels referring to revenue. Cash receipts differ from revenue for credit sales. User approval was requested to change only these two labels to actual cash collection terminology. Until approval, API-mode donut values remain unavailable rather than presenting settlement totals as revenue. Mock rendering remains unchanged.

End-of-day shift data and physical-count reconciliation do not exist yet. The existing shift fields and difference show unknown and the API-mode close-shift action is disabled. No shift is fabricated or locally marked as server-closed. Inventory remains a clearly identified prototype until stock movements/BOM exist. Dashboard low-stock count is unknown in API mode.

## Rollout and future work

Requires existing migration 4 for the cashbook view; no migration 5. Restart the updated API. Actual application databases are not touched by automated tests, which provision isolated clusters/databases.

Later work: durable shifts and reconciliation with an approved UI proposal, inventory ledger/BOM, historical category snapshots, audited invoice corrections/refunds, verified asynchronous settlement timestamps and method expansion. Add or tune reporting indexes after measuring realistic volumes and query plans; do not introduce a cache to hide undefined accounting semantics. Detailed category exports use the same single report payload, not paginated mutable snapshots.
