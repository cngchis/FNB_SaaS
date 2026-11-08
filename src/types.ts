export type Product = {
  id: string
  name: string
  sku: string
  category: string
  price: number
  stock: number
  minimum: number
  color: string
}

export type CartLine = {
  product: Product
  quantity: number
}
