# ADR-006: Cashbook projection and manual vouchers

Date: 2026-11-10. Status: implemented locally; rollout requires migration 4.

## Ownership and consistency

- POS collections remain owned by `payments`. Each succeeded payment contributes
  exactly one cashbook row. Do not duplicate it into a second ledger table.
  Applied payment amount is income; received cash above the balance is change.
- Manual receipts/expenses live in `cashbook_vouchers`. They are distinct from POS
  collections and do not allocate payments to invoices or adjust customer debt.
- `cashbook_entries` is a PostgreSQL security-invoker view over both sources.
  Underlying forced tenant RLS remains active. The API additionally joins explicit
  membership-store grants. No background queue or materialized cache is required.
- One SQL statement produces the rows, filtered count and account balances under
  a consistent statement snapshot. Opening balance is all posted signed entries
  before the start date. Closing is opening plus period income minus expense.
  With no start date opening is zero, representing the full recorded history.
- Financial totals use date, method and authorized-store scope. Search/status
  filter the displayed documents, not the actual account balance. Pending manual
  vouchers never affect balances. Dates use inclusive Vietnamese business days,
  implemented with exclusive next-day UTC+07:00 upper bounds.

## Writes and permissions

- Successful POS payments allocate persistent tenant-scoped receipt codes and
  record the authenticated collector in their existing transaction. Retried
  idempotent payments do not allocate another code or create another receipt.
- Migration 4 backfills existing payment codes without changing amounts. Historical
  collector is unknown and remains null/`—`; never infer it from order creator.
- Owner/manager may view granted stores and manage manual vouchers in a granted
  store. Cashier reads only the selected session store. Kitchen is denied.
- Manual POST/PUT requires an idempotency key, hashes the typed payload and stores
  the exact result in `api_requests` in the same tenant transaction as the voucher.
- Draft updates/deletion require an optimistic version and row lock. Posting is
  final: posted manual entries and POS collection rows cannot be edited/deleted.
  Corrections/refunds require a separately designed, auditable workflow.
- A voucher's store cannot change during editing. Actor/code are server-owned;
  payer name is free text and is not a fabricated customer identity.

## Frontend and rollout

- Keep existing cashbook markup, CSS, three tabs, controls and routes. Use typed
  repositories, TanStack Query and the existing generic form. Payment edit action
  navigates to its source invoice; manual posted edit/delete report immutability.
- Queries/cache and CSV exports are tenant/store/user scoped. Mobile keeps the
  existing infinite scrolling pattern. Mock storage is never imported as money.
- Stop the old API before migrating, apply migration 4 using the admin connection,
  then restart the updated API. Older API binaries omit the new payment code and
  cannot create payments after this migration. Do not bootstrap again.
- Down removes manual vouchers/view/metadata and their request replay records;
  it preserves payment amounts. Only test rollback on disposable databases.

## Limits

Balance means recorded cash movements, not a physical cash count or a bank feed.
Explicit opening cash may be entered as an authorized manual receipt/expense dated
before the chosen period. There is no synthetic initial balance from demo data.
Bank-account management, provider QR/webhooks, inventory/purchase automation,
refunds/reversals, bank reconciliation and production CI verification remain pending.
Non-cash/non-bank legacy payment methods appear only in the combined account.
Cash settlement currently uses synchronous payment creation time; future async
providers must introduce a verified settlement timestamp before posting to this view.
CSV remains paged and may observe concurrent changes between requests.
