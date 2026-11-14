import { cartStockWarning } from './posStock'
import { inventoryRepository } from './inventory'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { apiConfig } from './config'
import { useSessionStore } from './auth'
import { customersRepository, menuItemsRepository } from './catalog'
import { selectionId, ordersRepository, roomsRepository, type OrderDTO, type OrderInput } from './pos'
import { usePosStore, type PosDraft } from '../stores/posStore'
import type { Product } from '../types'

async function allPages<T>(load: (page: number) => Promise<{ items: T[]; pagination: { total_pages: number } }>): Promise<T[]> {
  const items: T[] = []; let page = 1; let pages = 1
  do { const result = await load(page); items.push(...result.items); pages = result.pagination.total_pages; page++ } while (page <= pages)
  return items
}
function scope() { const session = useSessionStore.getState().session; return `${session?.tenant_id}:${session?.store_id}:${session?.user.id}` }
useSessionStore.subscribe((session, before) => {
  if (!apiConfig.useMock && (session.session?.user.id !== before.session?.user.id || session.session?.tenant_id !== before.session?.tenant_id || session.session?.store_id !== before.session?.store_id)) usePosStore.getState().resetSession()
})
export function orderCart(order: OrderDTO) {
  return order.items.map((line) => ({ quantity: line.quantity, product: { id: selectionId(line.product_id, line.unit, line.attributes), sourceId: line.product_id, unitName: line.unit, selectedAttributes: line.attributes, name: line.name, sku: line.sku, price: line.price_vnd, stock: 0, minimum: 0, category: '', color: '#eef2f7' } satisfies Product }))
}
export function usePosController() {
  const session = useSessionStore((state) => state.session)
  const items = usePosStore((state) => state.items)
  const customerID = usePosStore((state) => state.customerID)
  const serverOrderID = usePosStore((state) => state.serverOrderID)
  const remote = !apiConfig.useMock
  const key = scope()
  const client = useQueryClient()
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const paymentKeys = useRef(new Map<string, string>())
  const savedOrders = useRef(new Map<string, OrderDTO>())
  const catalog = useQuery({ queryKey: ['api', key, 'pos-catalog'], enabled: remote && !!session, queryFn: async ({ signal }) => {
    const [products, customers] = await Promise.all([
      allPages((page) => menuItemsRepository.list({ page, page_size: 100, availability: 'available' }, signal)),
      allPages((page) => customersRepository.list({ page, page_size: 100 }, signal)),
    ])
    return { productRecords: products, products: products.filter((p) => p.is_visible || p.units.some((unit) => unit.is_visible !== false)).map((p): Product => ({ id: p.id, sourceId: p.id, name: p.name, sku: p.sku, category: p.category_name ?? 'Khác', price: p.price_vnd, stock: 0, minimum: 0, color: '#eef2f7', image: p.image_url ?? undefined, baseUnit: p.base_unit, baseVisible: p.is_visible, productType: p.product_type === 'goods' ? 'Hàng hóa thường' : 'Chế biến', attributes: p.attributes, units: p.units.map((u) => ({ name: u.name, ratio: Number(u.ratio), price: u.price_vnd, cost: u.cost_vnd ?? undefined, visible: u.is_visible !== false })) })), customers }
  } })
  const rooms = useQuery({ queryKey: ['api', key, 'rooms'], enabled: remote && !!session, queryFn: ({ signal }) => roomsRepository.list(signal), refetchInterval: 15_000 })
  const orders = useQuery({ queryKey: ['api', key, 'pos-orders'], enabled: remote && !!session, queryFn: async ({ signal }) => {
    const [open, history] = await Promise.all([allPages((page) => ordersRepository.list('open', page, signal)), ordersRepository.list('history', 1, signal)])
    return { open, history: history.items }
  }, refetchInterval: 15_000 })
  const stockIDs = [...new Set(items.map((line) => line.product.sourceId ?? line.product.id))].sort()
  const stockEnabled = remote && !!session && stockIDs.length > 0
  const stock = useQuery({ queryKey: ['api', key, 'pos-stock', stockIDs], enabled: stockEnabled, queryFn: async ({ signal }) => {
    const balances = []
    for (let offset=0;offset<stockIDs.length;offset+=100) balances.push(...await inventoryRepository.quantities(stockIDs.slice(offset,offset+100),signal))
    return balances
  }, refetchInterval: 15_000 })
  const prior = serverOrderID ? savedOrders.current.get(serverOrderID) ?? orders.data?.open.find((order) => order.id === serverOrderID) : undefined
  const stockWarning = remote && stock.data ? cartStockWarning(items, catalog.data?.productRecords ?? [], stock.data, prior) : ''
  const debtEnabled = remote && !!session && !!customerID
  const debt = useQuery({ queryKey: ['api', key, 'customer-debt', customerID, serverOrderID], enabled: debtEnabled, queryFn: ({ signal }) => customersRepository.debt(customerID!, serverOrderID, signal), refetchInterval: 15_000 })
  const invalidate = () => client.invalidateQueries({ queryKey: ['api', key] })
  const apply = (order: OrderDTO) => {
    if (scope() !== key) throw new Error('Phiên đã thay đổi. Vui lòng đăng nhập lại.')
    savedOrders.current.set(order.id, order)
    usePosStore.setState({ paidAmount: '', items: orderCart(order), serverOrderID: order.id, serverVersion: order.version, orderCode: order.code, table: order.room, customer: order.customer, customerID: order.customer_id, note: order.note, discount: order.discount_vnd, paidBefore: order.paid_vnd, activeDraftId: null, saveKey: '', saveSignature: '' })
  }
  const save = async () => {
    const state = usePosStore.getState()
    if (!state.items.length) throw new Error('Đơn hàng chưa có món.')
    const room = rooms.data?.find((r) => r.name === state.table)
    const customer = catalog.data?.customers.find((c) => c.id === state.customerID)
    if (state.table !== 'Mang về' && !room) throw new Error('Bàn không còn tồn tại. Vui lòng chọn lại.')
    if (state.customer !== 'Khách lẻ' && !customer) throw new Error('Khách hàng không còn tồn tại. Vui lòng chọn lại.')
    const input: OrderInput = { room_id: room?.id ?? null, customer_id: customer?.id ?? null, note: state.note, discount_vnd: state.discount, version: state.serverVersion,
      items: state.items.map((line) => ({ product_id: line.product.sourceId ?? line.product.id, quantity: line.quantity, unit: line.product.unitName ?? '', attributes: line.product.selectedAttributes ?? [] })) }
    const signature = JSON.stringify(input)
    const requestKey = state.saveSignature === signature && state.saveKey ? state.saveKey : crypto.randomUUID()
    usePosStore.setState({ saveSignature: signature, saveKey: requestKey })
    const order = await ordersRepository.save(input, requestKey, state.serverOrderID ?? undefined)
    apply(order); await invalidate(); return order
  }
  const exclusive = async <T,>(operation: () => Promise<T>) => {
    if (lock.current) throw new Error('Đang xử lý đơn hàng. Vui lòng đợi.')
    lock.current = true; setBusy(true)
    try { return await operation() } finally { lock.current = false; setBusy(false) }
  }
  const pay = (received: number) => exclusive(async () => {
    const state = usePosStore.getState()
    if (!state.serverOrderID) throw new Error('Đơn hàng chưa được lưu.')
    if (!Number.isSafeInteger(received) || received < 0) throw new Error('Số tiền phải là số nguyên không âm.')
    const signature = `${state.serverOrderID}:${received}`
    const requestKey = paymentKeys.current.get(signature) ?? crypto.randomUUID()
    paymentKeys.current.set(signature, requestKey)
    const result = await ordersRepository.pay(state.serverOrderID, received, requestKey)
    if (scope() !== key) throw new Error('Phiên đã thay đổi.')
    paymentKeys.current.delete(signature)
    usePosStore.getState().closeTab(state.activeTabID)
    await invalidate(); return result
  })
  const open = (id: string) => exclusive(async () => {
    const state = usePosStore.getState()
    if (state.serverOrderID === id) return
    const existing = state.tabs.find((tab) => tab.snapshot?.serverOrderID === id)
    if (existing) { state.activateTab(existing.id); return }
    const order = await ordersRepository.get(id)
    if (scope() !== key) throw new Error('Phiên đã thay đổi.')
    if (!state.tabs.length || state.items.length || state.serverOrderID) state.newTab()
    apply(order)
  })
  const drafts: PosDraft[] = (orders.data?.open ?? []).map((order) => ({ paid: order.paid_vnd, id: order.id, orderCode: order.code, table: order.room, customer: order.customer, items: orderCart(order), discount: order.discount_vnd, note: order.note, updatedAt: order.updated_at }))
  return { remote, busy, stockWarning, customerDebt: debtEnabled ? debt.data?.outstanding_vnd ?? 0 : 0, debtPending: debtEnabled && debt.isFetching, save: () => exclusive(save), pay, open, invalidate, products: catalog.data?.products ?? [], customers: catalog.data?.customers ?? [], rooms: rooms.data ?? [], drafts, history: orders.data?.history ?? [],
    loading: remote && (catalog.isPending || rooms.isPending || orders.isPending || (debtEnabled && debt.isPending) || (stockEnabled && stock.isPending)), error: (stockEnabled ? stock.error : null) ?? catalog.error ?? rooms.error ?? orders.error ?? (debtEnabled ? debt.error : null) }
}
