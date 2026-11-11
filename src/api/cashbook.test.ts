import { expect, it } from 'vitest'
import { cashbookRow, parseCashDate, voucherInput, type EntryDTO } from './cashbook'
const id = '5a83be7d-dc2e-48ba-9cf4-d0e91e594987'
const entry: EntryDTO = { id, store_id: id, code: 'PT000001', source: 'manual', status: 'pending', direction: 'in', amount_vnd: 100000, method: 'cash', category: 'other_receipt', payer_group: 'other', payer: '', note: 'Opening', occurred_at: '2026-11-10T05:00:12Z', creator: 'Owner', branch: 'Store', invoice_code: null, order_id: null, version: 1 }
it('maps cashbook records into the existing columns and preserves unedited seconds', () => {
  const row = cashbookRow(entry)
  expect(row.date).toContain('12:00')
  const input = voucherInput({ ...row, branch: id }, row)
  expect(input.occurred_at).toBe(entry.occurred_at)
  expect(input.amount_vnd).toBe(100000)
  expect(input.version).toBe(1)
  expect(input).not.toHaveProperty('creator')
})
it('parses local recording dates and rejects invalid calendar dates', () => {
  expect(parseCashDate('10/11/2026 08:30')).toBe('2026-11-10T08:30:00+07:00')
  expect(() => parseCashDate('30/02/2026 08:30')).toThrow()
  expect(() => parseCashDate('10/11/2026 24:30')).toThrow()
  expect(() => parseCashDate('not a date')).toThrow()
})
it('rejects fractional money and mismatched expense categories', () => {
  const row = { ...cashbookRow(entry), branch: id }
  expect(() => voucherInput({ ...row, amount: 10.5 }, null)).toThrow()
  expect(() => voucherInput({ ...row, voucher: 'Phiếu Chi' }, null)).toThrow()
})
