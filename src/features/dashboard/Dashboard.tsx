import { ArrowUpRight, Boxes, ChevronDown, CircleDollarSign, ClipboardCheck, MapPin, ShoppingBag } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatCurrency, hourlyRevenue, recentOrders } from '../../services/mockData'

const metrics = [
  { label: 'Doanh thu hôm nay', value: '12.850.000 ₫', change: '12,8% so với hôm qua', icon: CircleDollarSign, positive: true },
  { label: 'Đơn hàng', value: '186', change: '8,2% so với hôm qua', icon: ShoppingBag, positive: true },
  { label: 'Giá trị trung bình', value: '69.086 ₫', change: '3,4% so với hôm qua', icon: ArrowUpRight, positive: true },
  { label: 'Sản phẩm sắp hết', value: '8 SKU', change: 'Cần kiểm tra tồn kho', icon: Boxes, positive: false },
]

export function Dashboard() {
  return (
    <div className="dashboard-page">
      <div className="page-title-row">
        <div><h1>Tổng quan</h1><p>Theo dõi tình hình kinh doanh của cửa hàng</p></div>
        <button className="date-select" type="button">Hôm nay, 05 Th11 2026 <ChevronDown size={15} /></button>
      </div>
      <button className="mobile-branch-chip" type="button"><MapPin size={12} /> Chi nhánh chính <ChevronDown size={12} /></button>

      <section className="metric-grid" aria-label="Chỉ số kinh doanh">
        {metrics.map(({ label, value, change, icon: Icon, positive }) => (
          <article className="metric-card" key={label}>
            <div className={`metric-icon ${positive ? '' : 'warning'}`}><Icon size={18} strokeWidth={1.8} /></div>
            <p>{label}</p><strong>{value}</strong>
            <span className={`metric-hint ${positive ? 'positive' : 'neutral'}`}>{positive ? <ArrowUpRight size={14} /> : <ClipboardCheck size={14} />}{change}</span>
          </article>
        ))}
      </section>

      <section className="dashboard-panels">
        <article className="panel revenue-panel">
          <div className="panel-header"><div><h2>Doanh thu thuần</h2><p>Theo giờ · VND</p></div><button className="select-compact" type="button">7 ngày qua <ChevronDown size={14} /></button></div>
          <div className="chart-wrap" role="img" aria-label="Biểu đồ doanh thu theo giờ">
            <div className="chart-y-labels"><span>1.0M</span><span>750K</span><span>500K</span><span>250K</span><span>0</span></div>
            <div className="chart-area">
              {[0, 1, 2, 3, 4].map((line) => <div className="chart-grid-line" key={line} style={{ top: `${line * 25}%` }} />)}
              <div className="bars">{hourlyRevenue.map((height, index) => <div key={index} className={`bar-column ${index === 8 ? 'highlight' : ''}`}><div style={{ height: `${height}%` }} /></div>)}</div>
              <div className="bars bars-mobile">{[0, 2, 4, 6, 8, 10, 11].map((index, barIndex) => <div key={index} className={`bar-column ${barIndex === 5 ? 'highlight' : ''}`}><div style={{ height: `${hourlyRevenue[index]}%` }} /></div>)}</div>
              <div className="chart-x-labels">{['9h', '10h', '11h', '12h', '13h', '14h', '15h', '16h', '17h', '18h', '19h'].map((hour) => <span key={hour}>{hour}</span>)}</div>
              <div className="chart-x-labels chart-x-labels-mobile">{['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((day) => <span key={day}>{day}</span>)}</div>
            </div>
          </div>
        </article>

        <article className="panel payment-panel">
          <div className="panel-header"><div><h2>Phương thức thanh toán</h2><p>Tỷ trọng doanh thu</p></div><button className="dots-button" type="button" aria-label="Tuỳ chọn">···</button></div>
          <div className="payment-summary"><div className="donut-chart"><div><strong>12,8M</strong><small>Tổng doanh thu</small></div></div></div>
          <div className="payment-legend">
            <div><span className="legend-dot cash" /><span>Tiền mặt</span><strong>62%</strong><small>7.967.000 ₫</small></div>
            <div><span className="legend-dot qr" /><span>Chuyển khoản QR</span><strong>38%</strong><small>4.883.000 ₫</small></div>
          </div>
        </article>
      </section>

      <section className="panel orders-panel">
        <div className="panel-header"><div><h2>Đơn hàng gần đây</h2><p>Các giao dịch mới nhất tại cửa hàng</p></div><Link className="text-link" to="/management/orders">Xem tất cả <ArrowUpRight size={15} /></Link></div>
        <div className="table-scroll"><table className="data-table orders-table"><thead><tr><th>Mã đơn</th><th>Thời gian</th><th>Khách hàng</th><th>Thanh toán</th><th>Tổng tiền</th><th>Trạng thái</th></tr></thead><tbody>{recentOrders.map((order) => <tr key={order.code}><td className="code-cell">#{order.code}</td><td>{order.time}</td><td>{order.customer}</td><td>{order.method}</td><td className="amount-cell">{formatCurrency(order.amount)}</td><td><span className="status-badge paid"><i />{order.status}</span></td></tr>)}</tbody></table></div>
      </section>
    </div>
  )
}
