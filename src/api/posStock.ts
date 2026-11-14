import type { ProductDTO } from './catalog'
import type { CartLine } from '../types'
import { decimalQuantity } from './inventory'
import { selectionId, type OrderDTO } from './pos'

export type StockBalance = { product_id: string; quantity: string | null; balance_version: number }
export const insufficientStockMessage = 'Không đủ tồn kho để bán. Vui lòng nhập hàng hoặc kiểm kho trước khi thanh toán.'

// Advisory only: the server still serializes checkout against other tills.
export function cartStockWarning(items: CartLine[], products: ProductDTO[], balances: StockBalance[], prior?: OrderDTO): string {
  const demand = new Map<string, bigint>()
  const credit = new Map<string, bigint>()
  const accumulate = (map: Map<string, bigint>, id: string, quantity: number, ratio: string) => {
    map.set(id, (map.get(id) ?? 0n) + BigInt(quantity) * decimalQuantity(ratio))
  }
  for (const line of items) {
    const id = line.product.sourceId ?? line.product.id
    const old = prior?.items.find((p) => selectionId(p.product_id, p.unit, p.attributes) === selectionId(id, line.product.unitName, line.product.selectedAttributes))
    const product = products.find((p) => p.id === id)
    const tracked = old?.stock_tracked ?? (product?.product_type === 'goods' && product.tracks_stock)
    if (!tracked) continue
    const unit = line.product.unitName ?? ''
    if (old?.stock_tracked && !old.stock_ratio) return 'Đơn cũ thiếu thông tin quy đổi kho. Vui lòng tạo lại đơn với đơn vị hợp lệ.'
    const ratio = old?.stock_ratio ?? (!unit || unit === product?.base_unit ? '1' : product?.units.find((u) => u.name === unit)?.ratio)
    if (!ratio) return 'Đơn cũ thiếu thông tin quy đổi kho. Vui lòng tạo lại đơn với đơn vị hợp lệ.'
    accumulate(demand, id, line.quantity, ratio)
  }
  if (prior?.invoice_code) {
    for (const line of prior.items) {
      if (line.stock_tracked && line.stock_ratio) accumulate(credit, line.product_id, line.quantity, line.stock_ratio)
    }
  }
  for (const [id, quantity] of demand) {
    const extra = quantity - (credit.get(id) ?? 0n)
    if (extra <= 0n) continue
    const balance = balances.find((b) => b.product_id === id)
    if (!balance) continue // The query may still be loading; never invent stock.
    if (balance.quantity === null) return 'Hàng hóa cũ chưa xác nhận tồn đầu kỳ. Vui lòng kiểm kho trước khi thanh toán.'
    if (extra > decimalQuantity(balance.quantity)) return insufficientStockMessage
  }
  return ''
}
