import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProductDetails } from './ProductDetails'
describe('product details', () => {
 it('does not turn an unset unit cost into zero', () => {
  const text=renderToStaticMarkup(<ProductDetails product={{name:'Goods',productType:'Hàng hóa thường',units:JSON.stringify([{name:'Thùng',ratio:24,price:24000,cost:0,_costWasUnset:true}])}}/>).replace(/<[^>]+>/g,'')
  expect(text).toContain('Giá vốn: —')
 })
 it('shows the effective price of each individual attribute', () => {
  const text=renderToStaticMarkup(<ProductDetails product={{name:'Goods',price:35000,attributes:JSON.stringify([{name:'Size',value:'L',price_delta_vnd:5000}])}}/>).replace(/<[^>]+>/g,'')
  expect(text).toContain('Size: L')
  expect(text).toContain('40.000')
 })
})
