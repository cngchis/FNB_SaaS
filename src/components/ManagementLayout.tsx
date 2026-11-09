import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ArrowLeftRight, BarChart3, Bell, Boxes, ChevronDown, CreditCard, LayoutDashboard, Menu, MoreHorizontal, ShoppingBag, Users, Wallet, X, UserRoundCog, type LucideIcon } from 'lucide-react'

const navigationGroups = [
  { label: 'Món', icon: Menu, items: [{ to: '/management/menu-items', label: 'Danh sách món' }] },
  { label: 'Hàng hóa', icon: Boxes, items: [{ to: '/management/inventory', label: 'Danh sách hàng hóa' }, { to: '/management/stock-check', label: 'Kiểm kho' }] },
  { label: 'Nhập hàng', icon: ArrowLeftRight, items: [{ to: '/management/suppliers', label: 'Nhà cung cấp' }, { to: '/management/purchases', label: 'Nhập hàng' }] },
  { label: 'Đơn hàng', icon: ShoppingBag, items: [{ to: '/management/orders', label: 'Danh sách đơn' }, { to: '/management/invoices', label: 'Hóa đơn' }, { to: '/management/returns', label: 'Trả hàng' }, { to: '/management/rooms', label: 'Phòng / bàn' }] },
  { label: 'Khách hàng', icon: Users, items: [{ to: '/management/customers', label: 'Khách hàng' }, { to: '/management/customer-groups', label: 'Nhóm khách hàng' }] },
  { label: 'Nhân viên', icon: UserRoundCog, items: [{ to: '/management/employees', label: 'Danh sách' }, { to: '/management/schedules', label: 'Lịch làm việc' }, { to: '/management/attendance', label: 'Chấm công' }, { to: '/management/payroll', label: 'Bảng lương' }, { to: '/management/commissions', label: 'Hoa hồng' }, { to: '/management/employee-settings', label: 'Thiết lập' }] },
  { label: 'Báo cáo', icon: BarChart3, items: [{ to: '/management/reports/end-of-day', label: 'Cuối ngày' }, { to: '/management/reports/sales', label: 'Bán hàng' }, { to: '/management/reports/goods', label: 'Hàng hóa' }, { to: '/management/reports/finance', label: 'Tài chính' }] },
]

const routeTitles: Record<string, string> = {
  '/management': 'Tổng quan', '/management/inventory': 'Quản lý hàng hóa', '/management/stock-check': 'Kiểm kho', '/management/orders': 'Đơn hàng', '/management/rooms': 'Phòng / bàn', '/management/bank-accounts': 'Tài khoản ngân hàng',
  '/management/menu-items': 'Danh sách món', '/management/suppliers': 'Nhà cung cấp', '/management/purchases': 'Nhập hàng', '/management/invoices': 'Hóa đơn', '/management/returns': 'Trả hàng', '/management/customers': 'Khách hàng', '/management/customer-groups': 'Nhóm khách hàng', '/management/employees': 'Danh sách nhân viên', '/management/schedules': 'Lịch làm việc', '/management/attendance': 'Chấm công', '/management/payroll': 'Bảng lương', '/management/commissions': 'Hoa hồng', '/management/employee-settings': 'Thiết lập nhân viên', '/management/cashbook': 'Sổ quỹ', '/management/reports/end-of-day': 'Báo cáo cuối ngày', '/management/reports/sales': 'Báo cáo bán hàng', '/management/reports/goods': 'Báo cáo hàng hóa', '/management/reports/finance': 'Báo cáo tài chính',
}

export function ManagementLayout() {
  const location = useLocation()
  const activeGroup = navigationGroups.find((group) => group.items.some((item) => item.to === location.pathname))?.label
  const [moreOpen, setMoreOpen] = useState(false)
  const title = routeTitles[location.pathname] ?? 'Quản lý cửa hàng'

  return <div className="management-shell">
    <aside className="sidebar">
      <NavLink to="/management" className="brand-lockup" aria-label="Mộc Store management"><span className="brand-mark">m</span><span><strong>MỘC STORE</strong><small>RETAIL &amp; F&amp;B</small></span></NavLink>
      <div className="sidebar-rule" />
      <nav className="side-navigation" aria-label="Điều hướng quản lý">
        <div className="nav-caption">DANH MỤC</div>
        <NavLink to="/management" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><LayoutDashboard size={18} strokeWidth={1.8} /><span>Tổng quan</span></NavLink>
        {navigationGroups.slice(0, 5).map(({ label, icon: Icon, items }) => <NavigationGroup key={label} label={label} icon={Icon} items={items} active={activeGroup === label} />)}
        <NavigationGroup label="Nhân viên" icon={UserRoundCog} items={navigationGroups[5].items} active={activeGroup === 'Nhân viên'} />
        <NavLink to="/management/cashbook" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><Wallet size={18} strokeWidth={1.8} /><span>Sổ quỹ</span></NavLink>
        <NavLink to="/management/bank-accounts" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><Wallet size={18} strokeWidth={1.8} /><span>Tài khoản ngân hàng</span></NavLink>
        <NavigationGroup label="Báo cáo" icon={BarChart3} items={navigationGroups[6].items} active={activeGroup === 'Báo cáo'} />
      </nav>
      <div className="sidebar-bottom"><div className="user-card"><div className="avatar">CH</div><div><strong>Chí Hồ</strong><small>Quản lý cửa hàng</small></div><ChevronDown size={15} /></div></div>
    </aside>

    <nav className="mobile-bottom-nav" aria-label="Điều hướng di động">
      <NavLink to="/management" end className={({ isActive }) => `mobile-tab ${isActive ? 'active' : ''}`}><LayoutDashboard size={19} /><span>Tổng quan</span></NavLink>
      <NavLink to="/management/orders" className={({ isActive }) => `mobile-tab ${isActive ? 'active' : ''}`}><ShoppingBag size={19} /><span>Đơn hàng</span></NavLink>
      <NavLink to="/management/inventory" className={({ isActive }) => `mobile-tab ${isActive || location.pathname.includes('stock-check') ? 'active' : ''}`}><Boxes size={19} /><span>Kho</span></NavLink>
      <button type="button" className={`mobile-tab ${moreOpen ? 'active' : ''}`} aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)}><MoreHorizontal size={19} /><span>Thêm</span></button>
    </nav>
    {moreOpen && <div className="mobile-more-menu"><strong>Quản lý cửa hàng</strong>{navigationGroups.flatMap((group) => group.items.map((item) => <NavLink key={item.to} to={item.to} onClick={() => setMoreOpen(false)}>{item.label}</NavLink>))}<NavLink to="/management/cashbook" onClick={() => setMoreOpen(false)}>Sổ quỹ</NavLink><NavLink to="/management/bank-accounts" onClick={() => setMoreOpen(false)}>Tài khoản ngân hàng</NavLink><NavLink to="/pos" onClick={() => setMoreOpen(false)}>Mở POS</NavLink><button type="button" onClick={() => setMoreOpen(false)}><X size={15} /> Đóng menu</button></div>}

    <main className="management-main">
      <header className="topbar"><div className="topbar-heading"><span className="breadcrumb">Quản lý cửa hàng</span><strong>{title}</strong></div><div className="topbar-actions"><NavLink to="/pos" className="pos-shortcut"><CreditCard size={16} /> Mở POS</NavLink><span className="online-pill"><i /> Online</span><button className="icon-button" type="button" aria-label="Thông báo"><Bell size={18} /><i className="notification-dot" /></button><button className="branch-selector" type="button"><span className="branch-avatar">M</span><span><small>Chi nhánh</small><strong>Mộc Store · Quận 1</strong></span><ChevronDown size={15} /></button></div></header>
      <div className="page-content"><Outlet /></div>
    </main>
  </div>
}

function NavigationGroup({ label, icon: Icon, items, active }: { label: string; icon: LucideIcon; items: { to: string; label: string }[]; active: boolean }) {
  return <div className="nav-group"><button className={`nav-link nav-group-trigger ${active ? 'active' : ''}`} type="button" aria-haspopup="true"><Icon size={18} strokeWidth={1.8} /><span>{label}</span></button><div className="nav-group-items">{items.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-subitem-link ${isActive ? 'active' : ''}`}>{item.label}</NavLink>)}</div></div>
}
