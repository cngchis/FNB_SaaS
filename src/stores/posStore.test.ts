import { beforeEach, describe, expect, it } from 'vitest'
import { usePosStore } from './posStore'
import { selectionId } from '../api/pos'
import type { Product } from '../types'
const coffee: Product = { id: 'coffee', name: 'Coffee', sku: 'M1', price: 35000, stock: 0, minimum: 0, category: 'Coffee', color: '#fff' }
beforeEach(() => usePosStore.getState().resetSession())
describe('POS order tabs', () => {
  it('keeps quantities, customer and notes isolated between tabs', () => {
    const first = usePosStore.getState().activeTabID
    usePosStore.getState().add(coffee)
    usePosStore.getState().setNote('No ice')
    usePosStore.getState().setCustomer('Customer A')
    usePosStore.getState().newTab()
    const second = usePosStore.getState().activeTabID
    expect(usePosStore.getState().items).toEqual([])
    usePosStore.getState().add(coffee)
    usePosStore.getState().setQuantity(coffee.id, 3)
    usePosStore.getState().activateTab(first)
    expect(usePosStore.getState().items[0].quantity).toBe(1)
    expect(usePosStore.getState().note).toBe('No ice')
    expect(usePosStore.getState().customer).toBe('Customer A')
    usePosStore.getState().activateTab(second)
    expect(usePosStore.getState().items[0].quantity).toBe(3)
    expect(usePosStore.getState().note).toBe('')
  })
  it('closes every tab without replacing the last one, then starts at one on demand', () => {
    const first = usePosStore.getState().activeTabID
    usePosStore.getState().add(coffee)
    usePosStore.getState().newTab()
    const second = usePosStore.getState().activeTabID
    usePosStore.getState().closeTab(second)
    expect(usePosStore.getState().activeTabID).toBe(first)
    expect(usePosStore.getState().items).toHaveLength(1)
    usePosStore.getState().newTab()
    usePosStore.getState().closeTab(first)
    expect(usePosStore.getState().items).toEqual([])
    usePosStore.getState().closeTab(usePosStore.getState().activeTabID)
    expect(usePosStore.getState().tabs).toHaveLength(0)
    expect(usePosStore.getState().activeTabID).toBe('')
    usePosStore.getState().add(coffee)
    expect(usePosStore.getState().tabs.map((tab) => tab.label)).toEqual(['Đơn hàng 1'])
    expect(usePosStore.getState().items).toHaveLength(1)
    usePosStore.getState().closeTab(usePosStore.getState().activeTabID)
    usePosStore.getState().setTable('Bàn 02')
    expect(usePosStore.getState().tabs.map((tab) => tab.label)).toEqual(['Đơn hàng 1'])
    expect(usePosStore.getState().table).toBe('Bàn 02')
  })
  it('clears all carts when the session changes', () => {
    usePosStore.getState().add(coffee)
    usePosStore.getState().newTab()
    usePosStore.getState().resetSession()
    expect(usePosStore.getState().tabs).toHaveLength(1)
    expect(usePosStore.getState().items).toEqual([])
  })
  it('uses the same selection key after reopening, regardless of attribute order', () => {
    const attrs = [{ name: 'Size', value: 'L' }, { name: 'Ice', value: 'Less' }]
    expect(selectionId('product', 'Cup', attrs)).toBe(selectionId('product', 'Cup', [...attrs].reverse()))
    expect(selectionId('product', 'Cup', attrs)).not.toBe(selectionId('product', 'Box', attrs))
  })
})
