import { formatCurrency } from '../services/mockData'
import { paymentName, type ReportDTO } from './reports'

type Metric = { label: string; value: string; detail: string; direction?: 'up' | 'down' }
type Row = { label: string; detail: string; value: string; tone?: 'positive' | 'negative' }
type Presentation = { metrics: Metric[]; rows: Row[]; periods: string[]; values: number[] }
const money = (value: number | null | undefined) => value == null ? '—' : formatCurrency(value)

// Copy and structure stay in the existing screen; this adapter supplies server values.
export function presentReport(id: string, data: ReportDTO | undefined, period: string, template: Presentation): Presentation {
  const s = data?.summary
  const flow = data?.flow
  const payments = data?.payments ?? []
  const received = payments.reduce((total, row) => total + row.amount_vnd, 0)
  const cash = payments.filter((row) => row.method === 'cash').reduce((total, row) => total + row.amount_vnd, 0)
  const bank = payments.filter((row) => ['bank_transfer', 'qr'].includes(row.method)).reduce((total, row) => total + row.amount_vnd, 0)
  let values: (number | null | undefined)[] = []
  let details: string[] = []
  let rows: Row[] = []
  if (id === 'sales') {
    values = [s?.revenue_vnd, s?.invoice_count, s ? Math.round(s.revenue_vnd / (s.invoice_count || 1)) : undefined, s?.customer_count]
    details = [period, s ? `${s.invoice_count} hóa đơn` : '—', 'Mỗi hóa đơn', 'Khách đã mua']
    rows = (data?.groups ?? []).map((row) => ({ label: row.label, detail: String(row.quantity), value: money(row.revenue_vnd) }))
  } else if (id === 'finance') {
    values = [s?.revenue_vnd, s?.cost_vnd, flow?.operating_expense_vnd, s?.profit_vnd]
    details = [period, s?.cost_vnd == null ? '—' : money(s.cost_vnd), period, s?.profit_vnd == null ? '—' : `${s.revenue_vnd ? Math.round(s.profit_vnd/s.revenue_vnd*100) : 0}%`]
    rows = [{ label: template.rows[0].label, detail: `${s?.invoice_count ?? '—'} hóa đơn`, value: money(s?.revenue_vnd), tone: 'positive' }, { label: template.rows[1].label, detail: '—', value: money(s?.cost_vnd), tone: 'negative' }, { label: template.rows[2].label, detail: period, value: money(flow?.operating_expense_vnd), tone: 'negative' }, { label: template.rows[3].label, detail: details[3], value: money(s?.profit_vnd), tone: 'positive' }]
  } else {
    values = [s?.revenue_vnd, data ? cash : undefined, data ? bank : undefined, null]
    details = [s ? `${s.invoice_count} hóa đơn` : '—', received ? `${Math.round(cash/received*100)}%` : '0%', received ? `${Math.round(bank/received*100)}%` : '0%', '—']
    rows = payments.map((row) => ({ label: paymentName(row.method), detail: String(row.count), value: money(row.amount_vnd) }))
  }
  return {
    metrics: template.metrics.map((metric, index) => ({ ...metric, value: id === 'sales' && [1,3].includes(index) ? values[index] == null ? '—' : String(values[index]) : money(values[index]), detail: details[index] })),
    rows,
    periods: (data?.series ?? []).map((row) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', ...(period === 'Hôm nay' ? { hour: '2-digit', hour12: false } : { day: '2-digit', month: '2-digit' }) }).format(new Date(row.at))),
    values: (data?.series ?? []).map((row) => id === 'finance' ? row.income_vnd : id === 'end-of-day' ? row.payment_count : row.revenue_vnd),
  }
}

// Split nullable series into segments so unknown cost never becomes a zero-cost point.
export function nullableLinePoints(values: (number | null)[], min: number, max: number) {
  const segments: string[][] = [[]]
  values.forEach((value, index) => {
    if (value == null) { if (segments.at(-1)!.length) segments.push([]); return }
    segments.at(-1)!.push(`${index / Math.max(1, values.length - 1) * 100},${100 - (value-min)/Math.max(1,max-min)*100}`)
  })
  return segments.filter((segment) => segment.length > 0).map((segment) => segment.join(' '))
}
