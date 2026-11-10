import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useSessionStore } from './auth'
import { invoiceRow, invoicesRepository, type InvoiceOptions } from './invoices'
import type { ManagementRow } from '../features/management/moduleConfig'

const sorts: Record<string, string> = { code: 'code', table: 'room', order: 'order_code', customer: 'customer', amount: 'subtotal_vnd', due: 'total_vnd', paid: 'paid_vnd', date: 'arrived_at', status: 'status' }
const statuses: Record<string, InvoiceOptions['status']> = { 'Đã thanh toán': 'paid', 'Chờ thanh toán': 'unpaid', 'Đã hủy': 'cancelled' }
export function useInvoiceRecords(enabled: boolean, scope: string, mobile: boolean, page: number, search: string, filter: string, sort: string | null, ascending: boolean, dates: { from?: string; to?: string }) {
  const options: InvoiceOptions = { page, page_size: 6, search, status: statuses[filter], sort: sorts[sort ?? 'date'] ?? 'arrived_at', direction: sort ? ascending ? 'asc' : 'desc' : 'desc', date_from: dates.from, date_to: dates.to }
  const list = useQuery({ queryKey: ['api', scope, 'invoices', options], enabled: enabled && !mobile, queryFn: ({ signal }) => invoicesRepository.list(options, signal) })
  const infinite = useInfiniteQuery({ queryKey: ['api', scope, 'invoices', 'mobile', { ...options, page: 1 }], enabled: enabled && mobile, initialPageParam: 1,
    queryFn: ({ signal, pageParam }) => invoicesRepository.list({ ...options, page: pageParam }, signal),
    getNextPageParam: (last, _pages, number) => number < last.pagination.total_pages ? number + 1 : undefined,
  })
  const result = mobile ? infinite.data?.pages[0] : list.data
  const rows = (mobile ? infinite.data?.pages.flatMap((part) => part.items) : list.data?.items)?.map(invoiceRow) ?? []
  const checkScope = () => {
    const current = useSessionStore.getState().session
    if (!current || `${current.tenant_id}:${current.store_id}:${current.user.id}` !== scope) throw new Error('Phiên đã thay đổi. Vui lòng xuất file lại.')
  }
  return {
    rows, total: result?.pagination.total ?? 0, pages: Math.max(1, result?.pagination.total_pages ?? 1), summary: result?.summary,
    loading: enabled && (mobile ? infinite.isPending : list.isPending), error: enabled ? (mobile ? infinite.error : list.error) : null,
    hasMore: enabled && mobile && infinite.hasNextPage, fetchingMore: infinite.isFetchingNextPage, loadMore: infinite.fetchNextPage,
    canSort: (field: string) => Boolean(sorts[field]),
    exportRows: async () => {
      const output: ManagementRow[] = []; let pageNumber = 1; let pages = 1
      do { checkScope(); const result = await invoicesRepository.list({ ...options, page: pageNumber, page_size: 100 }); checkScope(); output.push(...result.items.map(invoiceRow)); pages = result.pagination.total_pages; pageNumber++ } while (pageNumber <= pages)
      return output
    },
  }
}
