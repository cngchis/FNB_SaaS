import { z } from 'zod'
import { request } from './auth'
import type { ManagementRow } from '../features/management/moduleConfig'

const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const pagination = z.object({ page: z.number().int(), page_size: z.number().int(), total: money, total_pages: money })
const action = z.object({ id: z.uuid(), version: z.number().int().positive() })
export const supplierSchema = z.object({ id: z.uuid(), code: z.string(), name: z.string(), contact: z.string(), phone: z.string(), address: z.string(), note: z.string(), version: z.number().int().positive(), debt_vnd: money })
const supplierPage = z.object({ items: z.array(supplierSchema), total: money, debt_vnd: money, pagination })
export const supplierInputSchema = z.object({ name: z.string().trim().min(1).max(200), contact: z.string().trim().max(200), phone: z.string().trim().max(100), address: z.string().trim().max(1000), note: z.string().trim().max(4000), version: z.number().int().nonnegative() })
export type SupplierDTO = z.infer<typeof supplierSchema>
export type SupplierInput = z.infer<typeof supplierInputSchema>
export type SupplierOptions = { page?: number; page_size?: number; search?: string; sort?: 'name' | 'debt_vnd'; direction?: 'asc' | 'desc' }
const params = (options: object) => new URLSearchParams(Object.entries(options).filter(([,value]) => value !== undefined).map(([key,value]) => [key,String(value)]))
export const suppliersRepository = {
  list: (options: SupplierOptions = {}, signal?: AbortSignal) => request(`/suppliers?${params(options)}`, supplierPage, { signal }),
  save: (input: SupplierInput, key: string, id?: string) => request(`/suppliers${id ? '/'+z.uuid().parse(id) : ''}`, action, { method: id ? 'PUT' : 'POST', body: supplierInputSchema.parse(input), idempotencyKey: key }),
  remove: (id: string, version: number) => request(`/suppliers/${z.uuid().parse(id)}?version=${z.number().int().positive().parse(version)}`, z.object({ deleted: z.boolean() }), { method: 'DELETE' }),
}
export function supplierRow(item: SupplierDTO): ManagementRow {
  return { __id: item.id, __version: item.version, code: item.code, name: item.name, contact: item.contact, phone: item.phone, address: item.address, note: item.note, debt: item.debt_vnd }
}
export function supplierInput(row: ManagementRow): SupplierInput {
  return supplierInputSchema.parse({ name: String(row.name ?? ''), contact: String(row.contact ?? ''), phone: String(row.phone ?? ''), address: String(row.address ?? ''), note: String(row.note ?? ''), version: Number(row.__version ?? 0) })
}
export const receiptSchema = z.object({
  id: z.uuid(), code: z.string(), status: z.enum(['draft','posted']), total_vnd: money, note: z.string(), version: z.number().int().positive(), supplier_id: z.uuid(), supplier: z.string(), branch: z.string(), creator: z.string(), created_at: z.iso.datetime({ offset: true }), posted_at: z.iso.datetime({ offset: true }).nullable(),
  items: z.array(z.object({ id: z.uuid(), product_id: z.uuid(), name: z.string(), sku: z.string(), unit: z.string(), base_unit: z.string(), unit_ratio: z.string(), base_quantity: z.string(), quantity: z.number().int().positive(), cost_vnd: money, total_vnd: money })),
})
const receiptPage = z.object({ items: z.array(receiptSchema), total: money, total_vnd: money, draft_count: money, pagination })
export const receiptInputSchema = z.object({ supplier_id: z.uuid(), note: z.string().max(4000), version: z.number().int().nonnegative(), items: z.array(z.object({ product_id: z.uuid(), unit: z.string().max(80).optional(), expected_unit_ratio: z.string().regex(/^[0-9]{1,9}(\.[0-9]{1,3})?$/).refine((value) => !/^0+(\.0+)?$/.test(value)).optional(), expected_base_unit: z.string().max(80).optional(), refresh_unit: z.boolean().optional(), quantity: z.number().int().min(1).max(1_000_000_000), cost_vnd: money })).min(1).max(500) }).superRefine((input, context) => {
  let total = 0n
  const products = new Set<string>()
  for (const item of input.items) {
    if (products.has(item.product_id)) context.addIssue({ code: 'custom', message: 'Hàng hóa đã có trong phiếu.' })
    products.add(item.product_id)
    total += BigInt(item.quantity)*BigInt(item.cost_vnd)
  }
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) context.addIssue({ code: 'custom', message: 'Tổng tiền phiếu vượt giới hạn.' })
})
export type ReceiptInput = z.infer<typeof receiptInputSchema>
export const purchasesRepository = {
  list: (options: { page?: number; page_size?: number; search?: string; sort?: 'created_at'; direction?: 'asc' | 'desc' } = {}, signal?: AbortSignal) => request(`/purchases?${params(options)}`, receiptPage, { signal }),
  get: (id: string, signal?: AbortSignal) => request(`/purchases/${z.uuid().parse(id)}`, receiptSchema, { signal }),
  save: (input: ReceiptInput, key: string, id?: string) => request(`/purchases${id ? '/'+z.uuid().parse(id) : ''}`, action, { method: id ? 'PUT' : 'POST', body: receiptInputSchema.parse(input), idempotencyKey: key }),
  post: (id: string, version: number, key: string) => request(`/purchases/${z.uuid().parse(id)}/post`, action, { method: 'POST', body: { version: z.number().int().positive().parse(version) }, idempotencyKey: key }),
}
