export type Product = {
  id: string
  name: string
  sku: string
  category: string
  price: number
  stock: number
  minimum: number
  color: string
  image?: string
  sourceId?: string
  unitName?: string
  selectedAttributes?: { name: string; value: string }[]
  baseVisible?: boolean
  baseUnit?: string
  productType?: 'Hàng hóa thường' | 'Chế biến'
  attributes?: { name: string; value: string; price_delta_vnd?: number }[]
  units?: { name: string; ratio: number; cost?: number; price?: number; visible?: boolean }[]
}

export type CartLine = {
  product: Product
  quantity: number
}
