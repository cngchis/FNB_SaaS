import { useEffect, useRef, useState } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiConfig } from './config'
import { useSessionStore } from './auth'
import { categoriesRepository } from './catalog'
import { inventoryRepository, type CountInput } from './inventory'
import { inventoryProduct } from './useInventoryRecords'
import { errorMessage } from './recordAdapter'

export function useStocktakeRecords(search: string, category: string, showAll: boolean, creating: boolean) {
  const remote = !apiConfig.useMock
  const session = useSessionStore((s) => s.session)
  const scope = `${session?.tenant_id}:${session?.store_id}:${session?.user.id}`
  const canManage = session?.user.role === 'owner' || session?.user.role === 'manager'
  const enabled = remote && !!session && canManage
  const client = useQueryClient()
  const [query, setQuery] = useState(search)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState('')
  const lock = useRef(false)
  const attempt = useRef<{ payload: string; key: string } | null>(null)
  const lastResult = useRef<HTMLButtonElement>(null)
  const lastHistory = useRef<HTMLTableRowElement>(null)
  useEffect(() => { const timer = setTimeout(() => setQuery(search), 200); return () => clearTimeout(timer) }, [search])
  const categories = useQuery({ queryKey: ['api', scope, 'categories'], enabled, queryFn: ({ signal }) => categoriesRepository.list(signal) })
  const active = enabled && creating && (!!query || showAll)
  const products = useInfiniteQuery({ queryKey: ['api', scope, 'stocktake-products', query, category], enabled: active, initialPageParam: 1,
    queryFn: ({ signal, pageParam }) => inventoryRepository.list({ search: query, ...(category !== 'Tất cả nhóm hàng' ? { category_id: category } : {}), page: pageParam, page_size: 100 }, signal),
    getNextPageParam: (last, _pages, n) => n < last.pagination.total_pages ? n + 1 : undefined })
  const history = useInfiniteQuery({ queryKey: ['api', scope, 'stocktakes'], enabled, initialPageParam: 1, queryFn: ({ signal, pageParam }) => inventoryRepository.stocktakes(pageParam, signal), getNextPageParam: (last, _pages, n) => n < last.pagination.total_pages ? n + 1 : undefined })
  useEffect(() => {
    if (!active || !lastResult.current || !products.hasNextPage || products.isFetchingNextPage || products.isError) return
    const observer = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) void products.fetchNextPage() })
    observer.observe(lastResult.current); return () => observer.disconnect()
  }, [active, products.data, products.hasNextPage, products.isFetchingNextPage, products.isError, products.fetchNextPage])
  useEffect(() => {
    if (!enabled || creating || !lastHistory.current || !history.hasNextPage || history.isFetchingNextPage || history.isError) return
    const observer = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) void history.fetchNextPage() })
    observer.observe(lastHistory.current); return () => observer.disconnect()
  }, [enabled, creating, history.data, history.hasNextPage, history.isFetchingNextPage, history.isError, history.fetchNextPage])
  const checkScope = () => { const s = useSessionStore.getState().session; if (!s || `${s.tenant_id}:${s.store_id}:${s.user.id}` !== scope) throw new Error('Phiên đã thay đổi. Vui lòng đăng nhập lại.') }
  const save = async (items: CountInput[], note: string) => {
    if (lock.current) return false
    lock.current = true; setSaving(true); setFailure('')
    try {
      checkScope(); const payload = JSON.stringify({ items, note })
      if (attempt.current?.payload !== payload) attempt.current = { payload, key: crypto.randomUUID() }
      await inventoryRepository.confirm(items, note, attempt.current.key)
      checkScope(); attempt.current = null
      await client.invalidateQueries({ queryKey: ['api', scope] }); return true
    } catch (error) { setFailure(errorMessage(error)); return false }
    finally { lock.current = false; setSaving(false) }
  }
  const error = failure || (remote && session && !canManage ? 'Tài khoản không có quyền thực hiện thao tác này.' : '') || (history.error || categories.error || (active && products.error) ? errorMessage(history.error ?? categories.error ?? products.error) : '')
  return { remote, canManage, saving, error, loading: enabled && (history.isPending || categories.isPending || (active && products.isPending) || (creating && query !== search)), categories: categories.data ?? [],
    rows: active && query === search ? products.data?.pages.flatMap((p) => p.items.map(inventoryProduct)) ?? [] : [], history: history.data?.pages.flatMap((p) => p.items) ?? [],
    lastResult, lastHistory, save,
    retry: () => { setFailure(''); void history.refetch(); void categories.refetch(); if (active) void products.refetch() },
  }
}
