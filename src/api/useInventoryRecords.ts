import { useEffect, useRef, useState } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSessionStore } from './auth'
import { apiConfig } from './config'
import { categoriesRepository, menuItemsRepository, type ProductDTO } from './catalog'
import { errorMessage, productInput, productRow } from './recordAdapter'
import type { ManagementRow } from '../features/management/moduleConfig'
import type { Product } from '../types'

export type InventoryProduct = Product & { details?: ManagementRow }
export function inventoryProduct(item: ProductDTO): InventoryProduct {
  // ProductArtwork uses Product; numeric placeholders must never render as balances.
  // Real stock remains unknown until the outbound ledger and reconciliation exist.
  return { id: item.id, sku: item.sku, name: item.name, category: item.category_name ?? 'Khác', price: item.price_vnd, stock: 0, minimum: 0, color: '#e8edf5', image: item.image_url ?? '', baseUnit: item.base_unit, details: productRow(item) }
}

export function useInventoryRecords(active: boolean, page: number, query: string, category: string) {
  const session = useSessionStore((state) => state.session)
  const remote = active && !apiConfig.useMock
  const enabled = remote && !!session
  const scope = `${session?.tenant_id}:${session?.store_id}:${session?.user.id}`
  const client = useQueryClient()
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 720px)').matches)
  const [search, setSearch] = useState(query)
  const lock = useRef(false)
  const footerRef = useRef<HTMLDivElement>(null)
  useEffect(() => { const timer = window.setTimeout(() => setSearch(query), 200); return () => window.clearTimeout(timer) }, [query])
  useEffect(() => { const media = window.matchMedia('(max-width: 720px)'); const update = () => setMobile(media.matches); media.addEventListener('change', update); return () => media.removeEventListener('change', update) }, [])
  const options = { page, page_size: 6, search, product_type: 'goods' as const, tracks_stock: true, ...(category !== 'Tất cả danh mục' ? { category_id: category } : {}) }
  const list = useQuery({ queryKey: ['api', scope, 'inventory', 'list', options], enabled: enabled && !mobile, queryFn: ({ signal }) => menuItemsRepository.list(options, signal) })
  const infinite = useInfiniteQuery({ queryKey: ['api', scope, 'inventory', 'mobile', { ...options, page: 1 }], enabled: enabled && mobile, initialPageParam: 1, queryFn: ({ signal, pageParam }) => menuItemsRepository.list({ ...options, page: pageParam }, signal), getNextPageParam: (last, _pages, number) => number < last.pagination.total_pages ? number + 1 : undefined })
  const summary = useQuery({ queryKey: ['api', scope, 'inventory', 'summary'], enabled, queryFn: ({ signal }) => menuItemsRepository.list({ product_type: 'goods', tracks_stock: true, page_size: 1 }, signal) })
  const categories = useQuery({ queryKey: ['api', scope, 'categories'], enabled, queryFn: ({ signal }) => categoriesRepository.list(signal) })
  const checkScope = () => { const current = useSessionStore.getState().session; if (!current || `${current.tenant_id}:${current.store_id}:${current.user.id}` !== scope) throw new Error('Phiên đã thay đổi. Vui lòng thử lại.') }
  const invalidate = () => client.invalidateQueries({ queryKey: ['api', scope] })
  const open = useMutation({ mutationFn: async (id: string) => { checkScope(); const item = await menuItemsRepository.get(id); checkScope(); return productRow(item) } })
  const save = useMutation({ mutationFn: async ({ initial, values }: { initial: ManagementRow; values: ManagementRow }) => {
    if (lock.current) throw new Error('Đang lưu sản phẩm. Vui lòng chờ.')
    lock.current = true
    try { checkScope(); const input = productInput({ ...initial, ...values }, categories.data ?? []); const item = await menuItemsRepository.save(input, String(initial.__id)); checkScope(); return item }
    finally { lock.current = false }
  }, onSuccess: invalidate })
  const createCategory = useMutation({ mutationFn: async (name: string) => { checkScope(); const item = await categoriesRepository.save(name); checkScope(); return item }, onSuccess: invalidate })
  const data = mobile ? infinite.data?.pages[0] : list.data
  const loading = enabled && (search !== query || categories.isPending || (mobile ? infinite.isPending : list.isPending))
  const hasMore = enabled && mobile && infinite.hasNextPage && search === query
  useEffect(() => {
    if (!hasMore || loading || infinite.isFetchingNextPage || !footerRef.current) return
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) void infinite.fetchNextPage() }, { rootMargin: '80px' })
    observer.observe(footerRef.current); return () => observer.disconnect()
  }, [hasMore, loading, infinite.isFetchingNextPage, infinite.fetchNextPage])
  const error = enabled ? (mobile ? infinite.error : list.error) ?? categories.error ?? summary.error ?? open.error : null
  return { remote, mobile, scope, categories: categories.data ?? [], skuCount: summary.data?.pagination.total,
    rows: search === query ? (mobile ? infinite.data?.pages.flatMap((part) => part.items) : list.data?.items)?.map(inventoryProduct) ?? [] : [],
    total: data?.pagination.total ?? 0, pages: Math.max(1, data?.pagination.total_pages ?? 1), loading, pending: open.isPending || save.isPending || createCategory.isPending,
    error: error ? errorMessage(error) : '', footerRef, canManage: session?.user.role === 'owner' || session?.user.role === 'manager',
    open: (id: string) => { open.reset(); return open.mutateAsync(id) }, save: (initial: ManagementRow, values: ManagementRow) => save.mutateAsync({ initial, values }),
    createCategory: async (name: string) => (await createCategory.mutateAsync(name)).name,
    retry: () => { open.reset(); return Promise.all([mobile ? infinite.refetch() : list.refetch(), categories.refetch(), summary.refetch()]) },
    exportRows: async () => {
      const items: InventoryProduct[] = []; let number = 1; let pages = 1
      do { checkScope(); const result = await menuItemsRepository.list({ ...options, search: query, page: number, page_size: 100 }); checkScope(); items.push(...result.items.map(inventoryProduct)); pages = result.pagination.total_pages; number++ } while (number <= pages)
      return items
    },
  }
}
