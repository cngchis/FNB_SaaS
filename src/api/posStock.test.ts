import { expect, it } from 'vitest'
import { cartStockWarning, insufficientStockMessage } from './posStock'
import { productSchema } from './catalog'
import { orderSchema } from './pos'
import type { CartLine } from '../types'
const id = '00000000-0000-4000-8000-000000000001'
const product = productSchema.parse({ id,sku:'M00001',name:'Bia',category_id:null,category_name:null,product_type:'goods',menu_type:'other',base_unit:'Lon',price_vnd:10000,cost_vnd:null,tracks_stock:true,is_visible:true,is_extra:false,earns_points:true,availability:'available',image_url:null,attributes:[],units:[{name:'Thùng',ratio:'24',price_vnd:200000,cost_vnd:null}] })
const line = (quantity: number,unit = '',size?: string): CartLine => ({quantity,product:{id:unit+size,sourceId:id,name:'Bia',sku:'M00001',category:'',price:10000,stock:0,minimum:0,color:'',unitName:unit,selectedAttributes:size?[{name:'Size',value:size}]:[]}})
const stock = (quantity: string | null) => [{product_id:id,quantity,balance_version:1}]
it('warns only when total cart demand exceeds stock and clears when reduced',()=>{
 expect(cartStockWarning([line(2)],[product],stock('2'))).toBe('')
 expect(cartStockWarning([line(3)],[product],stock('2'))).toBe(insufficientStockMessage)
 expect(cartStockWarning([line(1,'','M'),line(2,'','L')],[product],stock('2'))).toBe(insufficientStockMessage)
 expect(cartStockWarning([line(1,'Thùng'),line(1)],[product],stock('24'))).toBe(insufficientStockMessage)
 expect(cartStockWarning([line(1,'Thùng'),line(1)],[product],stock('25'))).toBe('')
})
it('does not treat untracked goods or prepared items as zero-stock goods',()=>{
 expect(cartStockWarning([line(10)],[{...product,tracks_stock:false}],stock('0'))).toBe('')
 expect(cartStockWarning([line(10)],[{...product,product_type:'prepared',tracks_stock:false}],stock('0'))).toBe('')
 expect(cartStockWarning([line(1)],[product],stock(null))).toContain('tồn đầu kỳ')
 expect(cartStockWarning([line(1)],[product],[])).toBe('')
})
it('credits quantities already issued on a receivable and keeps the original unit ratio',()=>{
 const prior = orderSchema.parse({id,code:'DH1',room_id:null,room:'Mang về',customer_id:null,customer:'Khách lẻ',note:'',status:'pending_payment',version:2,subtotal_vnd:200000,discount_vnd:0,total_vnd:200000,paid_vnd:1000,invoice_code:'HD1',created_at:'',updated_at:'',items:[{product_id:id,name:'Bia',sku:'M00001',quantity:1,unit:'Thùng',attributes:[],price_vnd:200000,amount_vnd:200000,key:'pack',stock_tracked:true,stock_ratio:'24.000'}]})
 const changed = {...product,units:[{...product.units[0],ratio:'48'}]}
 expect(cartStockWarning([line(1,'Thùng')],[changed],stock('0'),prior)).toBe('')
 expect(cartStockWarning([line(2,'Thùng')],[changed],stock('23'),prior)).toBe(insufficientStockMessage)
 expect(cartStockWarning([line(2,'Thùng')],[changed],stock('24'),prior)).toBe('')
 expect(cartStockWarning([line(1,'Thùng')],[changed],stock('23'),{...prior,invoice_code:null})).toBe(insufficientStockMessage)
})
