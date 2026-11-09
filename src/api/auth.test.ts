import { afterEach, expect, it, vi } from 'vitest'

const id = 'c447ec4c-a42b-440c-a564-91f0b14f3400'
const tokenResponse = (access = 'access', refresh = 'refresh') => ({ data: {
  access_token: access, refresh_token: refresh, tenant_id: id, store_id: id,
  user: { id, display_name: 'Owner', email: 'owner@example.test', role: 'owner' },
  stores: [{ ID: id, Name: 'Branch', Slug: 'branch' }],
} })
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

it('maps the existing Go store response and keeps tokens out of browser storage', async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(tokenResponse())))
  const setItem = vi.fn()
  vi.stubGlobal('fetch', transport)
  vi.stubGlobal('localStorage', { setItem })
  vi.stubGlobal('sessionStorage', { setItem })
  const auth = await import('./auth')
  await auth.login({ tenant_slug: 'tenant', email: 'owner@example.test', password: 'test-only-password' })
  expect(auth.useSessionStore.getState().session?.stores).toEqual([{ id, name: 'Branch', slug: 'branch' }])
  expect(setItem).not.toHaveBeenCalled()
})

it('coalesces simultaneous refreshes into one request', async () => {
  const transport = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify(tokenResponse())))
  vi.stubGlobal('fetch', transport)
  const auth = await import('./auth')
  await auth.login({ tenant_slug: 'tenant', email: 'owner@example.test', password: 'test-only-password' })
  const values = await Promise.all([auth.refreshSession(), auth.refreshSession(), auth.refreshSession()])
  expect(values).toEqual([true, true, true])
  expect(transport).toHaveBeenCalledTimes(2)
})

it('does not restore an old session after logout during refresh', async () => {
  let finish: (value: Response) => void = () => { throw new Error('Refresh has not started') }
  const transport = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(JSON.stringify(tokenResponse())))
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve }))
  vi.stubGlobal('fetch', transport)
  const auth = await import('./auth')
  await auth.login({ tenant_slug: 'tenant', email: 'owner@example.test', password: 'test-only-password' })
  const refresh = auth.refreshSession()
  auth.clearSession()
  finish(new Response(JSON.stringify(tokenResponse('new-access', 'new-refresh'))))
  expect(await refresh).toBe(false)
  expect(auth.useSessionStore.getState().session).toBeNull()
})
