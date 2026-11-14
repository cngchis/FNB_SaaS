import { expect, it } from 'vitest'
import { countInput, decimalQuantity, quantityDifference } from './inventory'
it('keeps stocktake decimals exact without floating point arithmetic', () => {
 expect(decimalQuantity('0.125001')).toBe(125001n)
 expect(quantityDifference('10.000001','9.999999')).toBe('+0.000002')
 expect(quantityDifference('0','0.125')).toBe('-0.125')
 expect(quantityDifference('2','2.000000')).toBe('0')
 expect(()=>decimalQuantity('1e3')).toThrow()
 expect(()=>decimalQuantity('-1')).toThrow()
 expect(countInput.safeParse({product_id:'00000000-0000-4000-8000-000000000001',counted_quantity:'1000000000.000001',balance_version:0}).success).toBe(false)
})
