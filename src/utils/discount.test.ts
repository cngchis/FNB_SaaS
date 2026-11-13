import { describe, expect, it } from 'vitest'
import { calculateDiscount } from './discount'
import { expandAttributes, optionPrice } from './productOptions'
describe('cart discount', () => {
 it('calculates percent discounts in integer VND with exact rounding', () => {
  expect(calculateDiscount(35000,'10','percent')).toBe(3500)
  expect(calculateDiscount(10001,'12,50','percent')).toBe(1250)
  expect(calculateDiscount(101,'50','percent')).toBe(51)
  expect(calculateDiscount(Number.MAX_SAFE_INTEGER,'100','percent')).toBe(Number.MAX_SAFE_INTEGER)
 })
 it('validates fixed discounts and already recorded payments', () => {
  expect(calculateDiscount(35000,'5000','vnd')).toBe(5000)
  expect(() => calculateDiscount(100,'101','percent')).toThrow()
  expect(() => calculateDiscount(100,'-1','vnd')).toThrow()
  expect(() => calculateDiscount(100,'1.5','vnd')).toThrow()
  expect(() => calculateDiscount(100,'101','vnd')).toThrow()
  expect(() => calculateDiscount(100,'50','vnd',80)).toThrow()
  expect(calculateDiscount(100,'20','vnd',80)).toBe(20)
 })
})
describe('attribute pricing', () => {
 it('preserves legacy prices while splitting values into individual choices', () => {
  expect(expandAttributes([{name:'Size',value:'M, L',price_delta_vnd:5000}])).toEqual([{name:'Size',value:'M',price_delta_vnd:5000},{name:'Size',value:'L',price_delta_vnd:5000}])
  expect(optionPrice({price:35000},{name:'Size',value:'L',price_delta_vnd:5000})).toBe(40000)
  expect(optionPrice({price:35000},{name:'Size',value:'M'})).toBe(35000)
 })
})
