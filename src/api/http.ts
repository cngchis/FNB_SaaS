import { z } from 'zod'
import { apiConfig } from './config'

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) })
type RequestOptions = { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown; signal?: AbortSignal; idempotencyKey?: string }
export type SessionAccess = { token: () => string | null; refresh: () => Promise<boolean> }

export function createHttpClient(baseUrl: string, session?: SessionAccess, transport: typeof fetch = fetch) {
  return async function request<T>(path: string, schema: z.ZodType<T>, options: RequestOptions = {}): Promise<T> {
    if (!path.startsWith('/') || path.startsWith('//')) throw new Error('API paths must be root-relative.')
    const timeout = AbortSignal.timeout(15_000)
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
    const execute = () => {
      const headers = new Headers({ Accept: 'application/json' })
      const token = session?.token()
      if (token) headers.set('Authorization', `Bearer ${token}`)
      if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey)
      if (options.body !== undefined) headers.set('Content-Type', 'application/json')
      return transport(`${baseUrl}${path}`, {
        method: options.method ?? 'GET', headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal, credentials: 'omit',
      })
    }
    let response = await execute()
    // A rejected authentication request has not reached the protected handler.
    if (response.status === 401 && session && !options.signal?.aborted && await session.refresh()) response = await execute()
    const json: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      const parsed = errorSchema.safeParse(json)
      throw new ApiError(response.status, parsed.success ? parsed.data.error.code : 'request_failed', parsed.success ? parsed.data.error.message : 'Không thể kết nối API. Vui lòng thử lại.')
    }
    const parsed = z.object({ data: schema }).safeParse(json)
    if (!parsed.success) throw new ApiError(502, 'invalid_response', 'Dữ liệu API không đúng định dạng.')
    return parsed.data.data
  }
}

export const publicRequest = createHttpClient(apiConfig.baseUrl)
