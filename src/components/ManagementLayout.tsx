import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ArrowLeftRight, BarChart3, Bell, Boxes, ChevronDown, ClipboardList, CreditCard, LayoutDashboard, Menu, MoreHorizontal, ShoppingBag, Users, X } from 'lucide-react'
import { useState } from 'react'

const managementLinks = [
  { to: '/management', label: 'Tổng quan', icon: LayoutDashboard, end: true },
  { to: '/management/inventory', label: 'Hàng hóa', icon: Boxes },
  { to: '/management/stock-check', label: 'Kiểm kho', icon: ClipboardList },
]

const otherLinks = [
  { label: 'Món', icon: Menu },
  { label: 'Nhập hàng', icon: ArrowLeftRight },
  { label: 'Đơn hàng', icon: ShoppingBag },
  { label: 'Khách hàng', icon: Users },
  { label: 'Báo cáo', icon: BarChart3 },
]

export function ManagementLayout() {
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const isStockCheck = location.pathname.includes('stock-check')
  const title = location.pathname === '/management' ? 'Tổng quan' : location.pathname === '/management/orders' ? 'Đơn hàng' : isStockCheck ? 'Kiểm kho' : 'Quản lý hàng hóa'

  return (
    <div className="management-shell">
      <aside className="sidebar">
        <NavLink to="/management" className="brand-lockup" aria-label="Mộc Store management">
          <span className="brand-mark">m</span>
          <span><strong>MỘC STORE</strong><small>RETAIL & F&amp;B</small></span>
        </NavLink>
        <div className="sidebar-rule" />
        <nav className="side-navigation" aria-label="Điều hướng quản lý">
          <div className="nav-caption">DANH MỤC</div>
          {managementLinks.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link ${isActive || (isStockCheck && label === 'Hàng hóa') ? 'active' : ''}`}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
            </NavLink>
          ))}
          <div className="nav-subitem">Danh sách hàng hóa</div>
          <div className="nav-subitem">Kiểm kho</div>
          <div className="nav-divider" />
          {otherLinks.map(({ label, icon: Icon }) => (
            <button key={label} className="nav-link nav-link-muted" type="button" title={`${label} — chưa có màn hình trong thiết kế hiện tại`} disabled aria-disabled="true">
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span><ChevronDown size={14} className="nav-chevron" />
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="user-card"><div className="avatar">CH</div><div><strong>Chí Hồ</strong><small>Quản lý cửa hàng</small></div><ChevronDown size={15} /></div>
        </div>
      </aside>
      <nav className="mobile-bottom-nav" aria-label="Điều hướng di động">
        <NavLink to="/management" end className={({ isActive }) => `mobile-tab ${isActive ? 'active' : ''}`}><LayoutDashboard size={19} /><span>Tổng quan</span></NavLink>
        <NavLink to="/management/orders" className={({ isActive }) => `mobile-tab ${isActive ? 'active' : ''}`}><ShoppingBag size={19} /><span>Đơn hàng</span></NavLink>
        <NavLink to="/management/inventory" className={({ isActive }) => `mobile-tab ${isActive || isStockCheck ? 'active' : ''}`}><Boxes size={19} /><span>Kho</span></NavLink>
        <button type="button" className={`mobile-tab ${moreOpen ? 'active' : ''}`} aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)}><MoreHorizontal size={19} /><span>Thêm</span></button>
      </nav>
      {moreOpen && <div className="mobile-more-menu"><NavLink to="/management/stock-check" onClick={() => setMoreOpen(false)}><ClipboardList size={17} /> Kiểm kho</NavLink><NavLink to="/pos" onClick={() => setMoreOpen(false)}><CreditCard size={17} /> Mở POS</NavLink><button type="button" onClick={() => setMoreOpen(false)}><X size={17} /> Đóng</button></div>}
      <main className="management-main">
        <header className="topbar">
          <div className="topbar-heading"><span className="breadcrumb">Quản lý cửa hàng</span><strong>{title}</strong></div>
          <div className="topbar-actions">
            <NavLink to="/pos" className="pos-shortcut"><CreditCard size={16} /> Mở POS</NavLink>
            <span className="online-pill"><i /> Online</span>
            <button className="icon-button" type="button" aria-label="Thông báo"><Bell size={18} /><i className="notification-dot" /></button>
            <button className="branch-selector" type="button"><span className="branch-avatar">M</span><span><small>Chi nhánh</small><strong>Mộc Store · Quận 1</strong></span><ChevronDown size={15} /></button>
          </div>
        </header>
        <div className="page-content"><Outlet /></div>
      </main>
    </div>
  )
}
