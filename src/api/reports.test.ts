import { describe, expect, it } from 'vitest'
import { businessToday, reportRange, reportSchema } from './reports'
import { nullableLinePoints, presentReport } from './reportPresentation'

describe('report boundaries and missing cost', () => {
 it('uses Vietnamese dates independently of the browser timezone', () => {
  expect(businessToday(new Date('2026-11-09T17:00:00Z'))).toBe('2026-11-10')
  expect(reportRange('7 ngày qua', new Date('2026-03-01T02:00:00Z'))).toEqual({date_from:'2026-02-23',date_to:'2026-03-01',granularity:'day'})
  expect(reportRange('Tháng trước', new Date('2024-03-01T02:00:00Z')).date_to).toBe('2024-02-29')
 })
 it('splits unknown cost points instead of connecting them to zero', () => {
  expect(nullableLinePoints([10,null,20],0,20)).toEqual(['0,50','100,0'])
  expect(nullableLinePoints([null,null],0,1)).toEqual([])
  expect(nullableLinePoints([-10,10],-10,10)).toEqual(['0,100 100,0'])
 })
 it('keeps unavailable monetary metrics unknown instead of demo or zero', () => {
  const template = {metrics: ['Doanh thu','Giá vốn','Chi phí','Lợi nhuận'].map((label) => ({label,value:'DEMO',detail:'DEMO'})), rows: ['Doanh thu','Giá vốn','Chi phí','Lợi nhuận'].map((label) => ({label,value:'DEMO',detail:'DEMO'})), periods: [], values: []}
  const report = presentReport('finance', undefined, 'Tháng này', template)
  expect(report.metrics.map((metric) => metric.value)).toEqual(['—','—','—','—'])
  expect(report.values).toEqual([])
 })
 it('rejects missing or malformed server aggregates instead of supplying demo values', () => {
  expect(reportSchema.safeParse({}).success).toBe(false)
 })
})
