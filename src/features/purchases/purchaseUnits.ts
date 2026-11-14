import type { ManagementRow } from '../management/moduleConfig'
import type { ReceiptInput } from '../../api/purchasing'
import type { ProductDTO } from '../../api/catalog'
import { decimalQuantity } from '../../api/inventory'
import { formatStockQuantity } from '../../utils/productUnits'

export type PurchaseProduct = Pick<ProductDTO, 'id' | 'name' | 'sku' | 'base_unit' | 'cost_vnd' | 'units'>
export type PurchaseLine = { product: PurchaseProduct; quantity: number; cost: number; unit: string; ratio: string; baseUnit: string; refreshUnit?: boolean; needsCatalog?: boolean }
export function purchaseUnitOptions(product: PurchaseProduct) {
  return [{ name: product.base_unit, ratio: '1', cost_vnd: product.cost_vnd }, ...product.units.map((u) => ({ name: u.name, ratio: u.ratio, cost_vnd: u.cost_vnd }))]
}
export function convertedPurchaseQuantity(quantity: number, ratio: string): string {
  if (!Number.isSafeInteger(quantity) || quantity < 0) return '—'
  try {
    const total = BigInt(quantity) * decimalQuantity(ratio)
    return formatStockQuantity(`${total / 1_000_000n}.${String(total % 1_000_000n).padStart(6, '0')}`)
  } catch { return '—' }
}
export function purchaseLineInput(line: PurchaseLine) {
  return { product_id: line.product.id, unit: line.unit, expected_unit_ratio: formatStockQuantity(line.ratio), expected_base_unit: line.baseUnit, ...(line.refreshUnit ? { refresh_unit: true } : {}), quantity: line.quantity, cost_vnd: line.cost }
}

export function purchaseItemsSignature(items: ReceiptInput['items']): string {
  return JSON.stringify(items.map((item)=>({ product_id:item.product_id, unit:item.unit, expected_unit_ratio:item.expected_unit_ratio, expected_base_unit:item.expected_base_unit, quantity:item.quantity, cost_vnd:item.cost_vnd })))
}

export function mockPurchaseProduct(row: ManagementRow): PurchaseProduct {
  let units: PurchaseProduct['units'] = []
  try {
    const data:unknown = JSON.parse(String(row.units ?? '[]'))
    if(Array.isArray(data)) units=data.filter((u):u is Record<string,unknown>=>typeof u==='object'&&u!==null).map((u)=>({name:String(u.name),ratio:String(u.ratio),price_vnd:Number(u.price ?? 0),cost_vnd:u.cost==null?null:Number(u.cost)}))
  } catch { /* Legacy demo products can omit unit metadata. */ }
  return {id:String(row.code),sku:String(row.code),name:String(row.name),base_unit:String(row.baseUnit ?? 'Cái'),cost_vnd:row.cost==null?null:Number(row.cost),units}
}
