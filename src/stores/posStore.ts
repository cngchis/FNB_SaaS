import { create } from 'zustand'
import type { CartLine, Product } from '../types'

const draftStorageKey = 'fnb-pos:drafts'

export type PosDraft = {
  id: string
  orderCode: string
  table: string
  customer: string
  items: CartLine[]
  discount: number
  note: string
  updatedAt: string
}

function readDrafts(): PosDraft[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(draftStorageKey) ?? '[]')
    return Array.isArray(saved) ? saved as PosDraft[] : []
  } catch { return [] }
}

function persistDrafts(drafts: PosDraft[]) {
  try { localStorage.setItem(draftStorageKey, JSON.stringify(drafts)) } catch { /* storage may be unavailable */ }
}

function incrementOrderCode(orderCode: string) {
  const [prefix, suffix] = orderCode.split('-')
  return `${prefix}-${Number(suffix || 0) + 1}`
}

type PosState = {
  items: CartLine[]
  discount: number
  note: string
  customer: string
  table: string
  orderCode: string
  drafts: PosDraft[]
  activeDraftId: string | null
  add: (product: Product) => void
  setQuantity: (productId: string, quantity: number) => void
  remove: (productId: string) => void
  setDiscount: (discount: number) => void
  setNote: (note: string) => void
  setCustomer: (customer: string) => void
  setTable: (table: string) => void
  nextOrder: () => void
  saveDraft: () => PosDraft | null
  openDraft: (id: string) => void
  syncActiveDraft: () => void
  removeDraft: (id: string) => void
  clear: () => void
}

export const usePosStore = create<PosState>((set, get) => ({
  items: [],
  discount: 0,
  note: '',
  customer: 'Khách lẻ',
  table: 'Mang về',
  orderCode: '168-15',
  drafts: readDrafts(),
  activeDraftId: null,
  add: (product) => set((state) => {
    const exists = state.items.find((line) => line.product.id === product.id)
    return { items: exists
      ? state.items.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line)
      : [...state.items, { product, quantity: 1 }] }
  }),
  setQuantity: (productId, quantity) => set((state) => ({ items: quantity < 1
    ? state.items.filter((line) => line.product.id !== productId)
    : state.items.map((line) => line.product.id === productId ? { ...line, quantity } : line) })),
  remove: (productId) => set((state) => ({ items: state.items.filter((line) => line.product.id !== productId) })),
  setDiscount: (discount) => set({ discount: Math.max(0, discount) }),
  setNote: (note) => set({ note }),
  setCustomer: (customer) => set({ customer }),
  setTable: (table) => set({ table }),
  nextOrder: () => set((state) => ({ orderCode: incrementOrderCode(state.orderCode) })),
  saveDraft: () => {
    const state = get()
    if (!state.items.length) return null
    const draft: PosDraft = {
      id: state.activeDraftId ?? crypto.randomUUID(), orderCode: state.orderCode,
      table: state.table || 'Mang về', customer: state.customer, items: state.items,
      discount: state.discount, note: state.note, updatedAt: new Date().toISOString(),
    }
    const drafts = [draft, ...state.drafts.filter((item) => item.id !== draft.id)]
    persistDrafts(drafts)
    set({ drafts, activeDraftId: null, items: [], discount: 0, note: '', customer: 'Khách lẻ', table: 'Mang về', orderCode: incrementOrderCode(state.orderCode) })
    return draft
  },
  openDraft: (id) => {
    const draft = get().drafts.find((item) => item.id === id)
    if (draft) set({ activeDraftId: draft.id, orderCode: draft.orderCode, table: draft.table, customer: draft.customer, items: draft.items, discount: draft.discount, note: draft.note })
  },
  syncActiveDraft: () => {
    const state = get()
    if (!state.activeDraftId) return
    const updated: PosDraft = { id: state.activeDraftId, orderCode: state.orderCode, table: state.table, customer: state.customer, items: state.items, discount: state.discount, note: state.note, updatedAt: new Date().toISOString() }
    const drafts = state.drafts.map((draft) => draft.id === updated.id ? updated : draft)
    persistDrafts(drafts)
    set({ drafts })
  },
  removeDraft: (id) => set((state) => {
    const drafts = state.drafts.filter((draft) => draft.id !== id)
    persistDrafts(drafts)
    return { drafts, activeDraftId: state.activeDraftId === id ? null : state.activeDraftId }
  }),
  clear: () => {
    const state = get()
    if (state.activeDraftId) {
      const drafts = state.drafts.filter((draft) => draft.id !== state.activeDraftId)
      persistDrafts(drafts)
      set({ drafts, items: [], discount: 0, note: '', customer: 'Khách lẻ', table: 'Mang về', activeDraftId: null })
      return
    }
    set({ items: [], discount: 0, note: '', customer: 'Khách lẻ', table: 'Mang về', activeDraftId: null })
  },
}))
