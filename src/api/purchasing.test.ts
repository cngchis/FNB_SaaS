import { describe, expect, it } from 'vitest'
import { supplierInput, supplierRow, receiptInputSchema } from './purchasing'
const product='00000000-0000-4000-8000-000000000001'
const supplier='00000000-0000-4000-8000-000000000002'
describe('purchasing contracts', () => {
 it('does not send editable supplier debt to the server', () => {
  const input=supplierInput({name:'  Supplier ',debt:999999,__version:2})
  expect(input.name).toBe('Supplier')
  expect(input.version).toBe(2)
  expect(input).not.toHaveProperty('debt')
 })
 it('retains supplier identity and version for edits', () => {
  expect(supplierRow({id:supplier,code:'NCC000001',name:'Supplier',contact:'A',phone:'0900',address:'',note:'',version:3,debt_vnd:100})).toMatchObject({__id:supplier,__version:3,debt:100})
 })
 it('rejects fractional quantities, duplicate lines and unsafe totals exactly', () => {
  const base={supplier_id:supplier,note:'',version:0}
  expect(receiptInputSchema.safeParse({...base,items:[{product_id:product,quantity:2,cost_vnd:100}]}).success).toBe(true)
  expect(receiptInputSchema.safeParse({...base,items:[{product_id:product,quantity:1.5,cost_vnd:100}]}).success).toBe(false)
  expect(receiptInputSchema.safeParse({...base,items:[{product_id:product,quantity:2,cost_vnd:Number.MAX_SAFE_INTEGER}]}).success).toBe(false)
  expect(receiptInputSchema.safeParse({...base,items:[{product_id:product,quantity:1,cost_vnd:100},{product_id:product,quantity:1,cost_vnd:100}]}).success).toBe(false)
 })
})
