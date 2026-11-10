import { roomsRepository } from './pos'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { apiConfig } from './config'
import { useSessionStore } from './auth'
import { menuItemsRepository, customersRepository, categoriesRepository, groupsRepository } from './catalog'
import { connectedModules, customerInput, customerRow, errorMessage, groupInput, groupRow, productInput, productRow } from './recordAdapter'
import type { ManagementRow } from '../features/management/moduleConfig'

export function useRemoteRecords(moduleId: string, page: number, query: string, filter: string, sort: string | null, ascending: boolean) {
  const session = useSessionStore((state) => state.session)
  const remote = !apiConfig.useMock && connectedModules.has(moduleId)
  const enabled = remote && session !== null
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 720px)').matches)
  useEffect(() => {
    const media = window.matchMedia('(max-width: 720px)')
    const update = () => setMobile(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  const scope = `${session?.tenant_id}:${session?.store_id}:${session?.user.id}`
  const [search, setSearch] = useState(query)
  useEffect(() => { const timer = window.setTimeout(() => setSearch(query), 200); return () => window.clearTimeout(timer) }, [query])
  const client = useQueryClient()
  const groups = useQuery({ queryKey: ['api', scope, 'groups'], queryFn: ({ signal }) => groupsRepository.list(signal), enabled: enabled && ['customers', 'customer-groups'].includes(moduleId) })
  const categories = useQuery({ queryKey: ['api', scope, 'categories'], queryFn: ({ signal }) => categoriesRepository.list(signal), enabled: enabled && moduleId === 'menu-items' })
  const productSort: Record<string, string> = { name: 'name', code: 'sku', price: 'price_vnd' }
  const customerSort: Record<string, string> = { name: 'name', points: 'points' }
  const groupFilter = groups.data?.find((item) => item.name === filter)
  const options = {
    page, page_size: 6, search, direction: ascending ? 'asc' as const : 'desc' as const,
    sort: (moduleId === 'menu-items' ? productSort : customerSort)[sort ?? 'name'] ?? 'name',
    ...(moduleId === 'menu-items' && filter !== 'Tất cả' ? { availability: filter === 'Đang bán' ? 'available' as const : 'unavailable' as const } : {}),
    ...(moduleId === 'customers' && groupFilter ? { group_id: groupFilter.id } : {}),
  }
  const fetchPage = async (pageNumber: number, signal: AbortSignal) => {
      const pageOptions = { ...options, page: pageNumber }
      if (moduleId === 'menu-items') {
        const result = await menuItemsRepository.list(pageOptions, signal)
        return { rows: result.items.map(productRow), total: result.pagination.total, pages: result.pagination.total_pages }
      }
      const result = await customersRepository.list(pageOptions, signal)
      return { rows: result.items.map(customerRow), total: result.pagination.total, pages: result.pagination.total_pages }
  }
  const roomData = useQuery({ queryKey: ['api', scope, 'rooms'], enabled: enabled && moduleId === 'rooms', queryFn: ({ signal }) => roomsRepository.list(signal) })
  const listEnabled = enabled && moduleId !== 'rooms' && moduleId !== 'customer-groups' && (moduleId !== 'customers' || groups.isSuccess)
  const records = useQuery({
    queryKey: ['api', scope, moduleId, options], enabled: listEnabled && !mobile,
    queryFn: ({ signal }) => fetchPage(page, signal),
  })
  const infinite = useInfiniteQuery({
    queryKey: ['api', scope, moduleId, 'mobile', { ...options, page: 1 }],
    enabled: listEnabled && mobile, initialPageParam: 1,
    queryFn: ({ signal, pageParam }) => fetchPage(pageParam, signal),
    getNextPageParam: (lastPage, _pages, pageNumber) => pageNumber < lastPage.pages ? pageNumber + 1 : undefined,
  })
  let rows: ManagementRow[] = mobile ? infinite.data?.pages.flatMap((result) => result.rows) ?? [] : records.data?.rows ?? []
  let total = (mobile ? infinite.data?.pages[0]?.total : records.data?.total) ?? 0
  let pages = (mobile ? infinite.data?.pages[0]?.pages : records.data?.pages) ?? 1
  let groupExportRows: ManagementRow[] = []
  if (moduleId === 'customer-groups' || moduleId === 'rooms') {
    const collection = moduleId === 'rooms' ? (roomData.data ?? []).map((r) => ({ __id: r.id, name: r.name, note: r.note })) : (groups.data ?? []).map(groupRow)
    const matches = collection.filter((row) => Object.values(row).some((value) => String(value).toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))))
    if (sort) matches.sort((a, b) => (typeof a[sort] === 'number' && typeof b[sort] === 'number' ? Number(a[sort]) - Number(b[sort]) : String(a[sort] ?? '').localeCompare(String(b[sort] ?? ''), 'vi')) * (ascending ? 1 : -1))
    groupExportRows = matches
    total = matches.length; pages = Math.ceil(total / 6); rows = mobile ? matches : matches.slice((page - 1) * 6, page * 6)
  }
  const invalidate = () => client.invalidateQueries({ queryKey: ['api', scope] })
  const canManage = session?.user.role === 'owner' || session?.user.role === 'manager'
  const save = useMutation({
    mutationFn: async ({ values, initial }: { values: ManagementRow; initial: ManagementRow | null }) => {
      const row = { ...initial, ...values }
      const id = initial ? String(initial.__id) : undefined
      if (moduleId === 'rooms') await roomsRepository.save({ name: String(row.name), note: String(row.note ?? '') }, id)
      if (moduleId === 'menu-items') await menuItemsRepository.save(productInput(row, categories.data ?? []), id)
      if (moduleId === 'customers') await customersRepository.save(customerInput(row, groups.data ?? [], canManage), id)
      if (moduleId === 'customer-groups') await groupsRepository.save(groupInput(row), id)
    }, onSuccess: invalidate,
  })
  const remove = useMutation({ mutationFn: (id: string) => moduleId === 'rooms' ? roomsRepository.remove(id) : moduleId === 'menu-items' ? menuItemsRepository.remove(id) : moduleId === 'customers' ? customersRepository.remove(id) : groupsRepository.remove(id), onSuccess: invalidate })
  const createCategory = useMutation({ mutationFn: (name: string) => categoriesRepository.save(name), onSuccess: invalidate })
  const loading = remote && (search !== query || (moduleId === 'rooms' ? roomData.isPending : moduleId === 'customer-groups' ? groups.isPending : mobile ? infinite.isPending : records.isPending) || (moduleId === 'menu-items' ? categories.isPending : moduleId === 'customers' ? groups.isPending : false))
  const error = enabled ? (mobile ? infinite.error : records.error) ?? groups.error ?? categories.error ?? roomData.error : null
  const exportRows = async () => {
    if (moduleId === 'customer-groups' || moduleId === 'rooms') return groupExportRows
    const output: ManagementRow[] = []
    let pageNumber = 1
    let totalPages = 1
    do {
      const current = useSessionStore.getState().session
      if (!current || `${current.tenant_id}:${current.store_id}:${current.user.id}` !== scope) throw new Error('Phiên đã thay đổi. Vui lòng xuất file lại.')
      const filter = { ...options, page: pageNumber, page_size: 100 }
      if (moduleId === 'menu-items') {
        const result = await menuItemsRepository.list(filter)
        output.push(...result.items.map(productRow)); totalPages = result.pagination.total_pages
      } else {
        const result = await customersRepository.list(filter)
        output.push(...result.items.map(customerRow)); totalPages = result.pagination.total_pages
      }
      pageNumber++
    } while (pageNumber <= totalPages)
    const current = useSessionStore.getState().session
    if (!current || `${current.tenant_id}:${current.store_id}:${current.user.id}` !== scope) throw new Error('Phiên đã thay đổi. Vui lòng xuất file lại.')
    return output
  }
  return {
    remote, rows, total, pages: Math.max(1, pages), loading, error: error ? errorMessage(error) : '',
    mobile, loadMore: infinite.fetchNextPage,
    hasMore: remote && mobile && moduleId !== 'customer-groups' && moduleId !== 'rooms' && search === query && infinite.hasNextPage,
    fetchingMore: infinite.isFetchingNextPage,
    categories: categories.data ?? [], groups: groups.data ?? [], canManage,
    pending: save.isPending || remove.isPending || createCategory.isPending,
    save: save.mutateAsync, remove: remove.mutateAsync, createCategory: createCategory.mutateAsync,
    retry: invalidate, exportRows,
    canSort: (key: string) => moduleId === 'customer-groups' || moduleId === 'rooms' || Boolean((moduleId === 'menu-items' ? productSort : customerSort)[key]),
  }
}
