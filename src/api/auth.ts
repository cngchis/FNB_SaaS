import { z } from 'zod'
import { create } from 'zustand'
import { apiConfig } from './config'
import { createHttpClient, publicRequest } from './http'

const roleSchema = z.enum(['owner', 'manager', 'cashier', 'kitchen'])
const sessionSchema = z.object({
  access_token: z.string().min(1), refresh_token: z.string().min(1),
  tenant_id: z.uuid(), store_id: z.uuid(),
  user: z.object({ id: z.uuid(), display_name: z.string(), email: z.string(), role: roleSchema }),
  stores: z.array(z.object({ ID: z.uuid(), Name: z.string(), Slug: z.string() })
    .transform((store) => ({ id: store.ID, name: store.Name, slug: store.Slug }))).default([]),
})
export type Session = z.infer<typeof sessionSchema>
export const useSessionStore = create<{ session: Session | null }>(() => ({ session: null }))
let tenantSlug: string | null = null
let pendingRefresh: Promise<boolean> | null = null
let generation = 0

// Tokens are deliberately memory-only. Reloading requires another login until
// a secure HttpOnly-cookie refresh transport is available on the backend.
export async function login(input: { tenant_slug: string; email: string; password: string; store_id?: string }) {
  const attempt = ++generation
  const session = await publicRequest('/auth/login', sessionSchema, { method: 'POST', body: input })
  if (attempt !== generation) return
  tenantSlug = input.tenant_slug
  useSessionStore.setState({ session })
}

export function clearSession() {
  generation++
  tenantSlug = null
  useSessionStore.setState({ session: null })
}

export async function refreshSession(): Promise<boolean> {
  if (pendingRefresh) return pendingRefresh
  const session = useSessionStore.getState().session
  if (!session || !tenantSlug) return false
  const attempt = generation
  const body = { tenant_slug: tenantSlug, refresh_token: session.refresh_token }
  pendingRefresh = (async () => {
    try {
      const refreshed = await publicRequest('/auth/refresh', sessionSchema, { method: 'POST', body })
      if (attempt !== generation) return false
      useSessionStore.setState({ session: refreshed })
      return true
    } catch {
      if (attempt === generation) clearSession()
      return false
    } finally { pendingRefresh = null }
  })()
  return pendingRefresh
}

export const request = createHttpClient(apiConfig.baseUrl, {
  token: () => useSessionStore.getState().session?.access_token ?? null,
  refresh: refreshSession,
})

export async function logout() {
  try { await request('/auth/logout', z.object({ logged_out: z.boolean() }), { method: 'POST' }) }
  finally { clearSession() }
}
