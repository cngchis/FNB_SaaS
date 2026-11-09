import { useMemo, useState } from 'react'
import { ArrowUpRight, Boxes, ChevronDown, CircleDollarSign, ClipboardCheck, MapPin, ShoppingBag, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatCurrency } from '../../services/mockData'
import { managementModules } from '../management/moduleConfig'

type Invoice = { code: string; date: string; customer: string; method: string; amount: number; due: number; status: string }

function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function toDateKey(value: string) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (match) return `${match[3]}-${match[2]}-${match[1]}`
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function readInvoices(): Invoice[] {
  try {
    const raw = localStorage.getItem('fnb-management:invoices')
    const data: unknown = raw ? JSON.parse(raw) : managementModules.find((module) => module.id === 'invoices')?.rows ?? []
    return Array.isArray(data) ? data.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null).map((row) => ({
      code: String(row.code ?? ''), date: String(row.date ?? ''), customer: String(row.customer ?? 'Khách lẻ'),
      method: String(row.method ?? 'Tiền mặt'), amount: Number(row.due ?? row.amount ?? 0), due: Number(row.due ?? row.amount ?? 0), status: String(row.status ?? 'Đã thanh toán'),
    })).filter((row) => row.code) : []
  } catch { return [] }
}

function formatSelectedDate(value: string) {
  if (!value) return 'Chọn ngày'
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return `${date.toLocaleDateString('vi-VN', { weekday: 'long' })}, ${date.toLocaleDateString('vi-VN', { day: '2-digit', month: 'short', year: 'numeric' })}`
}

export function Dashboard() {
  const [selectedDate, setSelectedDate] = useState(todayKey)
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [invoices] = useState(readInvoices)
  const dateInvoices = useMemo(() => invoices.filter((invoice) => toDateKey(invoice.date) === selectedDate), [invoices, selectedDate])
  const revenue = dateInvoices.reduce((sum, invoice) => sum + invoice.amount, 0)
  const avgOrder = dateInvoices.length ? revenue / dateInvoices.length : 0
  const hourLabels = Array.from({ length: 12 }, (_, index) => `${index + 9}h`)
  const hourlyAmounts = hourLabels.map((_, index) => dateInvoices.reduce((sum, invoice) => {
    const hour = Number(invoice.date.match(/(?:\s|T)(\d{1,2}):/)?.[1])
    return sum + (hour === index + 9 ? invoice.amount : 0)
  }, 0))
  const peakHour = Math.max(...hourlyAmounts, 1)
  const chartHeights = hourlyAmounts.map((amount) => amount ? Math.max(4, amount / peakHour * 100) : 0)
  const cashRevenue = dateInvoices.filter((invoice) => /tiền mặt/i.test(invoice.method)).reduce((sum, invoice) => sum + invoice.amount, 0)
  const transferRevenue = dateInvoices.filter((invoice) => !/tiền mặt/i.test(invoice.method)).reduce((sum, invoice) => sum + invoice.amount, 0)
  const cashShare = revenue ? Math.round(cashRevenue / revenue * 100) : 0
  const metrics = [
    { label: 'Doanh thu trong ngày', value: formatCurrency(revenue), change: 'Theo hóa đơn đã ghi nhận', icon: CircleDollarSign, positive: true },
    { label: 'Đơn hàng', value: String(dateInvoices.length), change: 'Hóa đơn trong ngày đã chọn', icon: ShoppingBag, positive: true },
    { label: 'Giá trị trung bình', value: formatCurrency(avgOrder), change: 'Doanh thu / số hóa đơn', icon: ArrowUpRight, positive: true },
    { label: 'Sản phẩm sắp hết', value: '8 SKU', change: 'Cần kiểm tra tồn kho', icon: Boxes, positive: false },
  ]
  return (
    <div className="dashboard-page">
      <div className="page-title-row">
        <div><h1>Tổng quan</h1><p>Theo dõi tình hình kinh doanh của cửa hàng</p></div>
        <div className="dashboard-date-wrap"><button className="date-select" type="button" aria-expanded={datePickerOpen} onClick={() => setDatePickerOpen((open) => !open)}>{formatSelectedDate(selectedDate)} <ChevronDown size={15} /></button>{datePickerOpen && <div className="dashboard-date-popover"><div><strong>Lọc theo ngày</strong><button type="button" aria-label="Đóng" onClick={() => setDatePickerOpen(false)}><X size={15} /></button></div><input aria-label="Chọn ngày" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /><button className="button button-secondary" type="button" onClick={() => { setSelectedDate(todayKey()); setDatePickerOpen(false) }}>Hôm nay</button></div>}</div>
      </div>
      <button className="mobile-branch-chip" type="button"><MapPin size={12} /> Chi nhánh chính <ChevronDown size={12} /></button>

      <section className="metric-grid" aria-label="Chỉ số kinh doanh">
        {metrics.map(({ label, value, change, icon: Icon, positive }) => <article className="metric-card" key={label}><div className={`metric-icon ${positive ? '' : 'warning'}`}><Icon size={18} strokeWidth={1.8} /></div><p>{label}</p><strong>{value}</strong><span className={`metric-hint ${positive ? 'positive' : 'neutral'}`}>{positive ? <ArrowUpRight size={14} /> : <ClipboardCheck size={14} />}{change}</span></article>)}
      </section>

      <section className="dashboard-panels">
        <article className="panel revenue-panel"><div className="panel-header"><div><h2>Doanh thu thuần</h2><p>Theo giờ · VND</p></div><span className="select-compact">{formatSelectedDate(selectedDate)}</span></div><div className="chart-wrap" role="img" aria-label={`Doanh thu theo giờ ngày ${formatSelectedDate(selectedDate)}`}><div className="chart-y-labels"><span>{formatCurrency(peakHour)}</span><span>{formatCurrency(peakHour * .75)}</span><span>{formatCurrency(peakHour * .5)}</span><span>{formatCurrency(peakHour * .25)}</span><span>0</span></div><div className="chart-area">{[0, 1, 2, 3, 4].map((line) => <div className="chart-grid-line" key={line} style={{ top: `${line * 25}%` }} />)}<div className="bars">{chartHeights.map((height, index) => <div key={index} className={`bar-column ${index === chartHeights.indexOf(Math.max(...chartHeights)) && hourlyAmounts[index] > 0 ? 'highlight' : ''}`} title={`${hourLabels[index]} · ${formatCurrency(hourlyAmounts[index])}`}><div style={{ height: `${height}%` }} /></div>)}</div><div className="bars bars-mobile">{[0, 2, 4, 6, 8, 10, 11].map((index, barIndex) => <div key={index} className={`bar-column ${barIndex === 5 && hourlyAmounts[index] > 0 ? 'highlight' : ''}`} title={`${hourLabels[index]} · ${formatCurrency(hourlyAmounts[index])}`}><div style={{ height: `${chartHeights[index]}%` }} /></div>)}</div><div className="chart-x-labels">{hourLabels.map((hour) => <span key={hour}>{hour}</span>)}</div><div className="chart-x-labels chart-x-labels-mobile">{[0, 2, 4, 6, 8, 10, 11].map((index) => <span key={index}>{hourLabels[index]}</span>)}</div></div></div></article>
        <article className="panel payment-panel"><div className="panel-header"><div><h2>Phương thức thanh toán</h2><p>Tỷ trọng doanh thu · {formatSelectedDate(selectedDate)}</p></div></div><div className="payment-summary"><div className="donut-chart" style={{ background: `conic-gradient(var(--chart-forest) 0deg ${cashShare * 3.6}deg, var(--chart-carrot) ${cashShare * 3.6}deg 360deg)` }}><div><strong>{formatCurrency(revenue)}</strong><small>Tổng doanh thu</small></div></div></div><div className="payment-legend"><div><span className="legend-dot cash" /><span>Tiền mặt</span><strong>{cashShare}%</strong><small>{formatCurrency(cashRevenue)}</small></div><div><span className="legend-dot qr" /><span>Chuyển khoản / QR</span><strong>{100 - cashShare}%</strong><small>{formatCurrency(transferRevenue)}</small></div></div></article>
      </section>

      <section className="panel orders-panel"><div className="panel-header"><div><h2>Đơn hàng gần đây</h2><p>Hóa đơn trong ngày đã chọn</p></div><Link className="text-link" to="/management/invoices">Xem tất cả <ArrowUpRight size={15} /></Link></div><div className="table-scroll"><table className="data-table orders-table"><thead><tr><th>Mã đơn</th><th>Thời gian</th><th>Khách hàng</th><th>Thanh toán</th><th>Tổng tiền</th><th>Trạng thái</th></tr></thead><tbody>{dateInvoices.map((order) => <tr key={order.code}><td className="code-cell">#{order.code}</td><td>{order.date}</td><td>{order.customer}</td><td>{order.method}</td><td className="amount-cell">{formatCurrency(order.amount)}</td><td><span className="status-badge paid"><i />{order.status}</span></td></tr>)}</tbody></table></div>{!dateInvoices.length && <div className="empty-state"><ShoppingBag size={23} /><strong>Chưa có hóa đơn trong ngày này</strong><span>Chọn ngày khác hoặc tạo hóa đơn từ POS.</span></div>}</section>
    </div>
  )
}
