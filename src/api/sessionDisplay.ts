import { useSessionStore } from './auth'
import { apiConfig } from './config'

export function useSessionDisplay() {
  const session = useSessionStore((state) => state.session)
  if (apiConfig.useMock || !session) return { name: 'Chí Hồ', initials: 'CH', role: 'Quản lý cửa hàng', branch: 'Mộc Store · Quận 1', shortBranch: 'Chi nhánh trung tâm', mock: true }
  return {
    name: session.user.display_name,
    initials: session.user.display_name.split(/\s+/).filter(Boolean).slice(-2).map((word) => word[0]).join('').toLocaleUpperCase('vi'),
    role: ({ owner: 'Chủ cửa hàng', manager: 'Quản lý cửa hàng', cashier: 'Thu ngân', kitchen: 'Pha chế' })[session.user.role],
    branch: session.stores.find((store) => store.id === session.store_id)?.name ?? session.store_id,
    shortBranch: session.stores.find((store) => store.id === session.store_id)?.name ?? session.store_id,
    mock: false,
  }
}
