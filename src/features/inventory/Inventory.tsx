import { formatStockQuantity } from '../../utils/productUnits'
import { useStocktakeRecords } from '../../api/useStocktakeRecords'
import { quantityDifference } from '../../api/inventory'
import { useInventoryRecords, type InventoryProduct } from '../../api/useInventoryRecords'
import { useSessionDisplay } from '../../api/sessionDisplay'
import { ProductDetails } from '../../components/products/ProductDetails'
import { useNavigate } from 'react-router-dom'
import { apiConfig } from '../../api/config'
import { useSessionStore } from '../../api/auth'
import { inventoryEditorRow, saveInventoryEditorRow } from '../../api/localInventory'
import { errorMessage } from '../../api/recordAdapter'
import { ProductEditor } from '../management/ManagementRecordPage'
import type { ManagementRow } from '../management/moduleConfig'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ClipboardCheck, Download, MoreHorizontal, PackagePlus, Plus, Search, SlidersHorizontal, X } from 'lucide-react'
import { formatCurrency, inventorySummary, products } from '../../services/mockData'
import { ProductArtwork } from '../../components/ProductArtwork'
import type { Product } from '../../types'


type InventoryProps = { stockCheck?: boolean }

export function Inventory({ stockCheck = false }: InventoryProps) {
  const session = useSessionStore((state) => state.session)
  return <InventoryWorkspace key={`${session?.tenant_id}:${session?.store_id}:${session?.user.id}:${session?.user.role}`} stockCheck={stockCheck} />
}

function InventoryWorkspace({ stockCheck }: { stockCheck: boolean }) {
  const navigate = useNavigate()
  const role = useSessionStore((state) => state.session?.user.role)
  const canCreate = apiConfig.useMock || role === 'owner' || role === 'manager'
  const createProduct = () => navigate('/management/menu-items', { state: { createProduct: true } })
  const catalog = useMemo<InventoryProduct[]>(() => {
    if (!apiConfig.useMock) return []
    try {
      const saved: unknown = JSON.parse(localStorage.getItem('fnb-management:menu-items') ?? 'null')
      if (Array.isArray(saved)) return saved.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && item.productType === 'Hàng hóa thường').map((item, index) => ({ id: String(item.code ?? index), sku: String(item.code ?? `M${index}`), name: String(item.name ?? 'Hàng hóa'), category: String(item.category ?? 'Khác'), price: Number(item.price ?? 0), stock: Number(item.stock ?? 0), minimum: Number(item.minimum ?? 0), color: '#e8edf5', image: String(item.image ?? ''), details: {code:String(item.code ?? index),name:String(item.name ?? 'Hàng hóa'),productType:'Hàng hóa thường',menuType:String(item.menuType ?? 'Khác'),price:Number(item.price ?? 0),cost:item.cost == null ? '' : Number(item.cost),stock:Number(item.stock ?? 0),baseUnit:String(item.baseUnit ?? 'Cái'),visible:item.visible !== false,extra:item.extra === true,points:item.points !== false,attributes:typeof item.attributes === 'string' ? item.attributes : JSON.stringify(item.attributes ?? []),units:typeof item.units === 'string' ? item.units : JSON.stringify(item.units ?? [])} }))
    } catch { /* use bundled inventory data */ }
    return products.filter((product) => ['retail-01'].includes(product.id))
  }, [stockCheck])
  const [rows, setRows] = useState(stockCheck ? [] : catalog)
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Tất cả danh mục')
  const [page, setPage] = useState(1)
  const display = useSessionDisplay()
  const remote = useInventoryRecords(!stockCheck, page, search, category)
  const [stockFilter, setStockFilter] = useState('Tất cả trạng thái')
  const [dialog, setDialog] = useState<'receive' | 'adjust' | null>(null)
  const [selected, setSelected] = useState<Product | null>(null)
  const [quantity, setQuantity] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<{ product: InventoryProduct; initial: ManagementRow } | null>(null)
  const [editFailure, setEditFailure] = useState('')
  const openEditor = async (product: InventoryProduct) => {
    setEditFailure('')
    try { const initial = remote.remote ? await remote.open(product.id) : inventoryEditorRow(product, product.details); setEditing({ product, initial }) }
    catch (error) { setEditFailure(errorMessage(error)) }
  }
  const saveProductDetails = async (values: ManagementRow) => {
    if (!editing || (remote.remote && remote.pending)) return
    try {
      if (remote.remote) {
        await remote.save(editing.initial, values)
        setEditing(null); setExpandedProduct(null); setNotice('Đã cập nhật sản phẩm.'); window.setTimeout(() => setNotice(''), 2800); return
      }
      const record = saveInventoryEditorRow(editing.initial, values)
      setRows((current) => current.flatMap((product) => product.id !== editing.product.id ? [product] : record.productType !== 'Hàng hóa thường' ? [] : [{ ...product, id: String(record.code), sku: String(record.code), name: String(record.name), category: String(record.category), price: Number(record.price), stock: Number(record.stock ?? 0), image: String(record.image ?? ''), details: record }]))
      setEditing(null); setExpandedProduct(null)
      setNotice('Đã cập nhật sản phẩm trong dữ liệu demo.')
      window.setTimeout(() => setNotice(''), 2800)
    } catch (error) { setEditFailure(errorMessage(error)) }
  }

  const localFiltered = useMemo(() => rows.filter((product) => {
    const matchesSearch = `${product.name} ${product.sku}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))
    const matchesCategory = category === 'Tất cả danh mục' || product.category === category
    const matchesStock = stockFilter === 'Tất cả trạng thái' || (stockFilter === 'Sắp hết' ? product.stock <= product.minimum : product.stock > product.minimum)
    return matchesSearch && matchesCategory && matchesStock
  }), [rows, search, category, stockFilter])

  const filtered = remote.remote ? remote.rows : localFiltered
  useEffect(() => { setPage(1) }, [search, category])
  useEffect(() => { if (remote.remote && !remote.loading && !remote.error && page > remote.pages) setPage(remote.pages) }, [remote.remote, remote.loading, remote.error, remote.pages, page])
  const receiveStock = () => { if (remote.remote) { navigate('/management/purchases'); return }; setDialog('receive'); setSelected(rows[0] ?? null) }

  const saveStockAction = () => {
    if (remote.remote) return
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

  if (stockCheck) return <StockCheckWorkspace catalog={catalog} />

  const exportCsv = async () => {
    let exportProducts = filtered
    if (remote.remote) { try { exportProducts = await remote.exportRows() } catch (error) { setEditFailure(errorMessage(error)); return } }
    const rowsToExport = [
      ['Sản phẩm', 'SKU', 'Danh mục', 'Chi nhánh', 'Tồn hiện tại', 'Định mức tối thiểu'],
      ...exportProducts.map((product) => [product.name, product.sku, product.category, remote.remote ? display.branch : 'Mộc Store', remote.remote ? product.quantity ?? '' : String(product.stock), remote.remote ? '' : String(product.minimum)]),
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
    <div className="inventory-page" data-source={remote.remote ? 'api' : undefined}>
      <div className="page-title-row">
        <div><h1>{stockCheck ? 'Kiểm kho' : 'Quản lý hàng hóa'}</h1><p>{stockCheck ? 'Theo dõi và điều chỉnh số lượng tồn tại cửa hàng' : 'Theo dõi số lượng và tình trạng hàng hóa tại cửa hàng'}</p></div>
        <div className="page-actions"><button className="button button-secondary" type="button" onClick={exportCsv}><Download size={16} /> Xuất file</button><button className="button button-primary" type="button" disabled={!canCreate} onClick={createProduct}><Plus size={16} /> Tạo mới sản phẩm</button><button className="button button-primary" type="button" disabled={remote.remote && !remote.canManage} onClick={receiveStock}><PackagePlus size={16} /> Nhập kho</button></div>
      </div>

      <section className="inventory-metrics">
        <article className="inventory-metric"><span>Tổng SKU</span><strong>{remote.remote ? remote.skuCount ?? '—' : inventorySummary.skuCount}</strong><small>Đang kinh doanh</small></article>
        <article className="inventory-metric"><span>Tồn kho thực tế</span><strong>{remote.remote ? formatStockQuantity(remote.stockQuantity) : stockUnits} <em>đơn vị</em></strong><small>Trên 1 chi nhánh</small></article>
        <article className="inventory-metric"><span>Giá trị tồn kho</span><strong>{remote.remote ? remote.retailValue ? `${new Intl.NumberFormat('vi-VN').format(BigInt(remote.retailValue))} ₫` : '—' : formatCurrency(inventorySummary.inventoryValue)}</strong><small>Theo giá bán lẻ</small></article>
        <article className="inventory-metric inventory-metric-mobile"><span>Sắp hết</span><strong>{remote.remote ? '—' : inventorySummary.lowStockCount}</strong></article>
      </section>
      <div className="inventory-mobile-actions"><button className="button button-primary" type="button" disabled={remote.remote && !remote.canManage} onClick={receiveStock}><PackagePlus size={15} /> Nhập kho</button><button className="button button-secondary" type="button" disabled={remote.remote && !remote.canManage} onClick={() => { if(remote.remote){navigate('/management/stock-check');return};setDialog('adjust'); setSelected(rows[0] ?? null) }}><ClipboardCheck size={15} /> Điều chỉnh tồn</button><button className="button button-primary" type="button" disabled={!canCreate} onClick={createProduct}><Plus size={15} /> Tạo mới sản phẩm</button></div>

      {remote.remote && (remote.loading || remote.pending || remote.error || (!editing && editFailure)) && <div className="empty-state" role={remote.error || editFailure ? 'alert' : 'status'}><strong>{remote.error || editFailure || 'Đang tải dữ liệu...'}</strong>{(remote.error || editFailure) && <button className="button button-secondary" type="button" onClick={() => { setEditFailure(''); void remote.retry() }}>Thử lại</button>}</div>}
      <section className="panel inventory-list-panel">
        <div className="inventory-toolbar">
          <label className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên, SKU, barcode..." /><kbd>⌘ K</kbd></label>
          <div className="filter-actions">
            <label className="select-field"><select value={category} onChange={(event) => setCategory(event.target.value)}><option>Tất cả danh mục</option>{remote.remote ? remote.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>) : ['Cà phê', 'Trà', 'Bánh', 'Retail SKU'].map((value) => <option key={value}>{value}</option>)}</select><ChevronDown size={14} /></label>
            <label className="select-field"><select disabled={remote.remote} title={remote.remote ? 'Chưa có dữ liệu tồn kho đầy đủ.' : undefined} value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}><option>Tất cả trạng thái</option><option>Sắp hết</option><option>Còn hàng</option></select><ChevronDown size={14} /></label>
            <button className="icon-button filter-button" type="button" aria-label="Xóa bộ lọc" title="Xóa bộ lọc" onClick={() => { setCategory('Tất cả danh mục'); setStockFilter('Tất cả trạng thái') }}><SlidersHorizontal size={17} /></button>
          </div>
        </div>
        <div className="table-scroll"><table className="data-table inventory-table"><thead><tr><th>Sản phẩm / SKU</th><th>Danh mục</th><th>Chi nhánh</th><th>Hiện tại</th><th>Định mức tối thiểu</th><th>Trạng thái</th><th aria-label="Thao tác" /></tr></thead><tbody>{filtered.map((product) => <Fragment key={product.id}><tr className="record-expandable-row" tabIndex={0} aria-expanded={expandedProduct === product.id} onClick={() => setExpandedProduct((current) => current === product.id ? null : product.id)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setExpandedProduct((current) => current === product.id ? null : product.id) } }}>
          <td><div className="product-cell"><ProductArtwork product={product} compact /><span><strong>{product.name}</strong><small>{product.sku}</small></span></div></td>
          <td className="inventory-category">{remote.remote ? product.category : product.category === 'Retail SKU' ? 'Thành phẩm' : 'Nguyên liệu'}</td><td className="inventory-branch">{remote.remote ? display.branch : 'Mộc Store'}</td><td data-label="Hiện tại"><strong className="stock-number">{remote.remote ? formatStockQuantity(product.quantity) : product.stock} {remote.remote ? product.baseUnit : product.id === 'tea-01' ? 'l' : product.id === 'retail-01' ? 'cái' : 'kg'}</strong></td><td data-label="Định mức tối thiểu">{remote.remote ? '—' : product.minimum} {remote.remote ? product.baseUnit : product.id === 'retail-01' ? 'cái' : 'kg'}</td><td data-label="Trạng thái"><span className={`status-badge ${remote.remote ? '' : product.stock <= product.minimum ? 'low' : 'in-stock'}`}><i />{remote.remote ? '—' : product.stock <= product.minimum ? 'Sắp hết' : 'Đang tốt'}</span></td><td className="inventory-actions"><button className="row-menu" type="button" aria-label={`Thao tác ${product.name}`} disabled={remote.remote && (!remote.canManage || remote.pending || remote.loading)} onClick={(event) => { event.stopPropagation(); openEditor(product) }}><MoreHorizontal size={18} /></button></td>
        </tr>{expandedProduct === product.id && <tr className="record-detail-row"><td colSpan={7}><div className="record-detail-content product-detail-grid"><ProductDetails unitSelectable product={{...product.details,code:product.sku,name:product.name,productType:'Hàng hóa thường',price:product.price,stock:remote.remote ? formatStockQuantity(product.quantity) : product.stock}} /></div></td></tr>}</Fragment>)}</tbody></table></div>
        {filtered.length === 0 && !remote.loading && !remote.error && <div className="empty-state"><Search size={24} /><strong>Không tìm thấy sản phẩm</strong><span>Thử thay đổi từ khóa hoặc bộ lọc.</span></div>}
        <div className="table-footer" ref={remote.footerRef}><span>Hiển thị <strong>{filtered.length ? remote.remote && !remote.mobile ? (page - 1) * 6 + 1 : 1 : 0}–{remote.remote && !remote.mobile ? (page - 1) * 6 + filtered.length : filtered.length}</strong> trong <strong>{remote.remote ? remote.total : filtered.length}</strong> sản phẩm</span><div className="pagination"><button type="button" aria-label="Trang trước" disabled={!remote.remote || remote.loading || page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={16} /></button><button className="current-page" type="button">{remote.remote ? page : 1}</button><button type="button" aria-label="Trang sau" disabled={!remote.remote || remote.loading || page >= remote.pages} onClick={() => setPage((value) => value + 1)}><ChevronRight size={16} /></button></div></div>
      </section>

      {notice && <div className="toast"><span className="toast-check">✓</span>{notice}</div>}
      {editing && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !remote.pending) setEditing(null) }}><section className="modal-card record-dialog" role="dialog" aria-modal="true" aria-labelledby="inventory-product-editor-title"><button className="modal-close" type="button" disabled={remote.pending} onClick={() => setEditing(null)} aria-label="Đóng"><X size={18} /></button><h2 id="inventory-product-editor-title">Cập nhật sản phẩm</h2><p>{remote.remote ? 'Thông tin được lưu trên hệ thống cửa hàng.' : 'Thông tin được lưu trong dữ liệu demo trên thiết bị.'}</p>{editFailure && <p className="form-error" role="alert">{editFailure}</p>}<ProductEditor remote={remote.remote} categoryOptions={remote.categories.map((item) => item.name)} saving={remote.pending} onCreateCategory={remote.remote ? remote.createCategory : undefined} initial={editing.initial} nextProductCode={String(editing.initial.code)} onCancel={() => { if (!remote.pending) setEditing(null) }} onSave={saveProductDetails} /></section></div>}
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

type StockCheckLine = { product: InventoryProduct; counted: number | string }
type StockCheckRecord = { code: string; date: string; branch: string; creator: string; note: string; lines: { name: string; sku: string; system: number | string; counted: number | string }[] }

function StockCheckWorkspace({ catalog }: { catalog: InventoryProduct[] }) {
  const [creating, setCreating] = useState(false)
  const sessionDisplay = useSessionDisplay()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Tất cả nhóm hàng')
  const [showAll, setShowAll] = useState(false)
  const [lines, setLines] = useState<StockCheckLine[]>([])
  const [note, setNote] = useState('')
  const [branch, setBranch] = useState('Mộc Store · Quận 1')
  const [history, setHistory] = useState<StockCheckRecord[]>(() => {
    if (!apiConfig.useMock) return []
    try { const saved: unknown = JSON.parse(localStorage.getItem('fnb-management:stock-checks') ?? '[]'); return Array.isArray(saved) ? saved as StockCheckRecord[] : [] } catch { return [] }
  })
  const [expanded, setExpanded] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const remote = useStocktakeRecords(search, category, showAll, creating)
  const records: StockCheckRecord[] = remote.remote ? remote.history.map((r) => ({code:r.code,date:new Intl.DateTimeFormat('vi-VN').format(new Date(r.created_at)),branch:r.branch,creator:r.creator,note:r.note,lines:r.items.map((l)=>({name:l.name,sku:l.sku,system:formatStockQuantity(l.system_quantity),counted:formatStockQuantity(l.counted_quantity)}))})) : history
  const categories = [...new Set(catalog.map((product) => product.category))]
  const results = (remote.remote ? remote.rows : catalog).filter((product) => `${product.name} ${product.sku}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')) && (remote.remote || category === 'Tất cả nhóm hàng' || product.category === category) && !lines.some((line) => line.product.id === product.id))
  const code = remote.remote ? '—' : `KK${String(history.length + 1).padStart(6, '0')}`
  const addLine = (product: InventoryProduct) => setLines((current) => [...current, { product, counted: remote.remote ? product.quantity === undefined ? '' : formatStockQuantity(product.quantity) : product.stock }])
  const save = async () => {
    if (!lines.length || remote.saving) return
    if(remote.remote){
     const ok=await remote.save(lines.map(({product,counted})=>({product_id:product.id,counted_quantity:String(counted),balance_version:product.balanceVersion ?? 0})),note)
     if(ok){setCreating(false);setLines([]);setNote('');setNotice('Đã lưu phiếu kiểm kho.');window.setTimeout(()=>setNotice(''),2800)}
     return
    }
    const record: StockCheckRecord = { code, date: new Intl.DateTimeFormat('vi-VN').format(new Date()), branch, creator: 'Thu ngân A', note, lines: lines.map(({ product, counted }) => ({ name: product.name, sku: product.sku, system: product.stock, counted:Number(counted) })) }
    const next = [record, ...history]
    setHistory(next)
    localStorage.setItem('fnb-management:stock-checks', JSON.stringify(next))
    setCreating(false); setLines([]); setNote(''); setNotice(`Đã lưu phiếu ${code}.`); window.setTimeout(() => setNotice(''), 2800)
  }
  return <div className="inventory-page stock-voucher-page">
    <div className="page-title-row"><div><div className="record-breadcrumb">Hàng hóa <span>/</span> Kiểm kho</div><h1>Phiếu kiểm kho</h1><p>Theo dõi số lượng thực tế theo từng phiếu kiểm kho.</p></div><button className="button button-primary" type="button" disabled={remote.remote && (!remote.canManage || remote.saving)} onClick={() => { setLines([]); setSearch(''); setShowAll(false); setCreating(true) }}><Plus size={16} /> Phiếu kiểm kho mới</button></div>
    {remote.remote && (remote.error || remote.loading) && <div className="empty-state" role={remote.error ? 'alert' : 'status'}><strong>{remote.error || 'Đang tải dữ liệu...'}</strong>{remote.error && <button className="button button-secondary" type="button" onClick={remote.retry}>Thử lại</button>}</div>}
    {!creating ? <section className="panel record-table-panel"><div className="table-scroll"><table className="data-table record-table"><thead><tr><th>Mã phiếu</th><th>Ngày kiểm</th><th>Chi nhánh</th><th>Số mặt hàng</th><th>Người tạo</th><th>Ghi chú</th></tr></thead><tbody>{records.map((record,index) => <Fragment key={record.code}><tr ref={remote.remote && index === records.length-1 ? remote.lastHistory : undefined} key={record.code} className="record-expandable-row" onClick={() => setExpanded((current) => current === record.code ? null : record.code)}><td>{record.code}</td><td>{record.date}</td><td>{record.branch}</td><td>{record.lines.length}</td><td>{record.creator}</td><td>{record.note || '—'}</td></tr>{expanded === record.code && <tr key={`${record.code}-detail`} className="record-detail-row"><td colSpan={6}><div className="record-detail-content">{record.lines.map((line) => <span key={line.sku}>{line.name} · Tồn hệ thống {line.system} / Thực tế {line.counted}</span>)}</div></td></tr>}</Fragment>)}</tbody></table></div>{!records.length && !remote.loading && !remote.error && <div className="empty-state"><ClipboardCheck size={24} /><strong>Chưa có phiếu kiểm kho</strong><span>Tạo phiếu mới để ghi nhận số lượng thực tế.</span></div>}</section> : <>
      <section className="panel stock-voucher-meta"><label className="form-label">Mã phiếu<input value={code} readOnly /></label><label className="form-label">Ngày kiểm<input value={new Intl.DateTimeFormat('vi-VN').format(new Date())} readOnly /></label><label className="form-label">Chi nhánh<select disabled={remote.remote} value={remote.remote ? sessionDisplay.branch : branch} onChange={(event) => setBranch(event.target.value)}>{remote.remote ? <option>{sessionDisplay.branch}</option> : <><option>Mộc Store · Quận 1</option><option>Mộc Store · Quận 3</option></>}</select></label><label className="form-label">Người tạo<input value={remote.remote ? sessionDisplay.name : "Thu ngân A"} readOnly /></label><label className="form-label">Ghi chú<input disabled={remote.saving} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ghi chú phiếu kiểm kho" /></label></section>
      <section className="panel inventory-list-panel"><div className="inventory-toolbar"><label className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm tên hàng hoặc mã hàng..." /></label><div className="filter-actions"><label className="select-field"><select value={category} onChange={(event) => setCategory(event.target.value)}><option>Tất cả nhóm hàng</option>{remote.remote ? remote.categories.map((item)=><option key={item.id} value={item.id}>{item.name}</option>) : categories.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={14} /></label><button className="button button-secondary" type="button" onClick={() => setShowAll((value) => !value)}>{showAll ? 'Ẩn kết quả' : 'Hiển thị tất cả'}</button></div></div>
        {(search || showAll) && <div className="voucher-search-results">{results.map((product,index) => <button ref={remote.remote && index===results.length-1 ? remote.lastResult : undefined} disabled={remote.saving} type="button" key={product.id} onClick={() => addLine(product)}><ProductArtwork product={product} compact /><span><strong>{product.name}</strong><small>{product.sku} · Tồn hệ thống {remote.remote ? formatStockQuantity(product.quantity) : product.stock}</small></span><Plus size={16} /></button>)}</div>}
        {lines.length ? <div className="table-scroll"><table className="data-table inventory-table"><thead><tr><th>Sản phẩm</th><th>Tồn hệ thống</th><th>Số lượng thực tế</th><th>Chênh lệch</th><th /></tr></thead><tbody>{lines.map(({ product, counted }) => <tr key={product.id}><td><strong>{product.name}</strong><small>{product.sku}</small></td><td>{remote.remote ? formatStockQuantity(product.quantity) : product.stock}</td><td><input disabled={remote.saving} className="voucher-quantity" type="number" min="0" step={remote.remote ? "0.000001" : undefined} value={counted} onChange={(event) => setLines((current) => current.map((line) => line.product.id === product.id ? { ...line, counted: remote.remote ? event.target.value : Number(event.target.value) } : line))} /></td><td>{remote.remote ? (()=>{try{return product.quantity === undefined ? '—' : quantityDifference(String(counted),product.quantity)}catch{return '—'}})() : `${Number(counted) - product.stock > 0 ? '+' : ''}${Number(counted)-product.stock}`}</td><td><button disabled={remote.saving} className="record-delete" type="button" aria-label={`Xóa ${product.name}`} onClick={() => setLines((current) => current.filter((line) => line.product.id !== product.id))}><X size={15} /></button></td></tr>)}</tbody></table></div> : <div className="empty-state"><ClipboardCheck size={24} /><strong>Phiếu kiểm kho chưa có sản phẩm</strong><span>Tìm hàng hoặc chọn “Hiển thị tất cả” để thêm sản phẩm.</span></div>}</section>
      <div className="stock-voucher-actions"><button className="button button-secondary" type="button" disabled={remote.saving} onClick={() => setCreating(false)}>Hủy</button><button className="button button-primary" type="button" disabled={!lines.length || remote.saving} onClick={save}>Lưu phiếu kiểm kho</button></div>
    </>}{notice && <div className="toast" role="status">{notice}</div>}
  </div>
}
