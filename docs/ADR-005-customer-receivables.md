# ADR-005: Customer receivables and continued cash collection

Date: 2026-11-10. Status: implemented locally.

## Decisions

- Receivables are a live SQL projection of issued invoices and succeeded payments.
  Do not store a mutable customer balance or treat an estimated cart as debt.
- `GET /api/v1/customers/:id/debt` returns integer VND for the authenticated store.
  Tenant scope comes from JWT/RLS. Customers are tenant-owned; their balance is
  store-scoped, so another accessible store may legitimately return zero.
- `exclude_order_id` removes the active cart order from “previous debt”. The API
  validates that the excluded order belongs to the authenticated tenant/store.
  The cart independently shows that order's remaining amount; it does not collect
  the customer's entire balance as part of a new sale.
- Existing POS payment creation is the only collection write path. Reopening an
  unpaid invoice loads its order, received payments and remaining balance. Keep
  the same idempotency key when retrying a failed/unknown payment response. The
  existing transaction and order lock prevent double collection or overpayment.
- An issued invoice cannot silently change customer. Customer reassignment needs
  an explicit audited correction workflow, not a normal cart edit.
- Customer deletion takes an exclusive customer row lock and rejects open orders
  across the tenant. Order creation already takes a shared customer lock. This
  serializes deletion with new sales and preserves the ability to collect debt.
- Frontend balance queries are tenant/store/user/customer/order scoped and refreshed
  after writes and every 15 seconds. Pending/error balances display `—`, not zero;
  errors use the existing POS state and do not fall back to mock data.
- Recent/draft popup details render as the immediate sibling of the clicked row.
  Only one detail is expanded per popup. Explicit open actions resume the order in
  the cart; viewing a detail alone does not replace the current cart.

## Limits

This is store-scoped receivables, not consolidated cross-store accounting. No
receivables aging, bulk payment allocation, refunds, audit correction UI, write-off,
customer ledger or CSV receivables statement is introduced. Offline outbox, durable
browser payment keys across reload and provider QR remain separate work. Existing
mobile sidebar visibility is unchanged; no new mobile history entry point is added.
