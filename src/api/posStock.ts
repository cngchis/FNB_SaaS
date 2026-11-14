import type { ProductDTO } from './catalog'
import type { CartLine } from '../types'
import { decimalQuantity } from './inventory'
import { selectionId, type OrderDTO } from './pos'
import { selectRecipe, type RecipeDTO } from './recipes'

export type StockBalance = { product_id: string; quantity: string | null; balance_version: number }
export const insufficientStockMessage = 'Không đủ tồn kho để bán. Vui lòng nhập hàng hoặc kiểm kho trước khi thanh toán.'

// Advisory only: the server still serializes checkout against other tills.
export function cartStockWarning(items: CartLine[], products: ProductDTO[], balances: StockBalance[], prior?: OrderDTO, recipes: Record<string, RecipeDTO[]> = {}): string {
  const demand = new Map<string, bigint>()
  const credit = new Map<string, bigint>()
  const accumulate = (map: Map<string, bigint>, id: string, quantity: number, ratio: string) => {
    map.set(id, (map.get(id) ?? 0n) + BigInt(quantity) * decimalQuantity(ratio))
  }
  for (const line of items) {
    const id = line.product.sourceId ?? line.product.id
    const old = prior?.items.find((p) => selectionId(p.product_id, p.unit, p.attributes) === selectionId(id, line.product.unitName, line.product.selectedAttributes))
    const product = products.find((p) => p.id === id)
    const configured = recipes[id] ?? []
    const snapshot = old ? old.recipe_snapshot : selectRecipe(configured, line.product.unitName || product?.base_unit || '', line.product.selectedAttributes ?? [])
    if (!old && configured.length && !snapshot) return 'Chưa có công thức cho đơn vị hoặc thuộc tính đã chọn. Vui lòng thiết lập công thức trước khi bán.'
    if (old && !snapshot && configured.length && line.quantity > old.quantity) return 'Món trong đơn cũ chưa có công thức nguyên liệu. Vui lòng tạo lại lựa chọn món trước khi tăng số lượng.'
    for (const ingredient of snapshot?.ingredients ?? []) accumulate(demand, ingredient.product_id, line.quantity, ingredient.quantity)
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
      for (const ingredient of line.recipe_snapshot?.ingredients ?? []) accumulate(credit, ingredient.product_id, line.quantity, ingredient.quantity)
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
