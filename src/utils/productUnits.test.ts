import { expect, it } from 'vitest'
import { stockInUnit } from './productUnits'
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
