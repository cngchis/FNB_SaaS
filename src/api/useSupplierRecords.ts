import { useRef } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSessionStore } from './auth'
import { suppliersRepository, supplierRow, supplierInput, type SupplierOptions } from './purchasing'
import type { ManagementRow } from '../features/management/moduleConfig'

export function useSupplierRecords(enabled: boolean, scope: string, mobile: boolean, page: number, search: string, sort: string | null, ascending: boolean) {
  const client = useQueryClient()
  const keys = useRef(new Map<string,string>())
  const options: SupplierOptions = { page, page_size: 6, search, sort: sort === 'debt' ? 'debt_vnd' : 'name', direction: ascending ? 'asc' : 'desc' }
  const queryKey = ['api',scope,'suppliers','list',options]
  const list = useQuery({ queryKey, enabled: enabled && !mobile, queryFn: ({signal}) => suppliersRepository.list(options,signal) })
  const infinite = useInfiniteQuery({ queryKey: [...queryKey,'mobile'], enabled: enabled && mobile, initialPageParam:1,
    queryFn: ({signal,pageParam}) => suppliersRepository.list({...options,page:pageParam},signal),
    getNextPageParam: (last,_pages,number) => number < last.pagination.total_pages ? number+1 : undefined,
  })
  const checkScope = () => { const current = useSessionStore.getState().session; if (!current || `${current.tenant_id}:${current.store_id}:${current.user.id}` !== scope) throw new Error('Phiên đã thay đổi. Vui lòng thử lại.') }
  const invalidate = () => client.invalidateQueries({queryKey:['api',scope]})
  const save = useMutation({ mutationFn: async ({values,initial}:{values:ManagementRow;initial:ManagementRow|null}) => {
    checkScope()
    const input = supplierInput({...initial,...values})
    const id = initial ? String(initial.__id) : undefined
    const signature = JSON.stringify([scope,id,input])
    let key = keys.current.get(signature)
    if (!key) { key=crypto.randomUUID(); keys.current.set(signature,key) }
    const result = await suppliersRepository.save(input,key,id)
    checkScope()
    keys.current.delete(signature)
    return result
  }, onSuccess: invalidate })
  const remove = useMutation({mutationFn: async ({id,version}:{id:string;version:number}) => {checkScope();await suppliersRepository.remove(id,version);checkScope()},onSuccess:invalidate})
  const result = mobile ? infinite.data?.pages[0] : list.data
  return {
    rows:(mobile ? infinite.data?.pages.flatMap((part) => part.items) : list.data?.items)?.map(supplierRow) ?? [],
    total:result?.total ?? 0, pages:Math.max(1,result?.pagination.total_pages ?? 1),
    supplierDebt:result?.debt_vnd,
    loading: enabled && (mobile ? infinite.isPending : list.isPending),
    error:enabled ? mobile ? infinite.error : list.error : null,
    hasMore:enabled && mobile && infinite.hasNextPage, fetchingMore:infinite.isFetchingNextPage, loadMore:infinite.fetchNextPage,
    canSort:(field:string) => ['name','debt'].includes(field), pending:save.isPending||remove.isPending,
    save:save.mutateAsync, remove:(id:string,version=0) => remove.mutateAsync({id,version}),
    exportRows: async () => {
      const rows:ManagementRow[]=[];let number=1;let count=1
      do {checkScope();const result=await suppliersRepository.list({...options,page:number,page_size:100});checkScope();rows.push(...result.items.map(supplierRow));count=result.pagination.total_pages;number++}while(number<=count)
      return rows
    },
  }
}
