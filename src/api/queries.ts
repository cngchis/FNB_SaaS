import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiConfig } from './config'
import { useSessionStore } from './auth'
import { ApiError } from './http'
import { menuItemsRepository, customersRepository, categoriesRepository, groupsRepository, type ListOptions, type ProductInput, type CustomerInput, type GroupInput } from './catalog'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: (count, error) => count < 1 && error instanceof ApiError && error.status >= 500 },
    mutations: { retry: false },
  },
})

function scope() {
  const session = useSessionStore.getState().session
  return session ? `${session.tenant_id}:${session.store_id}:${session.user.id}` : 'signed-out'
}
useSessionStore.subscribe((state, previous) => {
  const current = state.session
  const before = previous.session
  if (current?.tenant_id !== before?.tenant_id || current?.store_id !== before?.store_id || current?.user.id !== before?.user.id || current?.user.role !== before?.user.role) queryClient.clear()
})

function useApiScope() {
  const session = useSessionStore((state) => state.session)
  return { key: scope(), enabled: !apiConfig.useMock && session !== null }
}

export function useMenuItems(options: ListOptions = {}) {
  const { key, enabled } = useApiScope()
  return useQuery({ queryKey: ['api', key, 'products', options], queryFn: ({ signal }) => menuItemsRepository.list(options, signal), enabled })
}
export function useCustomers(options: ListOptions = {}) {
  const { key, enabled } = useApiScope()
  return useQuery({ queryKey: ['api', key, 'customers', options], queryFn: ({ signal }) => customersRepository.list(options, signal), enabled })
}
export function useCategories() {
  const { key, enabled } = useApiScope()
  return useQuery({ queryKey: ['api', key, 'categories'], queryFn: ({ signal }) => categoriesRepository.list(signal), enabled })
}
export function useCustomerGroups() {
  const { key, enabled } = useApiScope()
  return useQuery({ queryKey: ['api', key, 'groups'], queryFn: ({ signal }) => groupsRepository.list(signal), enabled })
}

export function useCatalogMutations() {
  const client = useQueryClient()
  const { key } = useApiScope()
  const invalidate = () => client.invalidateQueries({ queryKey: ['api', key] })
  return {
    saveProduct: useMutation({ mutationFn: ({ values, id }: { values: ProductInput; id?: string }) => menuItemsRepository.save(values, id), onSuccess: invalidate }),
    deleteProduct: useMutation({ mutationFn: menuItemsRepository.remove, onSuccess: invalidate }),
    saveCustomer: useMutation({ mutationFn: ({ values, id }: { values: CustomerInput; id?: string }) => customersRepository.save(values, id), onSuccess: invalidate }),
    deleteCustomer: useMutation({ mutationFn: customersRepository.remove, onSuccess: invalidate }),
    saveGroup: useMutation({ mutationFn: ({ values, id }: { values: GroupInput; id?: string }) => groupsRepository.save(values, id), onSuccess: invalidate }),
    deleteGroup: useMutation({ mutationFn: groupsRepository.remove, onSuccess: invalidate }),
    saveCategory: useMutation({ mutationFn: ({ name, id }: { name: string; id?: string }) => categoriesRepository.save(name, id), onSuccess: invalidate }),
  }
}
