import { useMemo, useState } from 'react'
import { ArrowDownToLine, Banknote, Check, ChevronDown, ChevronLeft, CircleHelp, Clock3, CreditCard, Minus, Plus, QrCode, Search, ShoppingBag, Trash2, Wifi, WifiOff, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatCurrency, products, recentOrders } from '../../services/mockData'
import { createMockOrder, getOfflineOrderQueue, simulateOfflineOrderSync } from '../../services/mockCheckout'
import { usePosStore } from '../../stores/posStore'
import type { Product } from '../../types'
import { ProductArtwork } from '../../components/ProductArtwork'
import { managementModules, type ManagementRow } from '../management/moduleConfig'

const categoryColors: Record<string, string> = { 'Cà phê': '#f2e5d6', 'Trà': '#f7e1d7', 'Đồ ăn': '#f5e4c7', 'Retail SKU': '#e5e9e4', 'Bia': '#e8ecd4', 'Cacao': '#eadbd3' }

function loadCatalogProducts(): Product[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem('fnb-management:menu-items') ?? 'null')
    if (!Array.isArray(saved) || saved.length === 0) return products
    return saved.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .filter((item) => item.visible !== false && item.status !== 'Tạm hết')
      .map((item, index) => {
        const category = String(item.category ?? 'Khác')
        const code = String(item.code ?? `M${String(index + 1).padStart(5, '0')}`)
        return { id: code, sku: code, name: String(item.name ?? 'Sản phẩm'), category, price: Number(item.price) || 0, stock: Number(item.stock) || 0, minimum: Number(item.minimum) || 0, color: categoryColors[category] ?? '#edf2ee', image: typeof item.image === 'string' ? item.image : undefined, productType: String(item.productType ?? 'Chế biến') as Product['productType'], attributes: parseCatalogRows(item.attributes), units: parseCatalogRows(item.units) }
      })
  } catch { return products }
}

function parseCatalogRows<T>(value: unknown): T[] {
  try { const result: unknown = typeof value === 'string' ? JSON.parse(value) : value; return Array.isArray(result) ? result as T[] : [] } catch { return [] }
}

export function POS() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Tất cả')
  const [payment, setPayment] = useState<'cash' | 'qr' | null>(null)
  const [offline, setOffline] = useState(false)
  const [queuedOrders, setQueuedOrders] = useState<string[]>(() => getOfflineOrderQueue())
  const [syncing, setSyncing] = useState(false)
  const [receipt, setReceipt] = useState('')
  const [ordersOpen, setOrdersOpen] = useState(false)
  const [paymentOptionsOpen, setPaymentOptionsOpen] = useState(false)
  const [cartExpanded, setCartExpanded] = useState(false)
  const catalogProducts = useMemo(() => loadCatalogProducts(), [])
  const categories = useMemo(() => ['Tất cả', ...new Set(catalogProducts.map((product) => product.category))], [catalogProducts])
  const { items, discount, note, customer, table, orderCode, add, setQuantity, remove, setDiscount, setNote, setCustomer, setTable, nextOrder, clear } = usePosStore()
  const [rooms] = useState(() => {
    try {
      const records: unknown = JSON.parse(localStorage.getItem('fnb-management:rooms') ?? '[]')
      const names = Array.isArray(records) ? records.map((record) => typeof record === 'object' && record !== null && 'name' in record ? String(record.name) : '').filter(Boolean) : []
      return names.length ? names : ['Mang về', 'Bàn 01', 'Bàn 02', 'Bàn 03']
    } catch { return ['Mang về', 'Bàn 01', 'Bàn 02', 'Bàn 03'] }
  })
  const [customers] = useState(() => {
    try {
      const records: unknown = JSON.parse(localStorage.getItem('fnb-management:customers') ?? '[]')
      const names = Array.isArray(records) ? records.map((record) => typeof record === 'object' && record !== null && 'name' in record ? String(record.name) : '').filter(Boolean) : []
      return ['Khách lẻ', ...names]
    } catch { return ['Khách lẻ'] }
  })
  const subtotal = items.reduce((total, line) => total + line.product.price * line.quantity, 0)
  const total = Math.max(0, subtotal - discount)
  const visibleProducts = useMemo(() => catalogProducts.filter((product) => {
    const matchesSearch = `${product.name} ${product.sku}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))
    return matchesSearch && (category === 'Tất cả' || product.category === category)
  }), [catalogProducts, category, search])

  const pay = async (received: number) => {
    if (items.length === 0) return
    const order = await createMockOrder({ total, paymentMethod: payment ?? 'cash', offline })
    const now = new Date()
    const date = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(now)
    const itemSummary = items.map(({ product, quantity }) => `${product.name} ×${quantity}`).join(' · ')
    const paidAmount = Math.min(received, total)
    const paidStatus = paidAmount >= total ? 'Đã thanh toán' : 'Chờ thanh toán'
    const invoiceCode = appendManagementRecord('invoices', 'HD', 6, { table, order: orderCode, customer, items: itemSummary, note, amount: subtotal, discount, due: total, paid: paidAmount, date, branch: 'Mộc Store · Quận 1', receiver: 'Thu ngân A', creator: 'Thu ngân A', method: payment === 'qr' ? 'Chuyển khoản' : 'Tiền mặt', status: paidStatus })
    appendManagementRecord('cashbook', 'TTHD', 6, { status: paidStatus, voucher: 'Phiếu Thu', amount: paidAmount, category: 'Thu tiền khách hàng', payerGroup: 'Khách hàng', payer: customer === 'Khách lẻ' ? '' : customer, method: payment === 'qr' ? 'Chuyển khoản' : 'Tiền mặt', branch: 'Mộc Store · Quận 1', creator: 'Thu ngân A', date, note: `Thanh toán hóa đơn ${invoiceCode} · ${table} · ${itemSummary}${note ? ` · ${note}` : ''}` })
    if (order.queuedForSync) setQueuedOrders((current) => [order.orderCode, ...current])
    setReceipt(order.orderCode)
    setPayment(null)
    nextOrder()
    clear()
  }

  const beginPayment = (kind: 'cash' | 'qr') => {
    if (items.length > 0) setPayment(kind)
  }

  const syncDemoQueue = async () => {
    setSyncing(true)
    const count = await simulateOfflineOrderSync()
    setQueuedOrders([])
    setSyncing(false)
    setReceipt(count > 0 ? `${count} đơn demo đã được xóa khỏi hàng chờ cục bộ` : 'Không có đơn cần đồng bộ')
  }

  return (
    <div className="pos-shell">
      <aside className="pos-sidebar">
        <button className="pos-brand" type="button" aria-label="Về màn hình bán hàng"><span className="brand-mark">m</span></button>
        <button className="pos-side-button selected" type="button" aria-label="Bán hàng"><ShoppingBag size={19} /></button>
        <button className="pos-side-button" type="button" aria-label="Đơn hàng" onClick={() => setOrdersOpen(true)}><Clock3 size={19} /></button>
        <Link className="pos-side-button" to="/management" aria-label="Quản lý"><CreditCard size={19} /></Link>
        <div className="pos-side-bottom"><button className="pos-side-button" type="button" aria-label="Trợ giúp" title="Chọn sản phẩm, kiểm tra giỏ hàng rồi chọn phương thức thanh toán."><CircleHelp size={19} /></button><div className="avatar">CH</div></div>
      </aside>

      <main className="pos-catalog">
        <header className="pos-topbar"><div className="pos-page-heading"><Link to="/management" className="pos-back" aria-label="Quay lại"><ChevronLeft size={19} /></Link><div><strong>Bán hàng POS</strong><span>Mộc Store · Quận 1</span></div></div><div className="pos-top-actions"><button className={`pos-connect ${offline ? 'disconnected' : ''}`} type="button" onClick={() => setOffline((value) => !value)}>{offline ? <WifiOff size={15} /> : <Wifi size={15} />} {offline ? 'Offline' : 'Online'}</button><span className="pos-time">05 Th11 2026</span><button className="icon-button" type="button" aria-label="Lịch sử đơn" onClick={() => setOrdersOpen(true)}><Clock3 size={18} /></button><span className="pos-mobile-avatar">CH</span></div></header>

        {offline && <section className="offline-banner"><span className="offline-symbol"><WifiOff size={18} /></span><div><strong>POS vẫn hoạt động khi offline</strong><p>Đơn hàng sẽ được lưu trên thiết bị và đồng bộ khi có kết nối.</p></div><span className="offline-queue-count">{queuedOrders.length} đơn chờ đồng bộ</span></section>}
        {!offline && queuedOrders.length > 0 && <section className="sync-banner"><span><ArrowDownToLine size={16} /> {queuedOrders.length} đơn đang chờ xử lý · dữ liệu demo lưu trên thiết bị</span><button type="button" disabled={syncing} onClick={syncDemoQueue}>{syncing ? 'Đang xử lý...' : 'Mô phỏng đồng bộ'}</button></section>}

        <div className="catalog-heading"><div><h1>Chọn sản phẩm</h1><p>Chạm vào sản phẩm để thêm vào đơn hàng</p></div><button className="catalog-action" type="button" onClick={() => setOrdersOpen(true)}><Clock3 size={16} /> Đơn gần đây</button></div>
        <label className="pos-search"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm sản phẩm, SKU hoặc quét barcode..." /><kbd>⌘ K</kbd></label>
        <div className="category-tabs" role="tablist" aria-label="Danh mục sản phẩm">{categories.map((item) => <button key={item} type="button" role="tab" aria-selected={category === item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div>
        <div className="products-grid">{visibleProducts.map((product) => <ProductCard key={product.id} product={product} onAdd={add} />)}</div>
        {visibleProducts.length === 0 && <div className="empty-state product-empty"><Search size={24} /><strong>Không có sản phẩm phù hợp</strong><span>Kiểm tra từ khóa tìm kiếm hoặc danh mục.</span></div>}
      </main>

      <aside className={`cart-panel ${cartExpanded ? 'expanded' : ''}`}>
        <div className="mobile-cart-handle" />
        <div className="cart-header"><button className="cart-title-button" type="button" onClick={() => setCartExpanded((expanded) => !expanded)} aria-expanded={cartExpanded}><div><h2 className="cart-title-desktop">{orderCode}: {table}</h2><h2 className="cart-title-mobile">{orderCode}: {table}</h2><p className="cart-count-desktop">{items.reduce((totalCount, item) => totalCount + item.quantity, 0)} sản phẩm</p><p className="cart-items-mobile">{items.map(({ product, quantity }) => `${product.name} ×${quantity}`).join('  ·  ') || 'Chọn sản phẩm để bắt đầu'}</p></div><ChevronDown size={17} className="mobile-cart-chevron" /></button><button className="cart-clear" type="button" onClick={clear} disabled={items.length === 0}><Trash2 size={16} /> Xóa</button></div>
        <div className="mobile-cart-summary"><div><span>Tổng thanh toán</span><strong>{formatCurrency(total)}</strong></div><button type="button" disabled={!items.length} onClick={() => setPaymentOptionsOpen(true)}>Thanh toán</button></div>
        <div className="order-type"><span className="order-type-icon"><ShoppingBag size={15} /></span><span>Đơn hàng {orderCode}</span><span className="order-type-mode">Bán tại quầy</span></div>
        <div className="cart-metadata"><label>Khách hàng<input list="pos-customer-list" value={customer} onChange={(event) => setCustomer(event.target.value)} /><datalist id="pos-customer-list">{customers.map((item) => <option key={item} value={item} />)}</datalist></label><label>Phòng / bàn<select value={table} onChange={(event) => setTable(event.target.value)}>{rooms.map((room) => <option key={room}>{room}</option>)}</select></label></div>
        <div className="cart-lines">{items.map(({ product, quantity }) => <CartItem key={product.id} product={product} quantity={quantity} onChange={setQuantity} onRemove={remove} />)}{items.length === 0 && <div className="cart-empty"><span className="cart-empty-icon"><ShoppingBag size={22} /></span><strong>Đơn hàng đang trống</strong><p>Chọn sản phẩm để bắt đầu tạo đơn.</p></div>}</div>
        <div className="cart-note"><label htmlFor="order-note">Ghi chú đơn hàng</label><textarea id="order-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Thêm ghi chú..." rows={2} /></div>
        <div className="discount-row"><span>Giảm giá</span><label><input type="number" min="0" max={subtotal} value={discount || ''} onChange={(event) => setDiscount(Math.min(subtotal, Number(event.target.value) || 0))} placeholder="0" /><span>₫</span></label></div>
        <div className="totals"><div><span>Tạm tính</span><strong>{formatCurrency(subtotal)}</strong></div>{discount > 0 && <div><span>Giảm giá</span><strong className="discount-amount">−{formatCurrency(discount)}</strong></div>}<div className="total-line"><strong>Tổng thanh toán</strong><strong>{formatCurrency(total)}</strong></div></div>
        <div className="payment-actions"><button className="pay-cash" type="button" disabled={!items.length} onClick={() => beginPayment('cash')}><Banknote size={18} /> Tiền mặt</button><button className="pay-qr" type="button" disabled={!items.length} onClick={() => beginPayment('qr')}><QrCode size={18} /> Thanh toán QR</button></div>
        <p className="qr-hint">QR được tạo qua webhook khi thiết bị online.</p>
      </aside>

      {payment && <PaymentDialog kind={payment} total={total} offline={offline} onClose={() => setPayment(null)} onPay={pay} />}
      {paymentOptionsOpen && <PaymentOptions onClose={() => setPaymentOptionsOpen(false)} onSelect={(kind) => { setPaymentOptionsOpen(false); beginPayment(kind) }} />}
      {receipt && <div className="modal-backdrop" role="presentation"><section className="modal-card receipt-card" role="dialog" aria-modal="true"><button className="modal-close" type="button" aria-label="Đóng" onClick={() => setReceipt('')}><X size={18} /></button><span className="receipt-check"><Check size={22} /></span><h2>{offline ? 'Đơn hàng đã lưu offline' : 'Đơn demo đã xử lý'}</h2><p>{offline ? <>Mã đơn <strong>#{receipt}</strong> · Đang chờ đồng bộ cục bộ</> : receipt.startsWith('MOC-') ? <>Mã đơn <strong>#{receipt}</strong></> : receipt}</p><small className="receipt-demo-note">Đang dùng dữ liệu demo; chưa kết nối API backend.</small><button className="button button-primary receipt-done" type="button" onClick={() => setReceipt('')}>Hoàn tất</button></section></div>}
      {ordersOpen && <OrdersDialog onClose={() => setOrdersOpen(false)} />}
    </div>
  )
}

function appendManagementRecord(moduleId: string, prefix: string, digits: number, values: ManagementRow) {
  const module = managementModules.find((item) => item.id === moduleId)
  if (!module) return ''
  const key = `fnb-management:${moduleId}`
  let rows = module.rows
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (Array.isArray(saved)) rows = saved as ManagementRow[]
  } catch { /* use the bundled demo records */ }
  const highest = rows.reduce((max, row) => {
    const savedCode = String(row.code ?? '')
    const number = Number(savedCode.startsWith(prefix) ? savedCode.slice(prefix.length) : '')
    return Number.isFinite(number) ? Math.max(max, number) : max
  }, 0)
  const code = `${prefix}${String(highest + 1).padStart(digits, '0')}`
  localStorage.setItem(key, JSON.stringify([{ ...values, code, __id: crypto.randomUUID() }, ...rows]))
  return code
}

function PaymentOptions({ onClose, onSelect }: { onClose: () => void; onSelect: (kind: 'cash' | 'qr') => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="modal-card payment-options-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-options-title"><button className="modal-close" type="button" onClick={onClose} aria-label="Đóng"><X size={18} /></button><h2 id="payment-options-title">Chọn phương thức thanh toán</h2><p>Chọn cách khách sẽ thanh toán đơn hàng.</p><div className="payment-option-buttons"><button type="button" onClick={() => onSelect('cash')}><Banknote size={19} /><span>Tiền mặt</span></button><button type="button" onClick={() => onSelect('qr')}><QrCode size={19} /><span>QR chuyển khoản</span></button></div></section></div>
}

function OrdersDialog({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = useState<(typeof recentOrders)[number] | null>(null)
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="modal-card orders-dialog" role="dialog" aria-modal="true" aria-labelledby="recent-orders-title">
    <button className="modal-close" type="button" aria-label="Đóng" onClick={onClose}><X size={18} /></button><span className="modal-icon"><Clock3 size={19} /></span><h2 id="recent-orders-title">Đơn hàng gần đây</h2><p>Các đơn gần nhất trong dữ liệu demo.</p>
    <div className="recent-order-list">{recentOrders.map((order) => <button className="recent-order-row" key={order.code} type="button" onClick={() => setSelected(order)}><div><strong>#{order.code}</strong><span>{order.time} · {order.method}</span></div><strong>{formatCurrency(order.amount)}</strong></button>)}</div>
    {selected && <div className="invoice-detail-panel"><div><strong>Hóa đơn #{selected.code}</strong><button type="button" aria-label="Đóng chi tiết hóa đơn" onClick={() => setSelected(null)}><X size={15} /></button></div><p><span>Thời gian</span><strong>{selected.time}</strong></p><p><span>Phương thức</span><strong>{selected.method}</strong></p><p><span>Khách cần trả</span><strong>{formatCurrency(selected.amount)}</strong></p><p><span>Trạng thái</span><strong>Đã thanh toán</strong></p></div>}
    <small className="receipt-demo-note">Chưa có kết nối API lịch sử đơn hàng.</small>
  </section></div>
}

function ProductCard({ product, onAdd }: { product: Product; onAdd: (product: Product) => void }) {
  const [optionsOpen, setOptionsOpen] = useState(false)
  const attributeOptions = (product.attributes ?? []).flatMap((attribute) => attribute.value.split(',').map((value) => ({ name: attribute.name, value: value.trim() })).filter((option) => option.value))
  const hasOptions = attributeOptions.length > 0 || (product.units?.length ?? 0) > 0
  const selectOptions = (attributeValue?: { name: string; value: string }, unit?: NonNullable<Product['units']>[number]) => {
    const suffix = [attributeValue && `${attributeValue.name} ${attributeValue.value}`, unit?.name].filter(Boolean).join(' · ')
    const price = unit ? (Number(unit.price) > 0 ? Number(unit.price) : product.price * unit.ratio) : product.price
    onAdd({ ...product, id: `${product.id}:${suffix || 'base'}`, name: suffix ? `${product.name} · ${suffix}` : product.name, sku: product.sku, price })
    setOptionsOpen(false)
  }
  return <>
    <button className="product-card" type="button" onClick={() => hasOptions ? setOptionsOpen(true) : onAdd(product)} aria-label={`Thêm ${product.name} vào đơn hàng`}>
      <ProductArtwork product={product} /><div className="product-card-info"><strong>{product.name}</strong><span>{formatCurrency(product.price)}</span></div><span className="product-add"><Plus size={16} /></span>
    </button>
    {optionsOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOptionsOpen(false) }}><section className="modal-card product-options-dialog" role="dialog" aria-modal="true" aria-label={`Tùy chọn ${product.name}`}><button className="modal-close" type="button" aria-label="Đóng" onClick={() => setOptionsOpen(false)}><X size={18} /></button><h2>{product.name}</h2><p>Chọn thuộc tính hoặc đơn vị tính</p>{attributeOptions.map((option) => <button className="product-option-button" key={`${option.name}-${option.value}`} type="button" onClick={() => selectOptions(option)}>{option.name} {option.value}<strong>{formatCurrency(product.price)}</strong></button>)}{(product.units ?? []).map((unit) => <button className="product-option-button" key={unit.name} type="button" onClick={() => selectOptions(undefined, unit)}>{unit.name} <small>{unit.ratio} đơn vị cơ bản</small><strong>{formatCurrency(Number(unit.price) > 0 ? Number(unit.price) : product.price * unit.ratio)}</strong></button>)}<button className="button button-secondary" type="button" onClick={() => selectOptions()}>Đơn vị cơ bản · {formatCurrency(product.price)}</button></section></div>}
  </>
}

function CartItem({ product, quantity, onChange, onRemove }: { product: Product; quantity: number; onChange: (id: string, quantity: number) => void; onRemove: (id: string) => void }) {
  return <div className="cart-item"><ProductArtwork product={product} compact /><div className="cart-item-body"><div className="cart-item-title"><strong>{product.name}</strong><button type="button" aria-label={`Xóa ${product.name}`} onClick={() => onRemove(product.id)}><X size={14} /></button></div><div className="cart-item-bottom"><span>{formatCurrency(product.price)}</span><div className="quantity-control"><button type="button" aria-label="Giảm số lượng" onClick={() => onChange(product.id, quantity - 1)}><Minus size={12} /></button><strong>{quantity}</strong><button type="button" aria-label="Tăng số lượng" onClick={() => onChange(product.id, quantity + 1)}><Plus size={12} /></button></div></div></div></div>
}

function PaymentDialog({ kind, total, offline, onClose, onPay }: { kind: 'cash' | 'qr'; total: number; offline: boolean; onClose: () => void; onPay: (received: number) => Promise<void> }) {
  const [received, setReceived] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const change = Math.max(0, (Number(received) || 0) - total)
  const confirm = async () => {
    setBusy(true)
    setError('')
    try {
      await onPay(kind === 'cash' ? Number(received) : total)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tạo đơn hàng.')
      setBusy(false)
    }
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="modal-card payment-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-title">
    <button className="modal-close" type="button" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
    <span className="modal-icon">{kind === 'cash' ? <Banknote size={19} /> : <QrCode size={19} />}</span><h2 id="payment-title">{kind === 'cash' ? 'Thanh toán tiền mặt' : 'Thanh toán bằng QR'}</h2><p>Đơn hàng tại Mộc Store · Quận 1</p>
    <div className="payment-amount"><span>Khách cần thanh toán</span><strong>{formatCurrency(total)}</strong></div>
    {kind === 'cash' ? <><label className="form-label">Tiền khách đưa<input type="number" min="0" value={received} onChange={(event) => setReceived(event.target.value)} placeholder="Nhập số tiền" /></label><div className="change-line"><span>Tiền thừa</span><strong>{formatCurrency(change)}</strong></div></> : <><div className="qr-placeholder"><QrCode size={112} strokeWidth={1.2} /><span>QR thanh toán</span></div><div className="qr-payment-status"><span className={`status-pulse ${offline ? 'paused' : ''}`} />{offline ? 'QR khả dụng khi có kết nối internet' : 'Đang chờ xác nhận thanh toán'}</div></>}
    {offline && kind === 'qr' && <p className="form-error" role="status">Không thể xác nhận thanh toán QR khi thiết bị offline.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions"><button className="button button-secondary" type="button" disabled={busy} onClick={onClose}>Hủy</button><button className="button button-primary" type="button" disabled={busy || (offline && kind === 'qr') || (kind === 'cash' && Number(received) < total)} onClick={confirm}>{busy ? 'Đang xử lý...' : offline ? 'Lưu đơn hàng' : kind === 'cash' ? 'Xác nhận thanh toán' : 'Xác nhận đã nhận tiền'}</button></div>
  </section></div>
}
