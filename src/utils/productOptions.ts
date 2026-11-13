import type { Product } from '../types'

export type ProductAttribute = { name: string; value: string; price_delta_vnd?: number }
// Expand legacy comma-separated values so each selectable option has its own price.
export function expandAttributes(attributes: ProductAttribute[]): ProductAttribute[] {
  return attributes.flatMap((attribute) => attribute.value.split(',').map((value) => ({ ...attribute, value: value.trim(), price_delta_vnd: attribute.price_delta_vnd ?? 0 })).filter((option) => option.value))
}
export function optionPrice(product: Pick<Product, 'price'>, attribute?: ProductAttribute): number {
  return product.price + (attribute?.price_delta_vnd ?? 0)
}
