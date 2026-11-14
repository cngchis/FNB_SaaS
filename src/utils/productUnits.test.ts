import { expect, it } from 'vitest'
import { stockInUnit, formatStockQuantity } from './productUnits'
it('hides decimal padding without rounding stock quantities', () => {
 expect(formatStockQuantity('2.000000')).toBe('2')
 expect(formatStockQuantity('2.500000')).toBe('2.5')
 expect(formatStockQuantity('0.000000')).toBe('0')
 expect(formatStockQuantity('100')).toBe('100')
 expect(formatStockQuantity('9007199254740993.000001')).toBe('9007199254740993.000001')
 expect(formatStockQuantity(null)).toBe('—')
})
it('shows packaging and loose units from one shared base balance', () => {
 expect(stockInUnit(48,24,'Thùng','Lon')).toBe('2 Thùng')
 expect(stockInUnit(47,24,'Thùng','Lon')).toBe('1 Thùng + 23 Lon')
 expect(stockInUnit(0,24,'Thùng','Lon')).toBe('0 Thùng')
})
it('preserves decimal remainders exactly and never invents unknown stock', () => {
 expect(stockInUnit('1.234567',0.5,'Gói','kg')).toBe('2 Gói + 0,234567 kg')
 expect(stockInUnit('—',24,'Thùng','Lon')).toBe('—')
 expect(stockInUnit(48,0,'Thùng','Lon')).toBe('—')
})
