import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ApiError, createHttpClient } from './http'
import { readApiConfig } from './config'

afterEach(() => vi.restoreAllMocks())
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('API configuration', () => {
  it('keeps prototype mode as the default and explicitly opts into HTTP', () => {
    expect(readApiConfig({}).useMock).toBe(true)
    expect(readApiConfig({ VITE_USE_MOCK: 'false' }).useMock).toBe(false)
    expect(() => readApiConfig({ VITE_USE_MOCK: 'FALSE' })).toThrow()
    expect(() => readApiConfig({ VITE_API_BASE_URL: 'javascript:bad' })).toThrow()
  })
})

describe('HTTP transport', () => {
  it('attaches the current token, sends integer money and validates the envelope', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response({ data: { price: 35000 } }))
    const request = createHttpClient('/api/v1', { token: () => 'test-token', refresh: async () => false }, transport)
    expect(await request('/products', z.object({ price: z.number().int() }), { method: 'POST', body: { price: 35000 } })).toEqual({ price: 35000 })
    expect(transport.mock.calls[0][0]).toBe('/api/v1/products')
    const init = transport.mock.calls[0][1]!
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer test-token')
    expect(init.body).toBe('{"price":35000}')
    expect(init.credentials).toBe('omit')
  })
  it('retries only once after an authentication failure', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response({ error: { code: 'unauthorized', message: 'Expired' } }, 401))
    const refresh = vi.fn(async () => true)
    const request = createHttpClient('/api/v1', { token: () => 'token', refresh }, transport)
    await expect(request('/products', z.array(z.unknown()))).rejects.toMatchObject({ status: 401 })
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(transport).toHaveBeenCalledTimes(2)
  })
  it.each([403, 409, 422, 500])('does not retry mutation HTTP %i or fall back to mock data', async (status) => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response({ error: { code: 'rejected', message: 'Rejected' } }, status))
    const refresh = vi.fn(async () => true)
    const request = createHttpClient('/api/v1', { token: () => 'token', refresh }, transport)
    await expect(request('/products', z.unknown(), { method: 'POST', body: {} })).rejects.toMatchObject({ status, code: 'rejected' })
    expect(transport).toHaveBeenCalledTimes(1)
    expect(refresh).not.toHaveBeenCalled()
  })
  it('rejects malformed successful responses', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response({ data: { price: 35.5 } }))
    await expect(createHttpClient('/api/v1', undefined, transport)('/products', z.object({ price: z.number().int() }))).rejects.toBeInstanceOf(ApiError)
  })
  it('rejects protocol-relative request paths', async () => {
    const transport = vi.fn<typeof fetch>()
    await expect(createHttpClient('/api/v1', undefined, transport)('//other.example', z.unknown())).rejects.toThrow()
    expect(transport).not.toHaveBeenCalled()
  })
})
