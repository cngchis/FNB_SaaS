import { z } from 'zod'
import { request } from './auth'
import type { ManagementRow } from '../features/management/moduleConfig'
const amount = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const money = z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)
const summary = z.object({ opening_vnd: money, income_vnd: money.nonnegative(), expense_vnd: money.nonnegative(), closing_vnd: money })
export const entrySchema = z.object({ id: z.uuid(), store_id: z.uuid(), code: z.string(), source: z.enum(['payment', 'manual']), status: z.enum(['posted', 'pending']), direction: z.enum(['in', 'out']), amount_vnd: amount, method: z.enum(['cash', 'bank', 'other']), category: z.string(), payer_group: z.enum(['customer', 'supplier', 'employee', 'other']), payer: z.string(), note: z.string(), occurred_at: z.iso.datetime({ offset: true }), creator: z.string(), branch: z.string(), invoice_code: z.string().nullable(), order_id: z.uuid().nullable(), version: z.number().int().nonnegative() })
const pageSchema = z.object({ items: z.array(entrySchema), total: money.nonnegative(), summary, pagination: z.object({ total: money.nonnegative(), total_pages: money.nonnegative() }) })
export type EntryDTO = z.infer<typeof entrySchema>
export type CashSummary = z.infer<typeof summary>
export type CashOptions = { page?: number; page_size?: number; search?: string; status?: string; method?: string; store_id?: string; date_from?: string; date_to?: string; sort?: string; direction?: string }
const categories: Record<string, string> = { customer_receipt: 'Thu tiền khách hàng', other_receipt: 'Thu khác', purchase_expense: 'Chi nhập hàng', operating_expense: 'Chi vận hành' }
const payerGroups: Record<string, string> = { customer: 'Khách hàng', supplier: 'Nhà cung cấp', employee: 'Nhân viên', other: 'Khác' }
export const voucherSchema = z.object({ store_id: z.uuid(), direction: z.enum(['in', 'out']), amount_vnd: amount, status: z.enum(['pending', 'posted']), method: z.enum(['cash', 'bank']), category: z.enum(['customer_receipt', 'other_receipt', 'purchase_expense', 'operating_expense']), payer_group: z.enum(['customer', 'supplier', 'employee', 'other']), payer: z.string().max(200), note: z.string().max(4000), occurred_at: z.iso.datetime({ offset: true }), version: z.number().int().nonnegative() })
export type VoucherInput = z.infer<typeof voucherSchema>
export const cashbookRepository = {
  list: (options: CashOptions, signal?: AbortSignal) => { const query = new URLSearchParams(); for (const [key, value] of Object.entries(options)) if (value !== '' && value !== undefined) query.set(key, String(value)); return request('/cashbook?' + query, pageSchema, { signal }) },
  save: (body: VoucherInput, key: string, id?: string) => request('/cashbook' + (id ? '/' + z.uuid().parse(id) : ''), z.object({ id: z.uuid() }), { method: id ? 'PUT' : 'POST', body, idempotencyKey: key }),
  remove: (id: string, version: number) => request('/cashbook/' + z.uuid().parse(id) + '?version=' + z.number().int().positive().parse(version), z.object({ deleted: z.boolean() }), { method: 'DELETE' }),
}
export function formatCashDate(date: string) { return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(date)) }
export function cashbookRow(entry: EntryDTO): ManagementRow {
  return { __id: entry.id, __version: entry.version, _source: entry.source, _storeID: entry.store_id, _invoiceCode: entry.invoice_code ?? '', _occurredAt: entry.occurred_at, code: entry.code, status: entry.status === 'posted' ? 'Đã thanh toán' : 'Chưa thanh toán', voucher: entry.direction === 'in' ? 'Phiếu Thu' : 'Phiếu Chi', amount: entry.amount_vnd, method: entry.method === 'cash' ? 'Tiền mặt' : entry.method === 'bank' ? 'Chuyển khoản' : 'Khác', category: categories[entry.category] ?? entry.category, payerGroup: payerGroups[entry.payer_group], payer: entry.payer, note: entry.note, date: formatCashDate(entry.occurred_at), branch: entry.branch, creator: entry.creator }
}
export function parseCashDate(text: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})(?:,?\s+(\d{2}):(\d{2}))?$/.exec(text.trim())
  if (!match) throw new Error('Ngày ghi sổ cần có dạng DD/MM/YYYY HH:mm.')
  const [, day, month, year, hour = '00', minute = '00'] = match
  const iso = `${year}-${month}-${day}T${hour}:${minute}:00+07:00`
  const date = new Date(iso); const local = new Date(date.getTime() + 7 * 60 * 60 * 1000)
  if (Number.isNaN(date.getTime()) || local.getUTCFullYear() !== Number(year) || local.getUTCMonth() + 1 !== Number(month) || local.getUTCDate() !== Number(day) || Number(hour) > 23 || Number(minute) > 59) throw new Error('Ngày hoặc giờ ghi sổ không hợp lệ.')
  return iso
}
export function voucherInput(values: ManagementRow, initial: ManagementRow | null): VoucherInput {
  const category = Object.keys(categories).find((key) => categories[key] === values.category)
  const payerGroup = Object.keys(payerGroups).find((key) => payerGroups[key] === values.payerGroup)
  const input = voucherSchema.parse({ store_id: values.branch || initial?._storeID, direction: values.voucher === 'Phiếu Thu' ? 'in' : 'out', amount_vnd: Number(values.amount), status: values.status === 'Đã thanh toán' ? 'posted' : 'pending', method: values.method === 'Tiền mặt' ? 'cash' : 'bank', category, payer_group: payerGroup, payer: String(values.payer ?? ''), note: String(values.note ?? ''), occurred_at: initial && values.date === initial.date ? initial._occurredAt : parseCashDate(String(values.date)), version: Number(initial?.__version ?? 0) })
  if ((input.direction === 'in') !== (input.category === 'customer_receipt' || input.category === 'other_receipt')) throw new Error('Chọn loại thu/chi phù hợp với loại phiếu.')
  return input
}
