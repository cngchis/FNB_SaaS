import { expect, it } from 'vitest'
import { customerInput, productInput, productRow } from './recordAdapter'
import type { ProductDTO, GroupDTO } from './catalog'

const id = 'c447ec4c-a42b-440c-a564-91f0b14f3400'
const product: ProductDTO = {
  id, sku: 'M00001', name: 'Bia lon', category_id: id, category_name: 'Bia', product_type: 'goods', menu_type: 'drink',
  base_unit: 'Lon', price_vnd: 35000, cost_vnd: 16000, tracks_stock: false, is_visible: true, is_extra: false,
  earns_points: true, availability: 'available', image_url: '/image.webp',
  attributes: [{ name: 'Size', value: 'L', price_delta_vnd: 5000 }],
  units: [{ name: 'Thùng', ratio: '24.000', price_vnd: 700000, cost_vnd: 384000 }],
}
it('round-trips product data while separating UUID, SKU and unavailable stock', () => {
  const row = productRow(product)
  expect(row.__id).toBe(id)
  expect(row.stock).toBe('—')
  const input = productInput(row, [{ id, name: 'Bia' }])
  expect(input).not.toHaveProperty('sku')
  expect(input).not.toHaveProperty('stock')
  expect(input).not.toHaveProperty('tenant_id')
  expect(input.tracks_stock).toBe(false)
  expect(input.attributes[0].price_delta_vnd).toBe(5000)
  expect(input.units[0]).toEqual({ name: 'Thùng', ratio: '24', price_vnd: 700000, cost_vnd: 384000 })
})
it('removes manual costs and product stock tracking for prepared items', () => {
  const input = productInput({ ...productRow(product), productType: 'Chế biến' }, [{ id, name: 'Bia' }])
  expect(input.cost_vnd).toBeNull()
  expect(input.units[0].cost_vnd).toBeNull()
  expect(input.tracks_stock).toBe(false)
})
it('keeps an unknown unit cost null until the user edits it', () => {
  const row = productRow({ ...product, units: [{ ...product.units[0], cost_vnd: null }] })
  expect(productInput(row, [{ id, name: 'Bia' }]).units[0].cost_vnd).toBeNull()
})
it('rejects fractional money, unknown categories and unsaved image uploads', () => {
  expect(() => productInput({ ...productRow(product), price: 35.5 }, [{ id, name: 'Bia' }])).toThrow()
  expect(() => productInput(productRow(product), [])).toThrow()
  expect(() => productInput({ ...productRow(product), image: 'data:image/webp;base64,abc' }, [{ id, name: 'Bia' }])).toThrow()
})
it('does not send computed customer metrics or cashier point adjustments', () => {
  const group: GroupDTO = { id, name: 'VIP', condition: '', benefit: '', is_active: true, members: 2 }
  const input = customerInput({ name: 'Anh Nam', phone: '0900000000', segment: 'VIP', points: 100, spent: 500000, orders: 9 }, [group], false)
  expect(input.group_id).toBe(id)
  expect(input).not.toHaveProperty('points')
  expect(input).not.toHaveProperty('spent')
  expect(input).not.toHaveProperty('orders')
})
