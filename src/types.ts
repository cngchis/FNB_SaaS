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
  productType?: 'Hàng hóa thường' | 'Chế biến'
  attributes?: { name: string; value: string }[]
  units?: { name: string; ratio: number; cost?: number; price?: number }[]
}

export type CartLine = {
  product: Product
  quantity: number
}
