import { loadRows, storageKey } from './localManagement'
import { prototypeStorage } from './prototypeStorage'
import { managementModules, type ManagementRow } from '../features/management/moduleConfig'
import type { Product } from '../types'

const menu = managementModules.find((item) => item.id === 'menu-items')!

export function inventoryEditorRow(product: Product, details?: ManagementRow): ManagementRow {
  const rows = loadRows(menu)
  const existing = rows.find((row) => row.code === product.sku)
  const highest = rows.reduce((value, row) => Math.max(value, /^M\d{5}$/.test(String(row.code)) ? Number(String(row.code).slice(1)) : 0), 0)
  return { ...(existing ?? details), _inventoryNew: !existing, code: existing?.code ?? `M${String(highest + 1).padStart(5, '0')}`, name: product.name, category: existing?.category ?? product.category, productType: 'Hàng hóa thường', menuType: existing?.menuType ?? 'Khác', price: product.price, stock: product.stock, baseUnit: existing?.baseUnit ?? details?.baseUnit ?? 'Cái', cost: existing?.cost ?? details?.cost ?? 0, status: existing?.status ?? 'Đang bán', visible: existing?.visible ?? true, extra: existing?.extra ?? false, points: existing?.points ?? true, image: existing?.image ?? product.image ?? '', attributes: existing?.attributes ?? details?.attributes ?? '[]', units: existing?.units ?? details?.units ?? '[]' }
}

// Inventory is still a prototype. Never resolve its SKU against server products.
export function saveInventoryEditorRow(initial: ManagementRow, values: ManagementRow): ManagementRow {
  const rows = loadRows(menu)
  const index = rows.findIndex((row) => row.code === initial.code)
  if ((initial._inventoryNew === true && index >= 0) || (initial._inventoryNew !== true && index < 0)) throw new Error('Danh mục sản phẩm đã thay đổi. Vui lòng tải lại trước khi sửa.')
  const record: ManagementRow = { ...initial, ...values, code: initial.code }
  delete record._inventoryNew
  if (record.productType === 'Chế biến') { delete record.cost; delete record.stock }
  const next = index < 0 ? [...rows, record] : rows.map((row, position) => position === index ? record : row)
  prototypeStorage.setItem(storageKey('menu-items'), JSON.stringify(next))
  return record
}
