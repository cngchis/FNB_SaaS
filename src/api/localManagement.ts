import { prototypeStorage } from './prototypeStorage'
import type { ManagementModule, ManagementRow } from '../features/management/moduleConfig'

export const storageKey = (moduleId: string) => `fnb-management:${moduleId}`

export function loadRows(module: ManagementModule): ManagementRow[] {
  try {
    const saved = prototypeStorage.getItem(storageKey(module.id))
    if (saved) return migrateRows(module.id, JSON.parse(saved) as ManagementRow[])
  } catch {
    return module.rows
  }
  return module.rows
}

function migrateRows(moduleId: string, rows: ManagementRow[]) {
  if (!Array.isArray(rows)) return []
  if (moduleId === 'menu-items') return rows.map((row, index) => {
    const currentCode = String(row.code ?? '')
    return { ...row,
      code: /^M\d{5}$/.test(currentCode) ? currentCode : `M${String(index + 1).padStart(5, '0')}`,
      productType: row.productType ?? (row.category === 'Retail SKU' ? 'Hàng hóa thường' : 'Chế biến'),
      menuType: row.menuType ?? (row.category === 'Bánh' || row.category === 'Đồ ăn' ? 'Đồ ăn' : 'Đồ uống'),
      visible: row.visible ?? true, extra: row.extra ?? false, points: row.points ?? true,
      image: row.image ?? '', attributes: row.attributes ?? '[]', units: row.units ?? '[]',
    }
  })
  if (moduleId === 'invoices') return rows.map((row) => {
    const oldCode = String(row.code ?? '')
    const code = oldCode.startsWith('MOC-') ? `HD${oldCode.slice(4).padStart(6, '0')}` : oldCode
    const amount = Number(row.amount ?? 0)
    return { ...row, code, table: row.table ?? 'Mang về', order: row.order ?? '', items: row.items ?? '', amount, discount: row.discount ?? 0, due: row.due ?? amount, paid: row.paid ?? (row.status === 'Đã thanh toán' ? amount : 0), date: row.date ?? '', branch: row.branch ?? 'Mộc Store · Quận 1', receiver: row.receiver ?? 'Thu ngân A', creator: row.creator ?? 'Thu ngân A' }
  })
  if (moduleId === 'cashbook') return rows.map((row) => {
    const oldType = String(row.type ?? '')
    const oldCode = String(row.code ?? '')
    const amountText = oldCode.match(/\d+/)?.[0] ?? '1'
    const code = oldCode.startsWith('PT-') ? `TTHD${amountText.padStart(6, '0')}` : oldCode.startsWith('PC-') ? `CCHD${amountText.padStart(6, '0')}` : oldCode
    return { ...row, code, status: row.status ?? 'Đã thanh toán', voucher: row.voucher ?? (oldType === 'Chi' ? 'Phiếu Chi' : 'Phiếu Thu'), category: row.category ?? row.note ?? '', payerGroup: row.payerGroup ?? (oldType === 'Thu' ? 'Khách hàng' : 'Nhà cung cấp'), payer: row.payer ?? '', method: row.method ?? 'Tiền mặt', branch: row.branch ?? 'Mộc Store · Quận 1', creator: row.creator ?? 'Thu ngân A', date: row.date ?? '' }
  })
  return rows
}

