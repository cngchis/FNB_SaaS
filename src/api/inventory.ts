import { z } from 'zod'
import { request } from './auth'
import { menuItemsRepository, type ListOptions } from './catalog'
const quantity = z.string().regex(/^\d+(\.\d{1,6})?$/)
const version = z.number().int().nonnegative()
const balance = z.object({ product_id: z.uuid(), quantity: quantity.nullable(), balance_version: version })
const action = z.object({ id: z.uuid(), version: version.positive() })
const line = z.object({ id: z.uuid(), product_id: z.uuid(), name: z.string(), sku: z.string(), unit: z.string(), system_quantity: quantity, counted_quantity: quantity, balance_version: version })
export const stocktake = z.object({ id: z.uuid(), code: z.string(), status: z.enum(['draft', 'posted']), note: z.string(), version: version.positive(), branch: z.string(), creator: z.string(), created_at: z.iso.datetime({ offset: true }), items: z.array(line) })
export type Stocktake = z.infer<typeof stocktake>
export const countInput = z.object({ product_id: z.uuid(), counted_quantity: quantity.refine((s) => decimalQuantity(s) <= 1_000_000_000_000_000n), balance_version: version })
export type CountInput = z.infer<typeof countInput>
export function decimalQuantity(s: string) {
  if (!/^\d+(\.\d{1,6})?$/.test(s)) throw new Error('Số lượng phải không âm và có tối đa 6 chữ số thập phân.')
  const [whole, fraction = ''] = s.split('.')
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))
}
export function quantityDifference(counted: string, system: string) {
  const delta = decimalQuantity(counted) - decimalQuantity(system)
  const absolute = delta < 0n ? -delta : delta
  const fraction = String(absolute % 1_000_000n).padStart(6, '0').replace(/0+$/, '')
  return `${delta < 0n ? '-' : delta > 0n ? '+' : ''}${absolute / 1_000_000n}${fraction ? '.' + fraction : ''}`
}
export const inventoryRepository = {
  quantities: (ids: string[], signal?: AbortSignal) => request(`/inventory/quantities?product_ids=${ids.map((id) => z.uuid().parse(id)).join(',')}`, z.array(balance), { signal }),
  summary: (signal?: AbortSignal) => request('/inventory/summary', z.object({ sku_count: version, quantity: quantity.nullable(), retail_value_vnd: z.string().regex(/^\d+$/).nullable() }), { signal }),
  list: async (options: ListOptions, signal?: AbortSignal) => {
    const page = await menuItemsRepository.list({ ...options, product_type: 'goods', tracks_stock: true }, signal)
    const balances = page.items.length ? await inventoryRepository.quantities(page.items.map((p) => p.id), signal) : []
    return { ...page, items: page.items.map((p) => {
      const stock = balances.find((b) => b.product_id === p.id)
      if (!stock) throw new Error('Dữ liệu kho đã thay đổi. Vui lòng thử lại.')
      return { ...p, ...stock }
    }) }
  },
  stocktakes: (page = 1, signal?: AbortSignal) => request(`/stocktakes?page=${page}&page_size=100`, z.object({ items: z.array(stocktake), total: version, pagination: z.object({ page: version, total_pages: version }) }), { signal }),
  confirm: (items: CountInput[], note: string, key: string) => request('/stocktakes/confirm', action, { method: 'POST', body: { items: z.array(countInput).min(1).max(500).parse(items), note }, idempotencyKey: key }),
}
