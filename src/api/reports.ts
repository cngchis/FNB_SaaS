import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { request, useSessionStore } from './auth'
import { apiConfig } from './config'

const integer = z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)
const money = integer.nonnegative()
export const reportSchema = z.object({
  summary: z.object({ invoice_count: money, customer_count: money, subtotal_vnd: money, discount_vnd: money, revenue_vnd: money, paid_vnd: money, debt_vnd: money, cost_vnd: money.nullable(), profit_vnd: integer.nullable(), missing_cost_lines: money }),
  flow: z.object({ opening_vnd: integer, income_vnd: money, expense_vnd: money, closing_vnd: integer, cash_closing_vnd: integer, operating_expense_vnd: money }),
  payments: z.array(z.object({ method: z.string(), count: money, amount_vnd: money })),
  series: z.array(z.object({ at: z.iso.datetime({ offset: true }), revenue_vnd: money, cost_vnd: money.nullable(), profit_vnd: integer.nullable(), income_vnd: money, payment_count: money })),
  groups: z.array(z.object({ label: z.string(), quantity: money, revenue_vnd: money })),
  recent: z.array(z.object({ id: z.uuid(), code: z.string(), issued_at: z.iso.datetime({ offset: true }), customer: z.string(), total_vnd: money, paid_vnd: money, status: z.string(), methods: z.string() })),
})
export type ReportDTO = z.infer<typeof reportSchema>
export type ReportRange = { date_from: string; date_to: string; granularity: 'hour' | 'day' }
export const reportsRepository = {
  read: (range: ReportRange, signal?: AbortSignal) => request(`/reports/summary?${new URLSearchParams(range)}`, reportSchema, { signal }),
}
export function useReport(range: ReportRange, enabled = true) {
  const session = useSessionStore((state) => state.session)
  const scope = session ? `${session.tenant_id}:${session.store_id}:${session.user.id}` : ''
  return useQuery({ queryKey: ['api', scope, 'reports', range], enabled: !apiConfig.useMock && !!session && enabled, queryFn: ({ signal }) => reportsRepository.read(range, signal), refetchInterval: 30_000 })
}
export function businessToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const part = (type: string) => parts.find((value) => value.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
export function reportRange(period: string, now = new Date()): ReportRange {
  const today = businessToday(now)
  const [year, month, day] = today.split('-').map(Number)
  const key = (date: Date) => date.toISOString().slice(0, 10)
  if (period === 'Hôm nay') return { date_from: today, date_to: today, granularity: 'hour' }
  if (period === '7 ngày qua') return { date_from: key(new Date(Date.UTC(year, month - 1, day - 6))), date_to: today, granularity: 'day' }
  if (period === 'Tháng trước') return { date_from: key(new Date(Date.UTC(year, month - 2, 1))), date_to: key(new Date(Date.UTC(year, month - 1, 0))), granularity: 'day' }
  return { date_from: `${today.slice(0, 7)}-01`, date_to: key(new Date(Date.UTC(year, month, 0))), granularity: 'day' }
}
export function paymentName(method: string) {
  return method.split(', ').map((item) => ({ cash: 'Tiền mặt', bank_transfer: 'Chuyển khoản', qr: 'QR', other: 'Khác' })[item] ?? '—').join(' / ')
}
