# ADR-011: Purchase unit snapshots

Date: 2026-11-14. Status: accepted for implementation.

## Decision

- A receipt line selects the product base unit or one of its converted units, including units hidden from the sales menu. A receipt still allows one line per product.
- Persist the selected unit, base unit, conversion ratio, selected quantity, integer VND unit cost and total. Migration 8 backfills existing lines as ratio 1 using their recorded unit, not the current catalog.
- Normal draft edits preserve the recorded unit snapshot. Explicit unit selection can refresh it from the catalog. Optional expected ratio/base fields detect stale selections; the server never trusts them as authoritative catalog values.
- Posting uses the frozen ratio to add the exact base quantity to the shared product/store balance. The transaction includes the receipt, stock ledger, balance and idempotency result. Catalog removal or ratio changes cannot rewrite the receipt.
- A purchase movement stores base-unit cost only when the division is an exact integer VND. Otherwise that optional cost is null; the receipt retains exact selected-unit cost and total. Do not round or use null as zero in accounting.
- Existing clients that omit unit fields retain base-unit creation behavior and preserve the prior unit on updates. Optional fields are omitted from old request hashes to preserve idempotent replays.
- A lost posting response must replay the same post key, not attempt to update the already posted receipt. UI payload comparison ignores the transient refresh command.

## Consequences

There is no separate stock balance per pack, no automatic catalog-cost update, no supplier payment, and no new inventory valuation policy. Posting still requires the base identity to match the product. Posted receipts remain immutable.

Rollback refuses to discard converted history or fractional base-cost information. Apply migrations through Goose; executing the complete SQL file in a query tool would also execute its Down section.

Only the approved unit selector and conversion text are added to purchase rows. Existing CSS, routes and other layouts remain unchanged. Existing mobile action visibility limitations remain pending user approval.
