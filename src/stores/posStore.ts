import { create } from 'zustand'
import { products } from '../services/mockData'
import type { CartLine, Product } from '../types'

type PosState = {
  items: CartLine[]
  discount: number
  note: string
  customer: string
  table: string
  orderCode: string
  add: (product: Product) => void
  setQuantity: (productId: string, quantity: number) => void
  remove: (productId: string) => void
  setDiscount: (discount: number) => void
  setNote: (note: string) => void
  setCustomer: (customer: string) => void
  setTable: (table: string) => void
  nextOrder: () => void
  clear: () => void
}

export const usePosStore = create<PosState>((set) => ({
  items: [
    { product: products[0], quantity: 2 },
    { product: products[1], quantity: 1 },
    { product: products[4], quantity: 1 },
  ],
  discount: 0,
  note: '',
  customer: 'Khách lẻ',
  table: 'Mang về',
  orderCode: '168-15',
  add: (product) => set((state) => {
    const exists = state.items.find((line) => line.product.id === product.id)
    return {
      items: exists
        ? state.items.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line)
        : [...state.items, { product, quantity: 1 }],
    }
  }),
  setQuantity: (productId, quantity) => set((state) => ({
    items: quantity < 1
      ? state.items.filter((line) => line.product.id !== productId)
      : state.items.map((line) => line.product.id === productId ? { ...line, quantity } : line),
  })),
  remove: (productId) => set((state) => ({ items: state.items.filter((line) => line.product.id !== productId) })),
  setDiscount: (discount) => set({ discount: Math.max(0, discount) }),
  setNote: (note) => set({ note }),
  setCustomer: (customer) => set({ customer }),
  setTable: (table) => set({ table }),
  nextOrder: () => set((state) => {
    const [prefix, suffix] = state.orderCode.split('-')
    return { orderCode: `${prefix}-${Number(suffix || 0) + 1}` }
  }),
  clear: () => set({ items: [], discount: 0, note: '', customer: 'Khách lẻ', table: 'Mang về' }),
}))
