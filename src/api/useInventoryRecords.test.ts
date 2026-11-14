import { expect, it } from 'vitest'
import { inventoryProduct } from './useInventoryRecords'
import type { ProductDTO } from './catalog'
it('keeps the real identity and unknown stock separate from artwork numeric fields', () => {
 const product: ProductDTO = { id:'00000000-0000-4000-8000-000000000001',sku:'M00003',name:'Bia',category_id:null,category_name:'Bia',product_type:'goods',menu_type:'other',base_unit:'Lon',price_vnd:22000,cost_vnd:null,tracks_stock:true,is_visible:true,is_extra:false,earns_points:true,availability:'available',image_url:null,attributes:[],units:[{name:'Thùng',ratio:'24',price_vnd:480000,cost_vnd:null,is_visible:false}] }
 const row=inventoryProduct(product)
 expect(row.id).toBe(product.id)
 expect(row.baseUnit).toBe('Lon')
 expect(row.details?.stock).toBe('—')
 expect(row.details?.cost).toBe('')
 expect(JSON.parse(String(row.details?.units))[0]).toMatchObject({visible:false,_costWasUnset:true})
})
