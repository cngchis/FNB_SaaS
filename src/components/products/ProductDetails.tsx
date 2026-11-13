import type { ManagementRow } from '../../features/management/moduleConfig'
import { formatCurrency } from '../../services/mockData'
import { expandAttributes, type ProductAttribute } from '../../utils/productOptions'

function rows<T>(value: unknown): T[] {
  try { const data: unknown = typeof value === 'string' ? JSON.parse(value) : value; return Array.isArray(data) ? data as T[] : [] } catch { return [] }
}
const money = (value: unknown) => value === '' || value == null || !Number.isFinite(Number(value)) ? '—' : formatCurrency(Number(value))
export function ProductDetails({ product }: { product: ManagementRow }) {
  const prepared = product.productType === 'Chế biến'
  const attributes = expandAttributes(rows<ProductAttribute>(product.attributes))
  const units = rows<{name:string;ratio:number;price?:number;cost?:number;_costWasUnset?:boolean}>(product.units)
  return <>
    <strong className="record-detail-title">{String(product.name ?? '')}</strong>
    <span className="menu-detail-field"><small>Mã hàng</small><b>{String(product.code ?? '—')}</b></span>
    <span className="menu-detail-field"><small>Loại hàng</small><b>{String(product.productType ?? '—')}</b></span>
    <span className="menu-detail-field"><small>Thực đơn</small><b>{String(product.menuType ?? '—')}</b></span>
    <span className="menu-detail-field"><small>Giá vốn</small><b>{prepared ? '—' : money(product.cost)}</b></span>
    <span className="menu-detail-field"><small>{prepared ? 'Tồn kho' : 'Số lượng tồn kho'}</small><b>{prepared ? 'Không quản lý' : String(product.stock ?? '—')}</b></span>
    <span className="menu-detail-field"><small>Hiển thị trong thực đơn</small><b>{product.visible == null ? '—' : product.visible ? 'Có' : 'Không'}</b></span>
    <span className="menu-detail-field"><small>Món thêm</small><b>{product.extra == null ? '—' : product.extra ? 'Có' : 'Không'}</b></span>
    <span className="menu-detail-field"><small>Tích điểm</small><b>{product.points == null ? '—' : product.points ? 'Có' : 'Không'}</b></span>
    {attributes.length > 0 && <section className="product-detail-options"><strong>Thuộc tính</strong>{attributes.map((attribute) => <div key={`${attribute.name}-${attribute.value}`}><span>{attribute.name}: {attribute.value}</span><b>{money(Number(product.price ?? 0)+(attribute.price_delta_vnd ?? 0))}</b><small>{(attribute.price_delta_vnd ?? 0) >= 0 ? '+' : ''}{money(attribute.price_delta_vnd ?? 0)}</small></div>)}</section>}
    {units.length > 0 && <section className="product-detail-options"><strong>Đơn vị tính</strong>{units.map((unit) => <div key={unit.name}><span>{unit.name} = {unit.ratio} {String(product.baseUnit ?? 'Cái')}</span><b>{money(unit.price)}</b><small>Giá vốn: {prepared || unit._costWasUnset ? '—' : money(unit.cost)}</small></div>)}</section>}
  </>
}
