import { afterEach, expect, it, vi } from 'vitest'
import { loadRows } from './localManagement'
import { managementModules } from '../features/management/moduleConfig'

afterEach(() => vi.unstubAllGlobals())
it('preserves existing prototype rows when storage is empty or unavailable', () => {
  const module = managementModules.find((item) => item.id === 'menu-items')!
  vi.stubGlobal('localStorage', { getItem: () => null })
  expect(loadRows(module)).toBe(module.rows)
  vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Unavailable') } })
  expect(loadRows(module)).toBe(module.rows)
})
it('keeps legacy product migrations unchanged', () => {
  const module = managementModules.find((item) => item.id === 'menu-items')!
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify([{ code: 'old', name: 'Legacy', category: 'Retail SKU' }]) })
  expect(loadRows(module)[0]).toMatchObject({ code: 'M00001', productType: 'Hàng hóa thường', visible: true, attributes: '[]', units: '[]' })
})
