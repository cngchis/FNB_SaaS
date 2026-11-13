import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { inventoryEditorRow, saveInventoryEditorRow } from './localInventory'
import type { Product } from '../types'
let stored: string | null
const product: Product = { id: 'M00003', sku: 'M00003', name: 'Bia lon', category: 'Bia', price: 22000, stock: 48, minimum: 0, color: '#fff' }
beforeEach(() => { stored = JSON.stringify([{ code: product.sku, name: product.name, productType: 'Hàng hóa thường', category: 'Bia', price: 22000, stock: 48, cost: 16000, baseUnit: 'Lon', _tracksStock: true, attributes: '[{"name":"Size","value":"L","price_delta_vnd":3000}]', units: '[]' }]); vi.stubGlobal('localStorage', { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value } }) })
afterEach(() => vi.unstubAllGlobals())
it('preserves full product metadata and updates the same local row', () => {
 const initial = inventoryEditorRow(product)
 expect(initial.baseUnit).toBe('Lon')
 saveInventoryEditorRow(initial, { name: 'Bia chai', price: 25000, code: 'M99999' })
 const rows = JSON.parse(stored!)
 expect(rows).toHaveLength(1)
 expect(rows[0]).toMatchObject({ code: product.sku, name: 'Bia chai', price: 25000, _tracksStock: true })
 expect(rows[0].attributes).toContain('Size')
 expect(rows[0]).not.toHaveProperty('_inventoryNew')
})
it('materializes bundled inventory in local demo data with an available code', () => {
 const initial = inventoryEditorRow({ ...product, sku: 'RT-001', name: 'Ly giữ nhiệt' })
 expect(initial.code).toBe('M00004')
 saveInventoryEditorRow(initial, { name: 'Ly mới', productType: 'Hàng hóa thường' })
 expect(JSON.parse(stored!)).toHaveLength(2)
})
it('does not overwrite a row that appeared while editing a bundled product', () => {
 const initial = inventoryEditorRow({ ...product, sku: 'RT-001' })
 const rows = JSON.parse(stored!); rows.push({ code: initial.code, name: 'Another product' }); stored = JSON.stringify(rows)
 expect(() => saveInventoryEditorRow(initial, { name: 'Changed' })).toThrow('đã thay đổi')
 expect(JSON.parse(stored!)[1].name).toBe('Another product')
})
it('removes manual cost and stock when switching to a prepared product', () => {
 const result = saveInventoryEditorRow(inventoryEditorRow(product), { productType: 'Chế biến' })
 expect(result).not.toHaveProperty('cost')
 expect(result).not.toHaveProperty('stock')
})
