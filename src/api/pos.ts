import { z } from 'zod'
import { request } from './auth'

export function selectionId(productId: string, unit = '', attributes: { name: string; value: string }[] = []) {
  return productId + ':' + JSON.stringify({ unit, attributes: [...attributes].sort((a, b) => a.name.localeCompare(b.name)) })
}

const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const roomSchema = z.object({ id: z.uuid(), name: z.string(), note: z.string(), open_order_id: z.uuid().nullable().optional() })
export type RoomDTO = z.infer<typeof roomSchema>
export const roomsRepository = {
  list: (signal?: AbortSignal) => request('/rooms', z.array(roomSchema), { signal }),
  save: (body: { name: string; note: string }, id?: string) => request(`/rooms${id ? '/' + z.uuid().parse(id) : ''}`, roomSchema, { method: id ? 'PUT' : 'POST', body }),
  remove: (id: string) => request(`/rooms/${z.uuid().parse(id)}`, z.object({ deleted: z.boolean() }), { method: 'DELETE' }),
}
export const orderSchema = z.object({
  id: z.uuid(), code: z.string(), room_id: z.uuid().nullable(), room: z.string(), customer_id: z.uuid().nullable(), customer: z.string(), note: z.string(),
  status: z.string(), version: z.number().int(), subtotal_vnd: money, discount_vnd: money, total_vnd: money, paid_vnd: money,
  invoice_code: z.string().nullable(), created_at: z.string(), updated_at: z.string(),
  items: z.array(z.object({ stock_tracked: z.boolean().optional(), stock_ratio: z.string().nullable().optional(), product_id: z.uuid(), name: z.string(), sku: z.string(), quantity: z.number().int(), unit: z.string(), attributes: z.array(z.object({ name: z.string(), value: z.string() })), price_vnd: money, amount_vnd: money, key: z.string() })),
})
export type OrderDTO = z.infer<typeof orderSchema>
export type OrderInput = { room_id: string | null; customer_id: string | null; note: string; discount_vnd: number; version: number; items: { product_id: string; quantity: number; unit: string; attributes: { name: string; value: string }[] }[] }
export const ordersRepository = {
  list: (state = 'open', page = 1, signal?: AbortSignal) => request(`/pos/orders?state=${state}&page=${page}&page_size=100`, z.object({ items: z.array(orderSchema), pagination: z.object({ total_pages: z.number().int() }) }), { signal }),
  get: (id: string) => request(`/pos/orders/${z.uuid().parse(id)}`, orderSchema),
  save: (body: OrderInput, key: string, id?: string) => request(`/pos/orders${id ? '/' + z.uuid().parse(id) : ''}`, orderSchema, { method: id ? 'PUT' : 'POST', body, idempotencyKey: key }),
  pay: (id: string, received: number, key: string) => request(`/pos/orders/${z.uuid().parse(id)}/payments`, z.object({ order: orderSchema, received_vnd: money, applied_vnd: money, change_vnd: money }), { method: 'POST', body: { received_vnd: received }, idempotencyKey: key }),
}
