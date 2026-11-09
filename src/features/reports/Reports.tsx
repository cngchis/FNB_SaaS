import { useState, type FormEvent } from 'react'
import { ArrowDownRight, ArrowUpRight, CalendarDays, Check, Download, Wallet, X } from 'lucide-react'
import { formatCurrency } from '../../services/mockData'

type ReportId = 'end-of-day' | 'sales' | 'goods' | 'finance'
type ReportRow = { label: string; detail: string; value: string; tone?: 'positive' | 'negative' }
type ReportDefinition = {
  title: string
  description: string
  chartTitle: string
  metrics: { label: string; value: string; detail: string; direction?: 'up' | 'down' }[]
  values: number[]
  periods: string[]
  columns: [string, string, string]
  rows: ReportRow[]
}

const definitions: Record<ReportId, ReportDefinition> = {
  'end-of-day': {
    title: 'Báo cáo cuối ngày', description: 'Đối soát doanh thu, phương thức thanh toán và tiền quỹ trong ngày.', chartTitle: 'Tổng kết giao dịch hôm nay',
    metrics: [{ label: 'Doanh thu thuần', value: '12.850.000 ₫', detail: '186 đơn hàng', direction: 'up' }, { label: 'Tiền mặt', value: '7.967.000 ₫', detail: '62% doanh thu' }, { label: 'Chuyển khoản QR', value: '4.883.000 ₫', detail: '38% doanh thu' }, { label: 'Chênh lệch quỹ', value: '0 ₫', detail: 'Đã đối soát' }],
    values: [34, 42, 51, 45, 59, 53, 71, 62, 83, 67, 77, 90], periods: ['08h', '09h', '10h', '11h', '12h', '13h', '14h', '15h', '16h', '17h', '18h', '19h'],
    columns: ['Phương thức', 'Số giao dịch', 'Tổng tiền'], rows: [{ label: 'Tiền mặt', detail: 'Thu tại quầy', value: '7.967.000 ₫' }, { label: 'Chuyển khoản QR', detail: 'VietQR · 71 giao dịch', value: '4.883.000 ₫' }, { label: 'Hoàn tiền', detail: '2 yêu cầu được duyệt', value: '−120.000 ₫', tone: 'negative' }],
  },
  sales: {
    title: 'Báo cáo bán hàng', description: 'Phân tích doanh thu, số đơn hàng và giá trị bán theo thời gian.', chartTitle: 'Doanh thu theo ngày',
    metrics: [{ label: 'Tổng doanh thu', value: '86.420.000 ₫', detail: 'Tháng 11/2026', direction: 'up' }, { label: 'Đơn hàng', value: '1.284', detail: 'Tăng 8,2%', direction: 'up' }, { label: 'Giá trị trung bình', value: '67.305 ₫', detail: 'Mỗi hóa đơn' }, { label: 'Khách hàng', value: '986', detail: 'Khách đã mua' }],
    values: [44, 52, 47, 65, 58, 73, 68, 83, 76, 62, 90, 78], periods: ['01', '03', '05', '07', '09', '11', '13', '15', '17', '19', '21', '23'],
    columns: ['Nhóm sản phẩm', 'Số lượng bán', 'Doanh thu'], rows: [{ label: 'Cà phê', detail: '42% doanh số', value: '36.296.400 ₫' }, { label: 'Trà', detail: '31% doanh số', value: '26.790.200 ₫' }, { label: 'Bánh', detail: '18% doanh số', value: '15.555.600 ₫' }, { label: 'Retail SKU', detail: '9% doanh số', value: '7.777.800 ₫' }],
  },
  goods: {
    title: 'Báo cáo hàng hóa', description: 'Theo dõi tồn kho, luân chuyển và giá trị hàng hóa.', chartTitle: 'Xuất nhập kho trong tuần',
    metrics: [{ label: 'Tổng SKU', value: '248', detail: 'Đang kinh doanh' }, { label: 'Giá trị tồn kho', value: '86.420.000 ₫', detail: 'Theo giá vốn' }, { label: 'Sắp hết hàng', value: '12 SKU', detail: 'Cần nhập thêm', direction: 'down' }, { label: 'Hao hụt', value: '0,8%', detail: 'Trong tháng này' }],
    values: [54, 32, 63, 46, 74, 51, 82, 59, 68, 44, 90, 64], periods: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN', '', '', '', '', ''],
    columns: ['Sản phẩm', 'Tồn kho', 'Tình trạng'], rows: [{ label: 'Cà phê sữa', detail: 'CF-001 · Nguyên liệu', value: '46 kg' }, { label: 'Trà đào cam sả', detail: 'TR-004 · Nguyên liệu', value: '32 l' }, { label: 'Ly giữ nhiệt', detail: 'RT-001 · Retail SKU', value: '4 cái', tone: 'negative' }, { label: 'Croissant', detail: 'BK-001 · Thành phẩm', value: '12 cái' }],
  },
  finance: {
    title: 'Báo cáo tài chính', description: 'Tổng hợp doanh thu, giá vốn, chi phí và lợi nhuận.', chartTitle: 'Thu chi theo ngày',
    metrics: [{ label: 'Doanh thu', value: '86.420.000 ₫', detail: 'Tháng 11/2026', direction: 'up' }, { label: 'Giá vốn', value: '31.111.200 ₫', detail: '36% doanh thu' }, { label: 'Chi phí vận hành', value: '18.460.000 ₫', detail: 'Trong tháng' }, { label: 'Lợi nhuận gộp', value: '36.848.800 ₫', detail: 'Biên lợi nhuận 42,6%', direction: 'up' }],
    values: [42, 50, 41, 64, 58, 75, 61, 79, 70, 85, 72, 92], periods: ['01', '03', '05', '07', '09', '11', '13', '15', '17', '19', '21', '23'],
    columns: ['Khoản mục', 'Loại', 'Số tiền'], rows: [{ label: 'Doanh thu bán hàng', detail: '1.284 hóa đơn', value: '86.420.000 ₫', tone: 'positive' }, { label: 'Giá vốn hàng bán', detail: '36% doanh thu', value: '−31.111.200 ₫', tone: 'negative' }, { label: 'Chi phí vận hành', detail: 'Nhân sự, mặt bằng, điện nước', value: '−18.460.000 ₫', tone: 'negative' }, { label: 'Lợi nhuận gộp', detail: 'Biên lợi nhuận 42,6%', value: '36.848.800 ₫', tone: 'positive' }],
  },
}

export function Reports({ reportId }: { reportId: ReportId }) {
  const report = definitions[reportId]
  const [period, setPeriod] = useState('Tháng này')
  const [chestAmount, setChestAmount] = useState('')
  const [closeDialog, setCloseDialog] = useState(false)
  const [closed, setClosed] = useState(false)
  const [notice, setNotice] = useState('')
  const reportTotal = reportId === 'goods' ? '248 SKU' : reportId === 'finance' ? '36.848.800 ₫' : reportId === 'sales' ? '86.420.000 ₫' : '12.850.000 ₫'
  const cashDifference = (Number(chestAmount) || 0) - 7967000

  const exportCsv = () => {
    const rows = [[report.columns[0], report.columns[1], report.columns[2]], ...report.rows.map((row) => [row.label, row.detail, row.value])]
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${reportId}-${period.toLocaleLowerCase('vi').replaceAll(' ', '-')}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }
  const closeShift = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setClosed(true)
    setCloseDialog(false)
    setNotice('Đã ghi nhận đối soát ca trong dữ liệu demo.')
    window.setTimeout(() => setNotice(''), 2800)
  }

  return <section className="reports-page">
    <div className="page-title-row"><div><div className="record-breadcrumb">Báo cáo <span>/</span> {report.title}</div><h1>{report.title}</h1><p>{report.description}</p></div><div className="report-actions"><label className="report-period"><CalendarDays size={15} /><select value={period} onChange={(event) => setPeriod(event.target.value)}><option>Hôm nay</option><option>7 ngày qua</option><option>Tháng này</option><option>Tháng trước</option></select></label><button className="button button-secondary" type="button" onClick={exportCsv}><Download size={15} /> Xuất báo cáo</button>{reportId === 'end-of-day' && <button className="button button-primary" type="button" disabled={closed} onClick={() => setCloseDialog(true)}><Check size={15} /> {closed ? 'Đã chốt ca' : 'Chốt ca'}</button>}</div></div>
    {reportId === 'end-of-day' && <div className="report-shift-banner"><div className="report-shift-icon"><Wallet size={18} /></div><div><strong>{closed ? 'Ca đã được đối soát' : 'Ca sáng · 07:00 – 15:00'}</strong><span>{closed ? 'Số liệu được lưu trong bản demo cục bộ.' : 'Nhân viên: Trần Thu Hà · Mở ca lúc 07:02'}</span></div><b>{closed ? 'Đã chốt' : 'Đang mở'}</b></div>}
    <div className="report-metrics">{report.metrics.map((metric) => <article className="report-metric" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small className={metric.direction === 'down' ? 'negative' : metric.direction === 'up' ? 'positive' : ''}>{metric.direction === 'down' ? <ArrowDownRight size={12} /> : metric.direction === 'up' ? <ArrowUpRight size={12} /> : null}{metric.detail}</small></article>)}</div>
    <div className="report-layout"><article className="panel report-chart-panel"><div className="panel-header"><div><h2>{report.chartTitle}</h2><p>{period} · Mộc Store, Quận 1</p></div><div className="report-chart-legend"><i />{reportId === 'goods' ? 'Số lượng xuất' : reportId === 'finance' ? 'Thu vào' : 'Doanh thu'}</div></div><div className="report-chart"><div className="report-chart-scale"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0</span></div><div className="report-chart-area">{[0, 1, 2, 3, 4].map((value) => <i className="report-grid-line" key={value} style={{ top: `${value * 25}%` }} />)}<div className="report-bars">{report.values.map((value, index) => <div className={`report-bar ${index === report.values.length - 3 ? 'highlight' : ''}`} key={index} title={`${report.periods[index] ?? ''}: ${value}%`}><i style={{ height: `${value}%` }} /><span>{report.periods[index]}</span></div>)}</div></div></div></article>
      <article className="panel report-breakdown"><div className="panel-header"><div><h2>{reportId === 'goods' ? 'Tình trạng tồn kho' : reportId === 'finance' ? 'Cơ cấu tài chính' : 'Tổng quan kỳ báo cáo'}</h2><p>Số liệu đã tổng hợp</p></div></div><div className="report-total"><strong>{reportTotal}</strong><span>{reportId === 'goods' ? 'Tổng sản phẩm đang quản lý' : reportId === 'finance' ? 'Lợi nhuận gộp trong kỳ' : 'Tổng giá trị ghi nhận'}</span></div>{report.rows.slice(0, 3).map((row, index) => <div className="report-breakdown-row" key={row.label}><span className={`legend-dot legend-${index}`} /><span>{row.label}</span><strong>{row.value}</strong></div>)}</article>
    </div>
    <article className="panel report-detail-panel"><div className="panel-header"><div><h2>{reportId === 'goods' ? 'Tồn kho cần chú ý' : reportId === 'finance' ? 'Chi tiết thu chi' : 'Chi tiết theo khoản mục'}</h2><p>{report.rows.length} khoản mục trong {period.toLocaleLowerCase('vi')}</p></div><span className="report-updated">Cập nhật vừa xong</span></div><div className="table-scroll"><table className="data-table report-table"><thead><tr>{report.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{report.rows.map((row) => <tr key={row.label}><td><strong>{row.label}</strong><small>{row.detail}</small></td><td>{row.tone === 'negative' ? (reportId === 'goods' ? <span className="status-badge low"><i />Sắp hết</span> : 'Chi phí / hoàn tiền') : reportId === 'goods' ? 'Đang kinh doanh' : reportId === 'finance' ? 'Thu vào' : row.detail}</td><td className={`report-value ${row.tone ?? ''}`}>{row.value}</td></tr>)}</tbody></table></div></article>
    {notice && <div className="toast" role="status"><span className="toast-check">✓</span>{notice}</div>}
    {closeDialog && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCloseDialog(false) }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="close-shift-title"><button className="modal-close" type="button" onClick={() => setCloseDialog(false)} aria-label="Đóng"><X size={18} /></button><span className="modal-icon"><Wallet size={18} /></span><h2 id="close-shift-title">Đối soát và chốt ca</h2><p>Nhập số tiền mặt thực tế trong két để so với doanh thu hệ thống.</p><div className="shift-reconciliation"><span>Tiền mặt theo hệ thống</span><strong>7.967.000 ₫</strong></div><form onSubmit={closeShift}><label className="form-label">Tiền mặt thực tế<input type="number" min="0" value={chestAmount} onChange={(event) => setChestAmount(event.target.value)} placeholder="Nhập số tiền kiểm đếm" required /></label><div className="shift-reconciliation"><span>Chênh lệch quỹ</span><strong className={cashDifference === 0 ? '' : 'report-value negative'}>{formatCurrency(Math.abs(cashDifference))}{cashDifference < 0 ? ' thiếu' : cashDifference > 0 ? ' thừa' : ' khớp'}</strong></div><div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => setCloseDialog(false)}>Hủy</button><button className="button button-primary" type="submit">Xác nhận chốt ca</button></div></form></section></div>}
  </section>
}

