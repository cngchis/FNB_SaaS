import { expect, it } from 'vitest'
import { invoiceRow, invoiceSchema, type InvoiceDTO } from './invoices'
const invoice: InvoiceDTO = {
  id: '7f428b53-4219-4827-bd62-d5f89a36e8d3', code: 'HD000001', order_id: '88208310-4a48-44b4-8f3b-26f30688ed6e', order_code: 'DH000001',
  issued_at: '2026-11-09T17:01:00Z', arrived_at: '2026-11-09T17:00:00Z',
  subtotal_vnd: 20000, discount_vnd: 1000, total_vnd: 19000, paid_vnd: 5000,
  room: 'Bàn 01', customer: 'Anh Nam', branch: 'Branch A', creator: 'Cashier A', status: 'unpaid',
  items: [{ product_id: '1efaa105-7f4b-45be-94dc-45b6f00e8887', name: 'Coffee', sku: 'M00001', quantity: 2, unit: '', attributes: [], price_vnd: 10000, amount_vnd: 20000 }],
}
it('maps server invoices to the existing detail DOM without flattening item records', () => {
  const row = invoiceRow(invoiceSchema.parse(invoice))
  expect(row.code).toBe('HD000001')
  expect(row.order).toBe('DH000001')
  expect(row.status).toBe('Chờ thanh toán')
  expect(row.date).toContain('10/11/2026')
  expect(row.date).toContain('00:00')
  expect(row.due).toBe(19000)
  expect(row.paid).toBe(5000)
  expect(row.receiver).toBe('—')
  expect(JSON.parse(String(row.items))[0]).toMatchObject({ name: 'Coffee', quantity: 2 })
})
it('rejects fractional and unsafe invoice amounts', () => {
  expect(invoiceSchema.safeParse({ ...invoice, total_vnd: 10.5 }).success).toBe(false)
  expect(invoiceSchema.safeParse({ ...invoice, total_vnd: Number.MAX_SAFE_INTEGER + 1 }).success).toBe(false)
})
