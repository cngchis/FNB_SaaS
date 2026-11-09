import { Fragment, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { ChevronLeft, ChevronRight, Download, PackagePlus, Pencil, Plus, Search, SlidersHorizontal, X } from 'lucide-react'
import { formatCurrency } from '../../services/mockData'
import { managementModules, type ManagementModule, type ManagementRow, type ManagementValue } from './moduleConfig'

const pageSize = 6
const storageKey = (moduleId: string) => `fnb-management:${moduleId}`

function loadRows(module: ManagementModule): ManagementRow[] {
  try {
    const saved = localStorage.getItem(storageKey(module.id))
    if (saved) return migrateRows(module.id, JSON.parse(saved) as ManagementRow[])
  } catch {
    return module.rows
  }
  return module.rows
}

function migrateRows(moduleId: string, rows: ManagementRow[]) {
  if (!Array.isArray(rows)) return []
  if (moduleId === 'menu-items') return rows.map((row, index) => {
    const currentCode = String(row.code ?? '')
    return { ...row,
      code: /^M\d{5}$/.test(currentCode) ? currentCode : `M${String(index + 1).padStart(5, '0')}`,
      productType: row.productType ?? (row.category === 'Retail SKU' ? 'Hàng hóa thường' : 'Chế biến'),
      menuType: row.menuType ?? (row.category === 'Bánh' || row.category === 'Đồ ăn' ? 'Đồ ăn' : 'Đồ uống'),
      visible: row.visible ?? true, extra: row.extra ?? false, points: row.points ?? true,
      image: row.image ?? '', attributes: row.attributes ?? '[]', units: row.units ?? '[]',
    }
  })
  if (moduleId === 'invoices') return rows.map((row) => {
    const oldCode = String(row.code ?? '')
    const code = oldCode.startsWith('MOC-') ? `HD${oldCode.slice(4).padStart(6, '0')}` : oldCode
    const amount = Number(row.amount ?? 0)
    return { ...row, code, table: row.table ?? 'Mang về', order: row.order ?? '', items: row.items ?? '', amount, discount: row.discount ?? 0, due: row.due ?? amount, paid: row.paid ?? (row.status === 'Đã thanh toán' ? amount : 0), date: row.date ?? '', branch: row.branch ?? 'Mộc Store · Quận 1', receiver: row.receiver ?? 'Thu ngân A', creator: row.creator ?? 'Thu ngân A' }
  })
  if (moduleId === 'cashbook') return rows.map((row) => {
    const oldType = String(row.type ?? '')
    const oldCode = String(row.code ?? '')
    const amountText = oldCode.match(/\d+/)?.[0] ?? '1'
    const code = oldCode.startsWith('PT-') ? `TTHD${amountText.padStart(6, '0')}` : oldCode.startsWith('PC-') ? `CCHD${amountText.padStart(6, '0')}` : oldCode
    return { ...row, code, status: row.status ?? 'Đã thanh toán', voucher: row.voucher ?? (oldType === 'Chi' ? 'Phiếu Chi' : 'Phiếu Thu'), category: row.category ?? row.note ?? '', payerGroup: row.payerGroup ?? (oldType === 'Thu' ? 'Khách hàng' : 'Nhà cung cấp'), payer: row.payer ?? '', method: row.method ?? 'Tiền mặt', branch: row.branch ?? 'Mộc Store · Quận 1', creator: row.creator ?? 'Thu ngân A', date: row.date ?? '' }
  })
  return rows
}

function displayValue(value: ManagementValue, type?: string) {
  if (type === 'currency' && typeof value === 'number') return formatCurrency(value)
  if (typeof value === 'boolean') return value ? 'Có' : 'Không'
  return String(value)
}

function invoiceItemDetails(value: ManagementValue | undefined) {
  const raw = String(value ?? '')
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.map((item) => {
      if (typeof item !== 'object' || item === null) return ''
      const line = item as Record<string, unknown>
      return `${String(line.name ?? line.productName ?? 'Món')} × ${Number(line.quantity ?? 1)}`
    }).filter(Boolean)
  } catch { return raw ? raw.split(/\s*[·,]\s*/).filter(Boolean) : ['Không có chi tiết món'] }
  return raw ? raw.split(/\s*[·,]\s*/).filter(Boolean) : ['Không có chi tiết món']
}

function FragmentRow({ module, row, expanded, onExpand, onEdit, onDelete }: { module: ManagementModule; row: ManagementRow; expanded: boolean; onExpand: () => void; onEdit: () => void; onDelete: () => void }) {
  const canExpand = module.id === 'menu-items' || module.id === 'suppliers' || module.id === 'invoices'
  return <Fragment>
    <tr className={canExpand ? 'record-expandable-row' : ''} onClick={canExpand ? onExpand : undefined} aria-expanded={canExpand ? expanded : undefined}>
      {module.columns.map((column, columnIndex) => <td key={column.key} data-label={column.label} className={`record-field-${column.key} ${column.type === 'status' ? 'record-status-cell' : ''} ${columnIndex === 0 ? 'record-primary-cell' : ''}`}>
        {module.id === 'menu-items' && column.key === 'name' ? <span className="record-product-cell"><img src={String(row.image || '/default-product.svg')} alt="" /><strong>{String(row.name ?? '')}</strong></span> : column.type === 'status' ? <span className={`status-badge ${/đã|đang|hoàn tất|xác nhận/i.test(String(row[column.key])) ? 'in-stock' : 'low'}`}><i />{displayValue(row[column.key] ?? '', column.type)}</span> : module.id === 'menu-items' && column.key === 'stock' && row.productType === 'Chế biến' ? '—' : displayValue(row[column.key] ?? '', column.type)}
      </td>)}
      <td className="record-row-actions"><button type="button" className="row-menu" aria-label={`Sửa ${String(row[module.columns[0].key] ?? '')}`} onClick={(event) => { event.stopPropagation(); onEdit() }}><Pencil size={15} /></button><button type="button" className="record-delete" aria-label={`Xóa ${String(row[module.columns[0].key] ?? '')}`} onClick={(event) => { event.stopPropagation(); onDelete() }}><X size={15} /></button></td>
    </tr>
    {canExpand && expanded && <tr className="record-detail-row"><td colSpan={module.columns.length + 1}><div className="record-detail-content">
      {module.id === 'menu-items' ? <><strong className="record-detail-title">{String(row.name ?? '')}</strong><span className="menu-detail-field"><small>Mã hàng</small><b>{String(row.code ?? '—')}</b></span><span className="menu-detail-field"><small>Loại hàng</small><b>{String(row.productType ?? '—')}</b></span><span className="menu-detail-field"><small>Thực đơn</small><b>{String(row.menuType ?? '—')}</b></span><span className="menu-detail-field"><small>Giá vốn</small><b>{row.productType === 'Chế biến' ? '—' : formatCurrency(Number(row.cost ?? 0))}</b></span><span className="menu-detail-field"><small>{row.productType === 'Chế biến' ? 'Tồn kho' : 'Số lượng tồn kho'}</small><b>{row.productType === 'Chế biến' ? 'Không quản lý' : String(row.stock ?? 0)}</b></span><span className="menu-detail-field"><small>Hiển thị trong thực đơn</small><b>{row.visible ? 'Có' : 'Không'}</b></span><span className="menu-detail-field"><small>Món thêm</small><b>{row.extra ? 'Có' : 'Không'}</b></span><span className="menu-detail-field"><small>Tích điểm</small><b>{row.points ? 'Có' : 'Không'}</b></span></> : module.id === 'invoices' ? <><strong>Hóa đơn {String(row.code ?? '')} · Đơn {String(row.order ?? '')}</strong><span>Phòng/bàn: {String(row.table ?? 'Mang về')}</span><span>Khách hàng: {String(row.customer ?? 'Khách lẻ')}</span><div className="invoice-detail-breakdown"><span>Chi tiết món:</span>{invoiceItemDetails(row.items).map((item, index) => <span className="invoice-detail-item" key={`${item}-${index}`}>{item}</span>)}</div><span>Tổng tiền hàng: {formatCurrency(Number(row.amount ?? 0))}</span><span>Giảm giá: {formatCurrency(Number(row.discount ?? 0))}</span><span>Khách cần trả: {formatCurrency(Number(row.due ?? 0))}</span><span>Khách đã trả: {formatCurrency(Number(row.paid ?? 0))}</span><span>Trạng thái: {String(row.status ?? '')}</span></> : <><strong>{String(row.name ?? '')}</strong><span>Người liên hệ: {String(row.contact ?? '—')}</span><span>Điện thoại: {String(row.phone ?? '—')}</span><span>Công nợ: {formatCurrency(Number(row.debt ?? 0))}</span><span>Địa chỉ: {String(row.address ?? 'Chưa cập nhật')}</span><span>Ghi chú: {String(row.note ?? '—')}</span></>}
    </div></td></tr>}
  </Fragment>
}

function nextCode(rows: ManagementRow[], prefix: string, digits: number) {
  const highest = rows.reduce((max, row) => {
    const code = String(row.code ?? '')
    const number = Number(code.replace(prefix, ''))
    return Number.isFinite(number) ? Math.max(max, number) : max
  }, 0)
  return `${prefix}${String(highest + 1).padStart(digits, '0')}`
}

export function ManagementRecordPage({ moduleId }: { moduleId: string }) {
  const module = managementModules.find((item) => item.id === moduleId)
  if (!module) return null
  if (moduleId === 'purchases') return <PurchaseWorkspace />
  return <RecordWorkspace key={module.id} module={module} />
}

function PurchaseWorkspace() {
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('Tất cả nhóm hàng')
  const [lines, setLines] = useState<{ product: ManagementRow; quantity: number; cost: number }[]>([])
  const [createProduct, setCreateProduct] = useState(false)
  const [creating, setCreating] = useState(false)
  const [supplier, setSupplier] = useState('')
  const [supplierCreateOpen, setSupplierCreateOpen] = useState(false)
  const [supplierOptions, setSupplierOptions] = useState<ManagementRow[]>(() => {
    try { const saved: unknown = JSON.parse(localStorage.getItem(storageKey('suppliers')) ?? 'null'); return Array.isArray(saved) ? saved as ManagementRow[] : managementModules.find((item) => item.id === 'suppliers')?.rows ?? [] } catch { return managementModules.find((item) => item.id === 'suppliers')?.rows ?? [] }
  })
  const [branch, setBranch] = useState('Mộc Store · Quận 1')
  const [note, setNote] = useState('')
  const [notice, setNotice] = useState('')
  const [history, setHistory] = useState<ManagementRow[]>(() => {
    try { const saved: unknown = JSON.parse(localStorage.getItem(storageKey('purchases')) ?? 'null'); return Array.isArray(saved) ? saved as ManagementRow[] : managementModules.find((item) => item.id === 'purchases')?.rows ?? [] } catch { return [] }
  })
  const [catalog, setCatalog] = useState<ManagementRow[]>(() => {
    try { const saved: unknown = JSON.parse(localStorage.getItem(storageKey('menu-items')) ?? 'null'); return Array.isArray(saved) ? saved as ManagementRow[] : managementModules.find((item) => item.id === 'menu-items')?.rows ?? [] } catch { return [] }
  })
  const matches = catalog.filter((product) => `${product.name} ${product.code}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')) && (categoryFilter === 'Tất cả nhóm hàng' || product.category === categoryFilter) && !lines.some((line) => line.product.code === product.code))
  const addProduct = (product: ManagementRow) => setLines((current) => [...current, { product, quantity: 1, cost: Number(product.cost ?? 0) }])
  const total = lines.reduce((sum, line) => sum + line.quantity * line.cost, 0)
  const saveVoucher = () => {
    if (!lines.length) return
    const saved = JSON.parse(localStorage.getItem(storageKey('purchases')) ?? 'null') as ManagementRow[] | null
    const history = Array.isArray(saved) ? saved : managementModules.find((item) => item.id === 'purchases')?.rows ?? []
    const code = `PN-${String(history.length + 87).padStart(4, '0')}`
    const record: ManagementRow = { code, date: new Date().toLocaleDateString('vi-VN'), supplier: supplier || 'Chưa chọn', branch, items: lines.length, amount: total, status: 'Chờ thanh toán', detail: JSON.stringify(lines.map((line) => ({ name: line.product.name, sku: line.product.code, quantity: line.quantity, cost: line.cost }))), note }
    const next = [record, ...history]; localStorage.setItem(storageKey('purchases'), JSON.stringify(next)); setHistory(next)
    setNotice(`Đã lưu phiếu nhập ${code} trong dữ liệu demo.`); setLines([]); setCreating(false); window.setTimeout(() => setNotice(''), 3000)
  }
  const saveNewProduct = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const code = nextCode(catalog, 'M', 5)
    const product: ManagementRow = { code, name: String(data.get('name') ?? ''), category: String(data.get('category') ?? 'Khác'), productType: 'Hàng hóa thường', menuType: 'Khác', price: Number(data.get('price')), cost: Number(data.get('cost')), stock: 0, baseUnit: 'Cái', visible: true, extra: false, points: true, attributes: '[]', units: '[]' }
    const next = [product, ...catalog]; localStorage.setItem(storageKey('menu-items'), JSON.stringify(next)); setCatalog(next); setShowAll(true); setCreateProduct(false); addProduct(product)
  }
  const saveNewSupplier = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const record: ManagementRow = { name: String(data.get('name') ?? '').trim(), contact: String(data.get('contact') ?? '').trim(), phone: String(data.get('phone') ?? '').trim(), address: String(data.get('address') ?? '').trim(), debt: 0, __id: crypto.randomUUID() }
    const next = [record, ...supplierOptions]
    localStorage.setItem(storageKey('suppliers'), JSON.stringify(next))
    setSupplierOptions(next)
    setSupplier(String(record.name))
    setSupplierCreateOpen(false)
  }
  if (!creating) return <section className="record-page record-page-purchases"><div className="page-title-row"><div><div className="record-breadcrumb">Nhập hàng</div><h1>Phiếu nhập hàng</h1><p>Tra cứu phiếu nhập và công nợ hàng hóa đầu vào.</p></div><button className="button button-primary" type="button" onClick={() => { setLines([]); setQuery(''); setCreating(true) }}><Plus size={16} /> Nhập hàng</button></div><div className="record-metrics"><article className="record-metric"><span>Phiếu nhập</span><strong>{history.length}</strong><small>Tất cả phiếu đã tạo</small></article><article className="record-metric"><span>Giá trị phiếu</span><strong>{formatCurrency(history.reduce((sum, row) => sum + Number(row.amount ?? 0), 0))}</strong><small>Dữ liệu demo cục bộ</small></article><article className="record-metric"><span>Chờ thanh toán</span><strong>{history.filter((row) => row.status === 'Chờ thanh toán').length}</strong><small>Cần đối soát</small></article></div><section className="panel record-table-panel"><div className="table-scroll"><table className="data-table record-table"><thead><tr><th>Mã phiếu</th><th>Ngày nhập</th><th>Nhà cung cấp</th><th>Sản phẩm</th><th>Tổng tiền</th><th>Trạng thái</th></tr></thead><tbody>{history.map((row) => <tr key={String(row.code)}><td>{String(row.code)}</td><td>{String(row.date ?? '')}</td><td>{String(row.supplier ?? '')}</td><td>{String(row.items ?? 0)} mặt hàng</td><td>{formatCurrency(Number(row.amount ?? 0))}</td><td>{String(row.status ?? '')}</td></tr>)}</tbody></table></div>{!history.length && <div className="empty-state"><PackagePlus size={24} /><strong>Chưa có phiếu nhập</strong><span>Chọn “Nhập hàng” để tạo phiếu mới.</span></div>}</section>{notice && <div className="toast" role="status">{notice}</div>}</section>
  return <section className="record-page record-page-purchases"><div className="page-title-row"><div><div className="record-breadcrumb">Nhập hàng <span>/</span> Tạo phiếu</div><h1>Tạo phiếu nhập hàng</h1><p>Thông tin phiếu nhập và sản phẩm được nhập.</p></div><button className="button button-primary" type="button" disabled={!lines.length} onClick={saveVoucher}>Lưu phiếu nhập</button></div>
    <section className="panel stock-voucher-meta"><label className="form-label">Mã phiếu<input value={`PN-${String(history.length + 87).padStart(4, '0')}`} readOnly /></label><label className="form-label">Ngày nhập<input value={new Date().toLocaleDateString('vi-VN')} readOnly /></label><label className="form-label">Nhà cung cấp<select value={supplier} onChange={(event) => { if (event.target.value === '__create__') setSupplierCreateOpen(true); else setSupplier(event.target.value) }}><option value="">Chọn nhà cung cấp</option>{supplierOptions.map((row) => <option key={String(row.__id ?? row.name)}>{String(row.name)}</option>)}<option value="__create__">＋ Tạo nhà cung cấp mới</option></select></label><label className="form-label">Chi nhánh<select value={branch} onChange={(event) => setBranch(event.target.value)}><option>Mộc Store · Quận 1</option><option>Mộc Store · Quận 3</option></select></label><label className="form-label">Người tạo<input value="Quản lý chi nhánh" readOnly /></label><label className="form-label">Ghi chú<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ghi chú phiếu nhập" /></label></section>
    <section className="panel inventory-list-panel"><div className="inventory-toolbar"><label className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm tên hàng hoặc mã hàng..." /></label><div className="filter-actions"><button className="button button-secondary" type="button" onClick={() => setFilterOpen((value) => !value)}><SlidersHorizontal size={15} /> Bộ lọc</button><button className="button button-secondary" type="button" onClick={() => setShowAll((value) => !value)}>{showAll ? 'Ẩn danh sách' : 'Hiển thị tất cả'}</button><button className="button button-primary" type="button" onClick={() => setCreateProduct(true)}><Plus size={15} /> Tạo mới hàng hóa</button></div></div>{filterOpen && <div className="voucher-filter-panel"><label>Nhóm hàng<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option>Tất cả nhóm hàng</option>{[...new Set(catalog.map((product) => String(product.category ?? 'Khác')))].map((item) => <option key={item}>{item}</option>)}</select></label><span>Lọc danh sách theo nhóm hàng.</span></div>}
      {(query || showAll) && <div className="voucher-search-results">{matches.filter((product) => product.productType === 'Hàng hóa thường').map((product) => <button type="button" key={String(product.code)} onClick={() => addProduct(product)}><span><strong>{String(product.name)}</strong><small>{String(product.code)} · Giá vốn {formatCurrency(Number(product.cost ?? 0))}</small></span><Plus size={16} /></button>)}</div>}
      {lines.length ? <><div className="table-scroll"><table className="data-table inventory-table"><thead><tr><th>Hàng hóa</th><th>Đơn vị</th><th>Số lượng</th><th>Giá nhập</th><th>Thành tiền</th><th /></tr></thead><tbody>{lines.map((line) => <tr key={String(line.product.code)}><td><strong>{String(line.product.name)}</strong><small>{String(line.product.code)}</small></td><td>Cái</td><td><input className="voucher-quantity" type="number" min="1" value={line.quantity} onChange={(event) => setLines((current) => current.map((item) => item === line ? { ...item, quantity: Number(event.target.value) } : item))} /></td><td><input className="voucher-quantity" type="number" min="0" value={line.cost} onChange={(event) => setLines((current) => current.map((item) => item === line ? { ...item, cost: Number(event.target.value) } : item))} /></td><td>{formatCurrency(line.quantity * line.cost)}</td><td><button className="record-delete" type="button" onClick={() => setLines((current) => current.filter((item) => item !== line))}><X size={15} /></button></td></tr>)}</tbody></table></div><div className="purchase-total"><span>Tổng tiền hàng</span><strong>{formatCurrency(total)}</strong></div></> : <div className="empty-state"><PackagePlus size={24} /><strong>Phiếu nhập chưa có hàng hóa</strong><span>Tìm kiếm sản phẩm hoặc chọn “Hiển thị tất cả”.</span></div>}</section>
    {notice && <div className="toast" role="status">{notice}</div>}{createProduct && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateProduct(false) }}><section className="modal-card record-dialog" role="dialog" aria-modal="true"><button className="modal-close" type="button" onClick={() => setCreateProduct(false)} aria-label="Đóng"><X size={18} /></button><h2>Tạo hàng hóa mới</h2><p>Sản phẩm mới được lưu trong danh sách món và thêm vào phiếu nhập.</p><form onSubmit={saveNewProduct}><label className="form-label">Tên hàng<input name="name" required /></label><label className="form-label">Nhóm hàng<select name="category"><option>Cà phê</option><option>Trà</option><option>Bia</option><option>Đồ ăn</option><option>Khác</option></select></label><label className="form-label">Giá bán<input name="price" type="number" min="0" required /></label><label className="form-label">Giá vốn<input name="cost" type="number" min="0" required /></label><div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => setCreateProduct(false)}>Hủy</button><button className="button button-primary" type="submit">Tạo và thêm vào phiếu</button></div></form></section></div>}
    {supplierCreateOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSupplierCreateOpen(false) }}><section className="modal-card record-dialog" role="dialog" aria-modal="true" aria-labelledby="new-supplier-title"><button className="modal-close" type="button" onClick={() => setSupplierCreateOpen(false)} aria-label="Đóng"><X size={18} /></button><h2 id="new-supplier-title">Tạo nhà cung cấp</h2><p>Nhà cung cấp mới sẽ được lưu vào danh sách để sử dụng cho phiếu nhập.</p><form onSubmit={saveNewSupplier}><label className="form-label">Tên nhà cung cấp<input name="name" required autoFocus /></label><label className="form-label">Người liên hệ<input name="contact" /></label><label className="form-label">Số điện thoại<input name="phone" type="tel" /></label><label className="form-label">Địa chỉ<input name="address" /></label><div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => setSupplierCreateOpen(false)}>Hủy</button><button className="button button-primary" type="submit">Lưu nhà cung cấp</button></div></form></section></div>}
  </section>
}

function RecordWorkspace({ module }: { module: ManagementModule }) {
  const [rows, setRows] = useState(() => loadRows(module))
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('Tất cả')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [ascending, setAscending] = useState(true)
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ManagementRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ManagementRow | null>(null)
  const [notice, setNotice] = useState('')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [cashTab, setCashTab] = useState('Tổng quỹ')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [branchFilter, setBranchFilter] = useState('Tất cả chi nhánh')

  useEffect(() => {
    try { localStorage.setItem(storageKey(module.id), JSON.stringify(rows)) } catch { setNotice('Không thể lưu dữ liệu demo trên thiết bị.') }
  }, [module.id, rows])

  const filteredRows = useMemo(() => {
    const result = rows.filter((row) => {
      const matchesText = Object.values(row).some((value) => String(value).toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')))
      const matchesFilter = filter === 'Tất cả' || Object.values(row).some((value) => String(value) === filter)
      const matchesCashTab = module.id !== 'cashbook' || cashTab === 'Tổng quỹ' || (cashTab === 'Ngân hàng' ? row.method === 'Chuyển khoản' : row.method === 'Tiền mặt')
      const branch = String(row.branch ?? '')
      const matchesBranch = module.id !== 'cashbook' || branchFilter === 'Tất cả chi nhánh' || branch === branchFilter
      const dateText = String(row.date ?? '').split(' ')[0]
      const [day, month, year] = dateText.split('/')
      const rowDate = day && month && year ? `${year}-${month}-${day}` : ''
      const matchesDate = module.id !== 'cashbook' || ((!dateFrom || (rowDate && rowDate >= dateFrom)) && (!dateTo || (rowDate && rowDate <= dateTo)))
      return matchesText && matchesFilter && matchesCashTab && matchesBranch && matchesDate
    })
    if (sortKey) result.sort((left, right) => {
      const a = left[sortKey] ?? ''
      const b = right[sortKey] ?? ''
      const comparison = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'vi')
      return ascending ? comparison : -comparison
    })
    return result
  }, [filter, query, rows, sortKey, ascending, module.id, cashTab, dateFrom, dateTo, branchFilter])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const visibleRows = filteredRows.slice((page - 1) * pageSize, page * pageSize)
  useEffect(() => { if (page > pageCount) setPage(pageCount) }, [page, pageCount])
  const toggleSort = (key: string) => {
    setAscending(sortKey === key ? !ascending : true)
    setSortKey(key)
  }
  const exportCsv = () => {
    const content = [module.columns.map((column) => column.label), ...filteredRows.map((row) => module.columns.map((column) => String(row[column.key] ?? '')))]
      .map((line) => line.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob(['\ufeff', content], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${module.id}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }
  const saveRecord = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const values = Object.fromEntries(module.fields.map((field) => {
      const raw = formData.get(field.key)
      const value = field.type === 'checkbox' ? raw === 'on' : String(raw ?? '').trim()
      return [field.key, field.type === 'number' && value ? Number(value) : value]
    })) as ManagementRow
    saveValues(values)
  }
  const saveValues = (values: ManagementRow) => {
    const record: ManagementRow = editing
      ? { ...values, ...(editing.__id ? { __id: editing.__id } : {}) }
      : { ...values, __id: crypto.randomUUID() }
    setRows((current) => editing ? current.map((row) => row === editing ? record : row) : [record, ...current])
    setFormOpen(false)
    setEditing(null)
    setPage(1)
    setNotice(editing ? `Đã cập nhật ${module.entity}.` : `Đã thêm ${module.entity} mới.`)
    window.setTimeout(() => setNotice(''), 2600)
  }
  const removeRecord = () => {
    if (!deleteTarget) return
    setRows((current) => current.filter((row) => row !== deleteTarget))
    setDeleteTarget(null)
    setNotice(`Đã xóa ${module.entity}.`)
    window.setTimeout(() => setNotice(''), 2600)
  }

  return <section className={`record-page record-page-${module.id}`}>
    <div className="page-title-row"><div><div className="record-breadcrumb">Quản lý cửa hàng <span>/</span> {module.title}</div><h1>{module.title}</h1><p>{module.description}</p></div><div className="record-actions"><button className="button button-secondary" type="button" onClick={exportCsv}><Download size={15} /> Xuất file</button><button className="button button-primary" type="button" onClick={() => { setEditing(null); setFormOpen(true) }}><Plus size={16} /> Thêm {module.entity}</button></div></div>

    {module.id === 'cashbook' && <div className="record-filters cashbook-tabs">{['Tiền mặt', 'Ngân hàng', 'Tổng quỹ'].map((tab) => <button type="button" key={tab} className={cashTab === tab ? 'active' : ''} onClick={() => setCashTab(tab)}>{tab}</button>)}{cashTab === 'Ngân hàng' && <a className="button button-secondary" href="/management/bank-accounts">Tài khoản ngân hàng</a>}</div>}
    <div className="record-metrics">{module.metrics.map((metric) => <article className="record-metric" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.hint}</small></article>)}</div>

    <section className="panel record-table-panel">
      <div className="record-toolbar"><label className="search-field"><Search size={16} /><input aria-label={module.searchPlaceholder} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder={module.searchPlaceholder} /><kbd>⌘ K</kbd></label>{module.id === 'cashbook' && <div className="cashbook-date-filters"><label>Từ<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label><label>Đến<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label><select aria-label="Chi nhánh sổ quỹ" value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}><option>Tất cả chi nhánh</option><option>Mộc Store · Quận 1</option><option>Mộc Store · Quận 3</option></select></div>}<div className="record-filters"><button type="button" className={filter === 'Tất cả' ? 'active' : ''} onClick={() => { setFilter('Tất cả'); setPage(1) }}>Tất cả</button>{module.filters?.map((item) => <button type="button" key={item} className={filter === item ? 'active' : ''} onClick={() => { setFilter(item); setPage(1) }}>{item}</button>)}</div></div>
      <div className="table-scroll"><table className="data-table record-table"><thead><tr>{module.columns.map((column) => <th key={column.key}><button type="button" onClick={() => toggleSort(column.key)}>{column.label}<span aria-hidden="true">{sortKey === column.key ? ascending ? ' ↑' : ' ↓' : ' ↕'}</span></button></th>)}<th aria-label="Thao tác" /></tr></thead><tbody>
        {visibleRows.map((row, rowIndex) => <FragmentRow key={`${module.id}-${row.__id ?? row.code ?? row.name ?? row.employee ?? rowIndex}-${rowIndex}`} module={module} row={row} expanded={expandedRow === String(row.__id ?? row.code ?? row.name ?? rowIndex)} onExpand={() => setExpandedRow((current) => current === String(row.__id ?? row.code ?? row.name ?? rowIndex) ? null : String(row.__id ?? row.code ?? row.name ?? rowIndex))} onEdit={() => { setEditing(row); setFormOpen(true) }} onDelete={() => setDeleteTarget(row)} />)}
      </tbody></table></div>
      {filteredRows.length === 0 && <div className="empty-state"><Search size={23} /><strong>Không tìm thấy dữ liệu</strong><span>Thử thay đổi từ khóa hoặc bộ lọc.</span></div>}
      <div className="table-footer"><span>Hiển thị <strong>{filteredRows.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filteredRows.length)}</strong> trong <strong>{filteredRows.length}</strong> {module.entity}</span><div className="pagination"><button type="button" aria-label="Trang trước" disabled={page === 1} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={16} /></button><button className="current-page" type="button">{page} / {pageCount}</button><button type="button" aria-label="Trang sau" disabled={page === pageCount} onClick={() => setPage((current) => current + 1)}><ChevronRight size={16} /></button></div></div>
    </section>

    {notice && <div className="toast" role="status"><span className="toast-check">✓</span>{notice}</div>}
    {formOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFormOpen(false) }}><section className="modal-card record-dialog" role="dialog" aria-modal="true" aria-labelledby="record-dialog-title"><button className="modal-close" type="button" onClick={() => setFormOpen(false)} aria-label="Đóng"><X size={18} /></button><h2 id="record-dialog-title">{editing ? `Cập nhật ${module.entity}` : `Thêm ${module.entity}`}</h2><p>Thông tin được lưu trong dữ liệu demo trên thiết bị.</p>{module.id === 'menu-items' ? <ProductEditor key={String(editing?.code ?? 'new')} initial={editing} nextProductCode={editing ? String(editing.code) : nextCode(rows, 'M', 5)} onCancel={() => setFormOpen(false)} onSave={saveValues} /> : <form onSubmit={saveRecord} onChange={(event) => { if (module.id === 'invoices') updateInvoiceDue(event.currentTarget) }}><div className="record-form-grid">{module.fields.map((field) => {
      const defaults = module.id === 'invoices' && field.key === 'table' ? getRoomNames() : field.options ?? (field.key === 'type' ? module.filters : field.key === 'status' ? [...new Set(rows.map((row) => String(row.status ?? '')).filter(Boolean))] : undefined)
      const defaultValue = editing?.[field.key] ?? (field.key === 'code' && module.id === 'invoices' ? nextCode(rows, 'HD', 6) : field.key === 'code' && module.id === 'cashbook' ? nextCode(rows, 'TTHD', 6) : defaults?.[0] ?? '')
      if (field.type === 'checkbox') return <label className="form-check" key={field.key}><input name={field.key} type="checkbox" defaultChecked={editing?.[field.key] === true} /><span>{field.label}</span></label>
      if (field.type === 'multi-select') return <MultiSelectField key={field.key} field={field} defaultValue={String(defaultValue || 'Tất cả chi nhánh')} />
      if (field.type === 'textarea') return <label className="form-label" key={field.key}>{field.label}<textarea name={field.key} defaultValue={String(defaultValue)} required={field.required} rows={3} /></label>
      if (field.type === 'select') return <label className="form-label" key={field.key}>{field.label}<select name={field.key} defaultValue={String(defaultValue)} required={field.required}>{defaults?.map((choice) => <option key={choice}>{choice}</option>)}</select></label>
      if (field.type === 'bank-picker') return <label className="form-label" key={field.key}>{field.label}<input name={field.key} list="bank-list" defaultValue={String(defaultValue)} required={field.required} /><datalist id="bank-list">{bankList.map((bank) => <option key={bank} value={bank} />)}</datalist></label>
      return <label className="form-label" key={field.key}>{field.label}<input name={field.key} type={field.type === 'number' || field.type === 'tel' ? field.type : 'text'} defaultValue={String(defaultValue)} required={field.required} min={field.type === 'number' ? 0 : undefined} readOnly={field.readOnly} /></label>
    })}</div><div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => setFormOpen(false)}>Hủy</button><button className="button button-primary" type="submit">{editing ? 'Lưu thay đổi' : `Thêm ${module.entity}`}</button></div></form>}</section></div>}
    {deleteTarget && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteTarget(null) }}><section className="modal-card delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title"><button className="modal-close" type="button" onClick={() => setDeleteTarget(null)} aria-label="Đóng"><X size={18} /></button><h2 id="delete-dialog-title">Xóa {module.entity}?</h2><p>Bản ghi “{String(deleteTarget[module.columns[0].key] ?? '')}” sẽ bị xóa khỏi dữ liệu demo trên thiết bị.</p><div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => setDeleteTarget(null)}>Hủy</button><button className="button button-danger" type="button" onClick={removeRecord}>Xóa bản ghi</button></div></section></div>}
  </section>
}

const bankList = ['Vietcombank', 'VietinBank', 'BIDV', 'Agribank', 'Techcombank', 'MB Bank', 'ACB', 'VPBank', 'TPBank', 'Sacombank', 'HDBank', 'VIB', 'SHB', 'OCB', 'Eximbank']

function getRoomNames() {
  try {
    const records: unknown = JSON.parse(localStorage.getItem('fnb-management:rooms') ?? '[]')
    const names = Array.isArray(records) ? records.map((record) => typeof record === 'object' && record !== null && 'name' in record ? String(record.name) : '').filter(Boolean) : []
    return names.length ? names : ['Mang về', 'Bàn 01', 'Bàn 02', 'Bàn 03']
  } catch { return ['Mang về', 'Bàn 01', 'Bàn 02', 'Bàn 03'] }
}

function updateInvoiceDue(form: HTMLFormElement) {
  const values = new FormData(form)
  const amount = Number(values.get('amount')) || 0
  const discount = Number(values.get('discount')) || 0
  const due = form.elements.namedItem('due')
  if (due instanceof HTMLInputElement) due.value = String(Math.max(0, amount - discount))
}

function MultiSelectField({ field, defaultValue }: { field: ManagementModule['fields'][number]; defaultValue: string }) {
  const options = field.options ?? []
  const initial = defaultValue === 'Tất cả chi nhánh' ? ['Tất cả chi nhánh'] : defaultValue.split(', ')
  const [selected, setSelected] = useState<string[]>(initial)
  const toggle = (option: string) => setSelected((current) => {
    if (option === 'Tất cả chi nhánh') return [option]
    const next = current.filter((item) => item !== 'Tất cả chi nhánh')
    return next.includes(option) ? next.filter((item) => item !== option) : [...next, option]
  })
  return <fieldset className="form-label branch-check-list"><legend>{field.label}</legend>{options.map((option) => <label key={option}><input type="checkbox" checked={selected.includes(option)} onChange={() => toggle(option)} /><span>{option}</span></label>)}<input type="hidden" name={field.key} value={selected.includes('Tất cả chi nhánh') ? 'Tất cả chi nhánh' : selected.join(', ')} /></fieldset>
}

type ProductAttribute = { name: string; value: string }
type ProductUnit = { name: string; ratio: number; cost: number; price: number }

function ProductEditor({ initial, nextProductCode, onCancel, onSave }: { initial: ManagementRow | null; nextProductCode: string; onCancel: () => void; onSave: (values: ManagementRow) => void }) {
  const [productType, setProductType] = useState(String(initial?.productType ?? 'Hàng hóa thường'))
  const [categories, setCategories] = useState<string[]>(() => {
    try { return [...new Set(['Cà phê', 'Cacao', 'Trà', 'Bia', 'Đồ ăn', 'Khác', ...JSON.parse(localStorage.getItem('fnb-product-groups') ?? '[]') as string[]])] } catch { return ['Cà phê', 'Cacao', 'Trà', 'Bia', 'Đồ ăn', 'Khác'] }
  })
  const [newCategory, setNewCategory] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(String(initial?.category ?? 'Cà phê'))
  const [baseUnit, setBaseUnit] = useState(String(initial?.baseUnit ?? 'Cái'))
  const [image, setImage] = useState(String(initial?.image ?? ''))
  const [attributes, setAttributes] = useState<ProductAttribute[]>(() => parseRows<ProductAttribute>(initial?.attributes))
  const [units, setUnits] = useState<ProductUnit[]>(() => parseRows<ProductUnit>(initial?.units).map((unit) => ({ ...unit, cost: Number(unit.cost ?? initial?.cost ?? 0), price: Number(unit.price ?? Number(initial?.price ?? 0) * unit.ratio) })))
  const [error, setError] = useState('')
  const [compressing, setCompressing] = useState(false)
  const onImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Vui lòng chọn tệp hình ảnh.'); return }
    setCompressing(true); setError('')
    try { setImage(await compressImage(file)) } catch { setError('Không thể đọc hình ảnh đã chọn.') } finally { setCompressing(false) }
  }
  const addCategory = () => {
    const value = (newCategory === '__open__' ? '' : newCategory).trim()
    if (!value) return
    const updated = [...new Set([...categories, value])]
    setCategories(updated); setSelectedCategory(value); setNewCategory('')
    try { localStorage.setItem('fnb-product-groups', JSON.stringify(updated.filter((item) => !['Cà phê', 'Cacao', 'Trà', 'Bia', 'Đồ ăn', 'Khác'].includes(item)))) } catch { setError('Không thể lưu nhóm hàng mới trên thiết bị.') }
  }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const value = (key: string) => String(data.get(key) ?? '').trim()
    const row: ManagementRow = { code: nextProductCode, name: value('name'), category: value('category'), productType, menuType: value('menuType'), price: Number(value('price')), status: value('status'), visible: data.get('visible') === 'on', extra: data.get('extra') === 'on', points: data.get('points') === 'on', image, baseUnit: baseUnit.trim() || 'Cái', attributes: JSON.stringify(attributes.filter((entry) => entry.name.trim())), units: JSON.stringify(units.filter((entry) => entry.name.trim() && entry.ratio > 0)) }
    if (productType === 'Hàng hóa thường') { row.cost = Number(value('cost')) || 0; row.stock = Number(value('stock')) || 0 }
    onSave(row)
  }
  return <form onSubmit={submit} className="product-editor">
    <div className="record-form-grid">
      <label className="form-label">Mã hàng<input value={nextProductCode} readOnly /></label>
      <label className="form-label">Tên hàng<input name="name" required defaultValue={String(initial?.name ?? '')} /></label>
      <label className="form-label">Nhóm hàng<select name="category" value={selectedCategory} onChange={(event) => { if (event.target.value === '__create__') setNewCategory('__open__'); else setSelectedCategory(event.target.value) }}><option value="" disabled>Chọn nhóm hàng</option>{categories.map((item) => <option key={item}>{item}</option>)}<option value="__create__">＋ Tạo nhóm hàng mới</option></select>{newCategory !== '' && <span className="inline-create"><input aria-label="Tên nhóm hàng mới" placeholder="Tên nhóm hàng" value={newCategory === '__open__' ? '' : newCategory} onChange={(event) => setNewCategory(event.target.value)} /><button type="button" className="button button-secondary" onClick={addCategory}>Thêm nhóm</button></span>}</label>
      <label className="form-label">Loại hàng<select value={productType} onChange={(event) => setProductType(event.target.value)}><option>Hàng hóa thường</option><option>Chế biến</option></select></label>
      <label className="form-label">Loại thực đơn<select name="menuType" defaultValue={String(initial?.menuType ?? 'Đồ uống')}><option>Đồ uống</option><option>Đồ ăn</option><option>Khác</option></select></label>
      <label className="form-label">Giá bán (₫)<input name="price" type="number" min="0" required defaultValue={String(initial?.price ?? '')} /></label>
      {productType === 'Hàng hóa thường' && <><label className="form-label">Giá vốn (₫)<input name="cost" type="number" min="0" defaultValue={String(initial?.cost ?? '')} /></label><label className="form-label">Tồn kho<input name="stock" type="number" min="0" defaultValue={String(initial?.stock ?? 0)} /></label></>}
      <label className="form-label">Trạng thái<select name="status" defaultValue={String(initial?.status ?? 'Đang bán')}><option>Đang bán</option><option>Tạm hết</option></select></label>
    </div>
    <div className="product-checks"><label><input name="visible" type="checkbox" defaultChecked={initial?.visible !== false} /> Hiển thị trong thực đơn</label><label><input name="extra" type="checkbox" defaultChecked={initial?.extra === true} /> Là món thêm</label><label><input name="points" type="checkbox" defaultChecked={initial?.points !== false} /> Tích điểm</label></div>
    <label className="form-label product-image-field">Hình ảnh sản phẩm<input type="file" accept="image/*" onChange={onImageChange} /><small>{compressing ? 'Đang nén ảnh...' : 'Ảnh được thu nhỏ tối đa 600px và nén trước khi lưu trên thiết bị.'}</small>{image && <span className="product-image-preview"><img src={image} alt="Xem trước sản phẩm" /><button className="button button-secondary" type="button" onClick={() => setImage('')}>Xóa ảnh</button></span>}</label>
    <section className="product-extra-editor"><div><strong>Thuộc tính</strong><button className="button button-secondary" type="button" onClick={() => setAttributes((current) => [...current, { name: '', value: '' }])}>+ Thêm thuộc tính</button></div>{attributes.map((entry, index) => <div className="inline-edit-row" key={`attr-${index}`}><input aria-label="Tên thuộc tính" placeholder="Ví dụ: Size" value={entry.name} onChange={(event) => setAttributes((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /><input aria-label="Giá trị thuộc tính" placeholder="Ví dụ: M, L, XL" value={entry.value} onChange={(event) => setAttributes((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} /><button type="button" aria-label="Xóa thuộc tính" onClick={() => setAttributes((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>)}</section>
    <section className="product-extra-editor"><div><strong>Đơn vị tính</strong><span>Đơn vị cơ bản có thể đổi khi tạo hoặc chỉnh sửa món.</span></div><label className="form-label base-unit-field">Đơn vị cơ bản<input aria-label="Đơn vị cơ bản" value={baseUnit} onChange={(event) => setBaseUnit(event.target.value)} placeholder="Ví dụ: Lon, Chai, Ly" required /></label><div className="product-unit-list-heading"><strong>Đơn vị quy đổi</strong><button className="button button-secondary" type="button" onClick={() => setUnits((current) => [...current, { name: '', ratio: 1, cost: Number(initial?.cost ?? 0), price: Number(initial?.price ?? 0) }])}>+ Thêm đơn vị</button></div>{units.map((unit, index) => <div className="unit-editor-row" key={`unit-${index}`}><input aria-label="Tên đơn vị" placeholder="Ví dụ: Thùng" value={unit.name} onChange={(event) => setUnits((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /><label>Quy đổi<input aria-label={`Số ${baseUnit || 'đơn vị cơ bản'} trong đơn vị quy đổi`} type="number" min="1" value={unit.ratio} onChange={(event) => setUnits((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ratio: Number(event.target.value) } : item))} /></label><label>Giá bán<input aria-label="Giá bán đơn vị" type="number" min="0" value={unit.price} onChange={(event) => setUnits((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, price: Number(event.target.value) } : item))} /></label><label>Giá vốn<input aria-label="Giá vốn đơn vị" type="number" min="0" disabled={productType === 'Chế biến'} value={unit.cost} onChange={(event) => setUnits((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, cost: Number(event.target.value) } : item))} /></label><button type="button" aria-label="Xóa đơn vị" onClick={() => setUnits((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button><small>Số lượng quy đổi tính theo đơn vị cơ bản “{baseUnit || 'Cái'}”. Sẽ tạo đơn vị con “{String(initial?.name ?? 'Tên hàng')} · {unit.name || 'Đơn vị mới'}”.</small></div>)}</section>
    {error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button className="button button-secondary" type="button" onClick={onCancel}>Hủy</button><button className="button button-primary" type="submit">Lưu món</button></div>
  </form>
}

function parseRows<T>(value: ManagementValue | undefined): T[] {
  try { const rows: unknown = JSON.parse(String(value ?? '[]')); return Array.isArray(rows) ? rows as T[] : [] } catch { return [] }
}

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const source = URL.createObjectURL(file)
    image.onload = () => {
      const scale = Math.min(1, 600 / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale)
      const context = canvas.getContext('2d')
      if (!context) { URL.revokeObjectURL(source); reject(new Error('Canvas is unavailable')); return }
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(source)
      resolve(canvas.toDataURL('image/webp', 0.72))
    }
    image.onerror = () => { URL.revokeObjectURL(source); reject(new Error('Invalid image')) }
    image.src = source
  })
}
