import { expect, it } from 'vitest'
import { convertedPurchaseQuantity, purchaseUnitOptions, purchaseItemsSignature, purchaseLineInput, type PurchaseLine } from './purchaseUnits'
const product={id:'00000000-0000-4000-8000-000000000001',name:'Bia',sku:'M00001',base_unit:'Lon',cost_vnd:12000,units:[{name:'Thùng',ratio:'24.000',price_vnd:480000,cost_vnd:300000,is_visible:false}]}
it('lists hidden menu units for purchasing and keeps exact decimal conversions',()=>{
 expect(purchaseUnitOptions(product).map((u)=>u.name)).toEqual(['Lon','Thùng'])
 expect(convertedPurchaseQuantity(2,'24.000')).toBe('48')
 expect(convertedPurchaseQuantity(3,'0.125')).toBe('0.375')
 expect(convertedPurchaseQuantity(1000000000,'999999999.999')).toBe('999999999999000000')
 expect(convertedPurchaseQuantity(1.5,'24')).toBe('—')
})
it('keeps a stable saved-payload comparison after an explicit unit selection',()=>{
 const line:PurchaseLine={product,unit:'Thùng',baseUnit:'Lon',ratio:'24.000',quantity:2,cost:500000,refreshUnit:true}
 const input=purchaseLineInput(line)
 expect(input).toMatchObject({unit:'Thùng',expected_unit_ratio:'24',expected_base_unit:'Lon',refresh_unit:true,cost_vnd:500000})
 expect(purchaseItemsSignature([input])).toBe(purchaseItemsSignature([purchaseLineInput({...line,refreshUnit:false})]))
 expect(purchaseItemsSignature([input])).not.toBe(purchaseItemsSignature([purchaseLineInput({...line,ratio:'20'})]))
})
