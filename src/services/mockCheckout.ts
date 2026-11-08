type MockOrderInput = {
  total: number
  paymentMethod: 'cash' | 'qr'
  offline: boolean
}

export type MockOrderResult = {
  orderCode: string
  queuedForSync: boolean
  source: 'local-demo'
}

let orderSequence = 192
const offlineQueueKey = 'fnb-saas-demo-offline-orders'

export function getOfflineOrderQueue(): string[] {
  try {
    const savedQueue = window.localStorage.getItem(offlineQueueKey)
    const parsed: unknown = savedQueue ? JSON.parse(savedQueue) : []
    return Array.isArray(parsed) && parsed.every((order) => typeof order === 'string') ? parsed : []
  } catch {
    return []
  }
}

export async function simulateOfflineOrderSync(): Promise<number> {
  await new Promise((resolve) => window.setTimeout(resolve, 300))
  const count = getOfflineOrderQueue().length
  window.localStorage.removeItem(offlineQueueKey)
  return count
}

export async function createMockOrder({ total, offline }: MockOrderInput): Promise<MockOrderResult> {
  await new Promise((resolve) => window.setTimeout(resolve, 250))
  if (!Number.isFinite(total) || total <= 0) throw new Error('Đơn hàng cần có tổng tiền lớn hơn 0.')
  orderSequence += 1
  const order: MockOrderResult = {
    orderCode: `MOC-${String(orderSequence).padStart(4, '0')}`,
    queuedForSync: offline,
    source: 'local-demo',
  }
  if (offline) window.localStorage.setItem(offlineQueueKey, JSON.stringify([order.orderCode, ...getOfflineOrderQueue()]))
  return order
}
