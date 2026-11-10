import { z } from 'zod'
import { request } from './auth'
import type { ManagementRow } from '../features/management/moduleConfig'

const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const invoiceSchema = z.object({
  id: z.uuid(), code: z.string(), order_id: z.uuid(), order_code: z.string(),
  issued_at: z.iso.datetime({ offset: true }), arrived_at: z.iso.datetime({ offset: true }),
  subtotal_vnd: money, discount_vnd: money, total_vnd: money, paid_vnd: money,
  room: z.string(), customer: z.string(), branch: z.string(), creator: z.string(),
  status: z.enum(['paid', 'unpaid', 'cancelled']),
  items: z.array(z.object({ product_id: z.uuid(), name: z.string(), sku: z.string(), quantity: z.number().int().positive(), unit: z.string(), attributes: z.array(z.object({ name: z.string(), value: z.string() })), price_vnd: money, amount_vnd: money })),
})
const summarySchema = z.object({ count: money, today_count: money, total_vnd: money, unpaid_count: money, unpaid_vnd: money })
const pageSchema = z.object({ items: z.array(invoiceSchema), summary: summarySchema, pagination: z.object({ page: z.number().int(), page_size: z.number().int(), total: money, total_pages: money }) })
export type InvoiceDTO = z.infer<typeof invoiceSchema>
export type InvoiceSummary = z.infer<typeof summarySchema>
export type InvoiceOptions = { page?: number; page_size?: number; search?: string; status?: 'paid' | 'unpaid' | 'cancelled'; sort?: string; direction?: 'asc' | 'desc'; date_from?: string; date_to?: string }
export const invoicesRepository = {
  list: (options: InvoiceOptions = {}, signal?: AbortSignal) => {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(options)) if (value !== undefined && value !== '') query.set(key, String(value))
    return request(`/invoices?${query}`, pageSchema, { signal })
  },
  get: (id: string, signal?: AbortSignal) => request(`/invoices/${z.uuid().parse(id)}`, invoiceSchema, { signal }),
}
export function invoiceRow(invoice: InvoiceDTO): ManagementRow {
  return {
    __id: invoice.id, code: invoice.code, order: invoice.order_code, table: invoice.room,
    customer: invoice.customer, items: JSON.stringify(invoice.items), amount: invoice.subtotal_vnd,
    discount: invoice.discount_vnd, due: invoice.total_vnd, paid: invoice.paid_vnd,
    date: new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(invoice.arrived_at)),
    branch: invoice.branch, creator: invoice.creator, receiver: '—',
    status: ({ paid: 'Đã thanh toán', unpaid: 'Chờ thanh toán', cancelled: 'Đã hủy' })[invoice.status],
  }
}
