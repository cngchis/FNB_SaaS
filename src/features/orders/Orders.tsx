import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { formatCurrency, recentOrders } from '../../services/mockData'

const filters = ['Tất cả', 'Chờ thanh toán', 'Đã thanh toán']

export function Orders() {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('Tất cả')
  const visibleOrders = useMemo(() => recentOrders.filter((order) => {
    const matchesQuery = `${order.code} ${order.customer}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi'))
    return matchesQuery && (filter === 'Tất cả' || order.status === filter)
  }), [filter, query])

  return <section className="orders-page">
    <div className="page-title-row"><div><h1>Đơn hàng</h1><p>Theo dõi thanh toán và trạng thái đơn</p></div></div>
    <label className="search-field orders-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm mã đơn hoặc khách hàng" /></label>
    <div className="order-status-tabs" role="tablist" aria-label="Lọc trạng thái đơn hàng">
      {filters.map((item) => <button key={item} type="button" role="tab" aria-selected={filter === item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}
    </div>
    <div className="management-order-list" aria-live="polite">
      {visibleOrders.map((order) => <article className="management-order-card" key={order.code}>
        <div className="management-order-main"><strong>#{order.code}</strong><b>{formatCurrency(order.amount)}</b></div>
        <div className="management-order-meta"><span>{order.time} · {order.method}</span><span className={`order-state ${order.status === 'Đã thanh toán' ? 'paid' : 'pending'}`}>{order.status}</span></div>
      </article>)}
      {visibleOrders.length === 0 && <div className="empty-state"><Search size={22} /><strong>Không tìm thấy đơn hàng</strong><span>Thử mã đơn hoặc trạng thái khác.</span></div>}
    </div>
  </section>
}
