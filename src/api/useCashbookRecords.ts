import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import { useSessionStore } from './auth'
import { cashbookRepository, cashbookRow, voucherInput, type CashOptions } from './cashbook'
import type { ManagementRow } from '../features/management/moduleConfig'
const sorts: Record<string, string> = { code: 'code', amount: 'amount_vnd', date: 'occurred_at' }
export function useCashbookRecords(enabled: boolean, scope: string, mobile: boolean, page: number, search: string, filter: string, sort: string | null, ascending: boolean, dates: { from?: string; to?: string; cashTab?: string; branch?: string }) {
  const client = useQueryClient(); const keys = useRef(new Map<string, string>())
  const options: CashOptions = { page, page_size: 6, search, status: filter === 'Đã thanh toán' ? 'posted' : filter === 'Chưa thanh toán' ? 'pending' : undefined, method: dates.cashTab === 'Tiền mặt' ? 'cash' : dates.cashTab === 'Ngân hàng' ? 'bank' : undefined, store_id: dates.branch && dates.branch !== 'Tất cả chi nhánh' ? dates.branch : undefined, date_from: dates.from, date_to: dates.to, sort: sorts[sort ?? 'date'], direction: sort ? ascending ? 'asc' : 'desc' : 'desc' }
  const list = useQuery({ queryKey: ['api', scope, 'cashbook', options], enabled: enabled && !mobile, queryFn: ({ signal }) => cashbookRepository.list(options, signal) })
  const infinite = useInfiniteQuery({ queryKey: ['api', scope, 'cashbook', 'mobile', { ...options, page: 1 }], enabled: enabled && mobile, initialPageParam: 1, queryFn: ({ signal, pageParam }) => cashbookRepository.list({ ...options, page: pageParam }, signal), getNextPageParam: (last, _pages, number) => number < last.pagination.total_pages ? number + 1 : undefined })
  const result = mobile ? infinite.data?.pages[0] : list.data
  const checkScope = () => { const s = useSessionStore.getState().session; if (!s || `${s.tenant_id}:${s.store_id}:${s.user.id}` !== scope) throw new Error('Phiên đã thay đổi. Vui lòng thực hiện lại.') }
  const invalidate = () => client.invalidateQueries({ queryKey: ['api', scope] })
  const save = useMutation({ mutationFn: async ({ values, initial }: { values: ManagementRow; initial: ManagementRow | null }) => {
    checkScope(); const body = voucherInput(values, initial); const id = initial ? String(initial.__id) : undefined
    const signature = JSON.stringify([id, body]); const key = keys.current.get(signature) ?? crypto.randomUUID(); keys.current.set(signature, key)
    const result = await cashbookRepository.save(body, key, id); checkScope(); keys.current.delete(signature); return result
  }, onSuccess: invalidate })
  const remove = useMutation({ mutationFn: async ({ id, version }: { id: string; version: number }) => { checkScope(); const result = await cashbookRepository.remove(id, version); checkScope(); return result }, onSuccess: invalidate })
  return {
    rows: (mobile ? infinite.data?.pages.flatMap((part) => part.items) : list.data?.items)?.map(cashbookRow) ?? [], total: result?.total ?? 0, pages: Math.max(1, result?.pagination.total_pages ?? 1), cashSummary: result?.summary,
    loading: enabled && (mobile ? infinite.isPending : list.isPending), error: enabled ? (mobile ? infinite.error : list.error) : null,
    hasMore: enabled && mobile && infinite.hasNextPage, fetchingMore: infinite.isFetchingNextPage, loadMore: infinite.fetchNextPage, canSort: (key: string) => Boolean(sorts[key]), pending: save.isPending || remove.isPending,
    save: save.mutateAsync, remove: (id: string, version = 0) => remove.mutateAsync({ id, version }),
    exportRows: async () => { const output: ManagementRow[] = []; let number = 1; let pages = 1; do { checkScope(); const result = await cashbookRepository.list({ ...options, page: number, page_size: 100 }); checkScope(); output.push(...result.items.map(cashbookRow)); pages = result.pagination.total_pages; number++ } while (number <= pages); return output },
  }
}
