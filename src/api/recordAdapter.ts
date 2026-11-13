import { z } from 'zod'
import type { ManagementRow } from '../features/management/moduleConfig'
import type { ProductDTO, ProductInput, CustomerDTO, CustomerInput, GroupDTO, GroupInput } from './catalog'
import { ApiError } from './http'

export const connectedModules = new Set(['menu-items', 'customers', 'customer-groups', 'rooms', 'invoices', 'cashbook', 'suppliers'])
export function productRow(item: ProductDTO): ManagementRow {
  return {
    __id: item.id, code: item.sku, name: item.name, category: item.category_name ?? '',
    productType: item.product_type === 'goods' ? 'Hàng hóa thường' : 'Chế biến',
    menuType: ({ drink: 'Đồ uống', food: 'Đồ ăn', other: 'Khác' })[item.menu_type],
    price: item.price_vnd, cost: item.cost_vnd ?? '', stock: '—', baseUnit: item.base_unit,
    status: item.availability === 'available' ? 'Đang bán' : 'Tạm hết',
    visible: item.is_visible, extra: item.is_extra, points: item.earns_points, image: item.image_url ?? '',
    attributes: JSON.stringify(item.attributes),
    units: JSON.stringify(item.units.map((unit) => ({ name: unit.name, ratio: Number(unit.ratio), price: unit.price_vnd, cost: unit.cost_vnd ?? 0, _costWasUnset: unit.cost_vnd === null }))),
    _tracksStock: item.tracks_stock,
  }
}
export function customerRow(item: CustomerDTO): ManagementRow {
  return { __id: item.id, name: item.name, phone: item.phone ?? '', segment: item.group_name ?? '', points: item.points, orders: item.order_count, spent: item.spent_vnd, _email: item.email ?? '', _note: item.note ?? '' }
}
export function groupRow(item: GroupDTO): ManagementRow {
  return { __id: item.id, name: item.name, members: item.members, condition: item.condition, benefit: item.benefit, status: item.is_active ? 'Đang hoạt động' : 'Tạm ngưng' }
}
const amount = z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const list = <T>(value: unknown, schema: z.ZodType<T>): T[] => z.array(schema).parse(JSON.parse(String(value ?? '[]')))
const optionalMoney = (value: unknown) => value === '' || value === undefined ? null : amount.parse(value)

export function productInput(row: ManagementRow, categories: { id: string; name: string }[]): ProductInput {
  const category = categories.find((item) => item.name === row.category)
  if (row.category && !category) throw new Error('Nhóm hàng chưa được tạo trên hệ thống.')
  const prepared = row.productType === 'Chế biến'
  const image = String(row.image ?? '')
  if (image.startsWith('data:')) throw new Error('Upload ảnh chưa được hỗ trợ trong chế độ API.')
  const attributes = list(row.attributes, z.object({ name: z.string().trim().min(1), value: z.string().trim().min(1), price_delta_vnd: z.number().int().default(0) }))
  const units = list(row.units, z.object({ name: z.string().trim().min(1), ratio: z.coerce.number().positive(), price: amount, cost: amount.optional(), _costWasUnset: z.boolean().optional() }))
  return {
    name: String(row.name).trim(), category_id: category?.id ?? null,
    product_type: prepared ? 'prepared' : 'goods',
    menu_type: row.menuType === 'Đồ uống' ? 'drink' : row.menuType === 'Đồ ăn' ? 'food' : 'other',
    base_unit: String(row.baseUnit ?? 'Cái'), price_vnd: amount.parse(row.price), cost_vnd: prepared ? null : optionalMoney(row.cost),
    tracks_stock: prepared ? false : row._tracksStock !== false,
    is_visible: row.visible === true, is_extra: row.extra === true, earns_points: row.points === true,
    availability: row.status === 'Tạm hết' ? 'unavailable' : 'available', image_url: image || null,
    attributes, units: units.map((unit) => ({ name: unit.name, ratio: String(unit.ratio), price_vnd: unit.price, cost_vnd: prepared || unit._costWasUnset ? null : unit.cost ?? null })),
  }
}
export function customerInput(row: ManagementRow, groups: GroupDTO[], canAdjustPoints: boolean): CustomerInput {
  const group = groups.find((item) => item.name === row.segment)
  if (row.segment && (!group || !group.is_active)) throw new Error('Hãy nhập tên nhóm khách đang hoạt động đã được tạo trên hệ thống.')
  return {
    name: String(row.name).trim(), phone: String(row.phone ?? '').trim() || null,
    email: String(row._email ?? '') || null, note: String(row._note ?? '') || null, group_id: group?.id ?? null,
    ...(canAdjustPoints ? { points: amount.parse(row.points || 0) } : {}),
  }
}
export function groupInput(row: ManagementRow): GroupInput {
  if (!['Đang hoạt động', 'Tạm ngưng'].includes(String(row.status))) throw new Error('Trạng thái nhóm phải là “Đang hoạt động” hoặc “Tạm ngưng”.')
  return { name: String(row.name).trim(), condition: String(row.condition ?? ''), benefit: String(row.benefit ?? ''), is_active: row.status === 'Đang hoạt động' }
}
export function errorMessage(error: unknown): string {
  if (error instanceof TypeError || (error instanceof DOMException && ['AbortError', 'TimeoutError'].includes(error.name))) return 'Không thể kết nối server. Vui lòng thử lại.'
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Phiên đăng nhập không hợp lệ hoặc thông tin đăng nhập chưa đúng.'
    if (error.status === 403) return 'Tài khoản không có quyền thực hiện thao tác này.'
    if (error.status === 404) return 'Bản ghi không còn tồn tại hoặc không thuộc cửa hàng hiện tại.'
    if (error.status === 409 && error.code === 'supplier_in_use') return 'Nhà cung cấp đã được sử dụng trong phiếu nhập, không thể xóa.'
    if (error.status === 409 && error.code === 'purchasing_conflict') return 'Phiếu nhập hoặc nhà cung cấp đã thay đổi. Vui lòng tải lại dữ liệu trước khi lưu.'
    if (error.status === 409 && error.code === 'posted_receipt') return 'Phiếu nhập đã xác nhận không thể sửa hoặc xóa. Cần quy trình điều chỉnh.'
    if (error.status === 409 && error.code === 'immutable_entry') return 'Chứng từ đã thanh toán không thể sửa hoặc xóa. Cần quy trình điều chỉnh riêng.'
    if (error.status === 409 && error.code === 'customer_in_use') return 'Khách hàng đang có đơn chưa tất toán. Vui lòng xử lý đơn trước khi xóa.'
    if (error.status === 409 && error.code === 'state_conflict') return 'Đơn hàng hoặc bàn đã thay đổi. Đóng tab rồi mở lại đơn đã lưu để cập nhật.'
    if (error.status === 409) return 'Tên hoặc mã đã tồn tại. Vui lòng kiểm tra lại.'
    if (error.status === 422) return 'Dữ liệu chưa hợp lệ. Kiểm tra tên, giá, nhóm và đơn vị quy đổi.'
    return 'Không thể tải hoặc lưu dữ liệu trên server. Vui lòng thử lại.'
  }
  if (error instanceof z.ZodError) return 'Kiểm tra dữ liệu: số tiền và điểm phải là số nguyên không âm; thuộc tính cần đủ tên và giá trị.'
  if (error instanceof Error) return error.message
  return 'Không thể hoàn tất thao tác. Vui lòng thử lại.'
}
