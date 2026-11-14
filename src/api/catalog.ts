import { z } from 'zod'
import { request } from './auth'

const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const id = z.uuid()
const attribute = z.object({ name: z.string(), value: z.string(), price_delta_vnd: z.number().int() })
const unit = z.object({ name: z.string(), ratio: z.string(), price_vnd: money, cost_vnd: money.nullable(), is_visible: z.boolean().optional() })
export const productSchema = z.object({
  id, sku: z.string(), name: z.string(), category_id: id.nullable(), category_name: z.string().nullable(),
  product_type: z.enum(['goods', 'prepared']), menu_type: z.enum(['drink', 'food', 'other']), base_unit: z.string(),
  price_vnd: money, cost_vnd: money.nullable(), tracks_stock: z.boolean(), is_visible: z.boolean(),
  is_extra: z.boolean(), earns_points: z.boolean(), availability: z.enum(['available', 'unavailable']),
  image_url: z.string().nullable(), attributes: z.array(attribute), units: z.array(unit),
})
export const categorySchema = z.object({ id, name: z.string() })
export const customerSchema = z.object({
  id, name: z.string(), phone: z.string().nullable(), email: z.string().nullable(), note: z.string().nullable(),
  group_id: id.nullable(), points: money,
})
export const customerDetailsSchema = customerSchema.extend({
  group_name: z.string().nullable(), order_count: money, spent_vnd: money,
})
export const groupSchema = z.object({
  id, name: z.string(), condition: z.string(), benefit: z.string(), is_active: z.boolean(),
})
export const groupListSchema = groupSchema.extend({ members: money })
const pagination = z.object({ page: z.number().int().positive(), page_size: z.number().int().positive(), total: money, total_pages: money })
const page = <T>(schema: z.ZodType<T>) => z.object({ items: z.array(schema), pagination })
const deleted = z.object({ deleted: z.literal(true) })
export type ProductDTO = z.infer<typeof productSchema>
export type CustomerDTO = z.infer<typeof customerDetailsSchema>
export type GroupDTO = z.infer<typeof groupListSchema>
export type ProductInput = Omit<ProductDTO, 'id' | 'sku' | 'category_name'>
export type CustomerInput = Omit<z.infer<typeof customerSchema>, 'id' | 'points'> & { points?: number }
export type GroupInput = Omit<z.infer<typeof groupSchema>, 'id'>
export type ListOptions = { tracks_stock?: boolean; page?: number; page_size?: number; search?: string; sort?: string; direction?: 'asc' | 'desc'; category_id?: string; group_id?: string; product_type?: 'goods' | 'prepared'; availability?: 'available' | 'unavailable' }

function query(options: ListOptions) {
  const values = new URLSearchParams()
  for (const [key, value] of Object.entries(options)) if (value !== undefined && value !== '') values.set(key, String(value))
  return `?${values}`
}
const pathID = (value: string) => encodeURIComponent(id.parse(value))

export const menuItemsRepository = {
  list: (options: ListOptions = {}, signal?: AbortSignal) => request(`/products${query(options)}`, page(productSchema), { signal }),
  get: (value: string, signal?: AbortSignal) => request(`/products/${pathID(value)}`, productSchema, { signal }),
  save: (body: ProductInput, value?: string) => request(`/products${value ? `/${pathID(value)}` : ''}`, productSchema, { method: value ? 'PUT' : 'POST', body }),
  remove: (value: string) => request(`/products/${pathID(value)}`, deleted, { method: 'DELETE' }),
}
export const categoriesRepository = {
  list: (signal?: AbortSignal) => request('/product-categories', z.array(categorySchema), { signal }),
  save: (name: string, value?: string) => request(`/product-categories${value ? `/${pathID(value)}` : ''}`, categorySchema, { method: value ? 'PUT' : 'POST', body: { name } }),
  remove: (value: string) => request(`/product-categories/${pathID(value)}`, deleted, { method: 'DELETE' }),
}
export const customersRepository = {
  debt: (value: string, exclude?: string | null, signal?: AbortSignal) => request('/customers/' + pathID(value) + '/debt' + (exclude ? '?exclude_order_id=' + pathID(exclude) : ''), z.object({ customer_id: id, outstanding_vnd: money }), { signal }),
  list: (options: ListOptions = {}, signal?: AbortSignal) => request(`/customers${query(options)}`, page(customerDetailsSchema), { signal }),
  get: (value: string, signal?: AbortSignal) => request(`/customers/${pathID(value)}`, customerDetailsSchema, { signal }),
  save: (body: CustomerInput, value?: string) => request(`/customers${value ? `/${pathID(value)}` : ''}`, customerSchema, { method: value ? 'PUT' : 'POST', body }),
  remove: (value: string) => request(`/customers/${pathID(value)}`, deleted, { method: 'DELETE' }),
}
export const groupsRepository = {
  list: (signal?: AbortSignal) => request('/customer-groups', z.array(groupListSchema), { signal }),
  save: (body: GroupInput, value?: string) => request(`/customer-groups${value ? `/${pathID(value)}` : ''}`, groupSchema, { method: value ? 'PUT' : 'POST', body }),
  remove: (value: string) => request(`/customer-groups/${pathID(value)}`, deleted, { method: 'DELETE' }),
}
