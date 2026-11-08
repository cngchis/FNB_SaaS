import { useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ClipboardCheck, Download, MoreHorizontal, PackagePlus, Search, SlidersHorizontal, X } from 'lucide-react'
import { formatCurrency, inventorySummary, products } from '../../services/mockData'
import { ProductArtwork } from '../../components/ProductArtwork'
import type { Product } from '../../types'

type InventoryProps = { stockCheck?: boolean }

export function Inventory({ stockCheck = false }: InventoryProps) {
  const [rows, setRows] = useState(products)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Tất cả danh mục')
  const [stockFilter, setStockFilter] = useState('Tất cả trạng thái')
  const [dialog, setDialog] = useState<'receive' | 'adjust' | null>(null)
  const [selected, setSelected] = useState<Product | null>(null)
  const [quantity, setQuantity] = useState('')
  const [notice, setNotice] = useState('')

  const filtered = useMemo(() => rows.filter((product) => {
    const matchesSearch = `${product.name} ${product.sku}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))
    const matchesCategory = category === 'Tất cả danh mục' || product.category === category
    const matchesStock = stockFilter === 'Tất cả trạng thái' || (stockFilter === 'Sắp hết' ? product.stock <= product.minimum : product.stock > product.minimum)
    return matchesSearch && matchesCategory && matchesStock
  }), [rows, search, category, stockFilter])

  const saveStockAction = () => {
    const amount = Number(quantity)
    if (!selected || !Number.isFinite(amount) || amount <= 0) return
    setRows((current) => current.map((product) => product.id === selected.id ? { ...product, stock: dialog === 'receive' ? product.stock + amount : amount } : product))
    setDialog(null)
    setQuantity('')
    setSelected(null)
    setNotice(dialog === 'receive' ? 'Đã ghi nhận phiếu nhập kho.' : 'Đã cập nhật số lượng tồn kho.')
    window.setTimeout(() => setNotice(''), 2800)
  }

  const stockUnits = rows.reduce((total, product) => total + product.stock, 0)

  const exportCsv = () => {
    const rowsToExport = [
      ['Sản phẩm', 'SKU', 'Danh mục', 'Chi nhánh', 'Tồn hiện tại', 'Định mức tối thiểu'],
      ...filtered.map((product) => [product.name, product.sku, product.category, 'Mộc Store', String(product.stock), String(product.minimum)]),
    ]
    const csv = rowsToExport.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'moc-store-inventory.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="inventory-page">
      <div className="page-title-row">
        <div><h1>{stockCheck ? 'Kiểm kho' : 'Quản lý hàng hóa'}</h1><p>{stockCheck ? 'Theo dõi và điều chỉnh số lượng tồn tại cửa hàng' : 'Theo dõi số lượng và tình trạng hàng hóa tại cửa hàng'}</p></div>
        <div className="page-actions"><button className="button button-secondary" type="button" onClick={exportCsv}><Download size={16} /> Xuất file</button><button className="button button-primary" type="button" onClick={() => { setDialog('receive'); setSelected(rows[0] ?? null) }}><PackagePlus size={16} /> Nhập kho</button></div>
      </div>

      <section className="inventory-metrics">
        <article className="inventory-metric"><span>Tổng SKU</span><strong>{inventorySummary.skuCount}</strong><small>Đang kinh doanh</small></article>
        <article className="inventory-metric"><span>Tồn kho thực tế</span><strong>{stockUnits} <em>đơn vị</em></strong><small>Trên 1 chi nhánh</small></article>
        <article className="inventory-metric"><span>Giá trị tồn kho</span><strong>{formatCurrency(inventorySummary.inventoryValue)}</strong><small>Theo giá bán lẻ</small></article>
        <article className="inventory-metric inventory-metric-mobile"><span>Sắp hết</span><strong>{inventorySummary.lowStockCount}</strong></article>
      </section>
      <div className="inventory-mobile-actions"><button className="button button-primary" type="button" onClick={() => { setDialog('receive'); setSelected(rows[0] ?? null) }}><PackagePlus size={15} /> Nhập kho</button><button className="button button-secondary" type="button" onClick={() => { setDialog('adjust'); setSelected(rows[0] ?? null) }}><ClipboardCheck size={15} /> Điều chỉnh tồn</button></div>

      <section className="panel inventory-list-panel">
        <div className="inventory-toolbar">
          <label className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên, SKU, barcode..." /><kbd>⌘ K</kbd></label>
          <div className="filter-actions">
            <label className="select-field"><select value={category} onChange={(event) => setCategory(event.target.value)}><option>Tất cả danh mục</option>{['Cà phê', 'Trà', 'Bánh', 'Retail SKU'].map((value) => <option key={value}>{value}</option>)}</select><ChevronDown size={14} /></label>
            <label className="select-field"><select value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}><option>Tất cả trạng thái</option><option>Sắp hết</option><option>Còn hàng</option></select><ChevronDown size={14} /></label>
            <button className="icon-button filter-button" type="button" aria-label="Xóa bộ lọc" title="Xóa bộ lọc" onClick={() => { setCategory('Tất cả danh mục'); setStockFilter('Tất cả trạng thái') }}><SlidersHorizontal size={17} /></button>
          </div>
        </div>
        <div className="table-scroll"><table className="data-table inventory-table"><thead><tr><th>Sản phẩm / SKU</th><th>Danh mục</th><th>Chi nhánh</th><th>Hiện tại</th><th>Định mức tối thiểu</th><th>Trạng thái</th><th aria-label="Thao tác" /></tr></thead><tbody>{filtered.map((product) => <tr key={product.id}>
          <td><div className="product-cell"><ProductArtwork product={product} compact /><span><strong>{product.name}</strong><small>{product.sku}</small></span></div></td>
          <td className="inventory-category">{product.category === 'Retail SKU' ? 'Thành phẩm' : 'Nguyên liệu'}</td><td className="inventory-branch">Mộc Store</td><td data-label="Hiện tại"><strong className="stock-number">{product.stock} {product.id === 'tea-01' ? 'l' : product.id === 'retail-01' ? 'cái' : 'kg'}</strong></td><td data-label="Định mức tối thiểu">{product.minimum} {product.id === 'retail-01' ? 'cái' : 'kg'}</td><td data-label="Trạng thái"><span className={`status-badge ${product.stock <= product.minimum ? 'low' : 'in-stock'}`}><i />{product.stock <= product.minimum ? 'Sắp hết' : 'Đang tốt'}</span></td><td className="inventory-actions"><button className="row-menu" type="button" aria-label={`Thao tác ${product.name}`} onClick={() => { setSelected(product); setDialog('adjust') }}><MoreHorizontal size={18} /></button></td>
        </tr>)}</tbody></table></div>
        {filtered.length === 0 && <div className="empty-state"><Search size={24} /><strong>Không tìm thấy sản phẩm</strong><span>Thử thay đổi từ khóa hoặc bộ lọc.</span></div>}
        <div className="table-footer"><span>Hiển thị <strong>{filtered.length ? 1 : 0}–{filtered.length}</strong> trong <strong>{filtered.length}</strong> sản phẩm</span><div className="pagination"><button type="button" aria-label="Trang trước" disabled><ChevronLeft size={16} /></button><button className="current-page" type="button">1</button><button type="button" aria-label="Trang sau" disabled><ChevronRight size={16} /></button></div></div>
      </section>

      {notice && <div className="toast"><span className="toast-check">✓</span>{notice}</div>}
      {dialog && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null) }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="stock-dialog-title">
        <button className="modal-close" type="button" onClick={() => setDialog(null)} aria-label="Đóng"><X size={18} /></button>
        <span className="modal-icon"><PackagePlus size={19} /></span><h2 id="stock-dialog-title">{dialog === 'receive' ? 'Nhập hàng vào kho' : 'Điều chỉnh tồn kho'}</h2><p>{dialog === 'receive' ? 'Ghi nhận số lượng hàng mới cho sản phẩm.' : 'Cập nhật số lượng kiểm đếm thực tế.'}</p>
        <label className="form-label">Sản phẩm<select value={selected?.id ?? ''} onChange={(event) => setSelected(rows.find((row) => row.id === event.target.value) ?? null)}>{rows.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}</select></label>
        <label className="form-label">{dialog === 'receive' ? 'Số lượng nhập' : 'Tồn kho thực tế'}<input type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Nhập số lượng" /></label>
        {dialog === 'adjust' && selected && <span className="current-stock-note">Tồn kho hệ thống: {selected.stock}</span>}
        <div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => setDialog(null)}>Hủy</button><button className="button button-primary" type="button" disabled={!quantity || Number(quantity) <= 0} onClick={saveStockAction}>{dialog === 'receive' ? 'Xác nhận nhập' : 'Lưu điều chỉnh'}</button></div>
      </section></div>}
    </div>
  )
}
