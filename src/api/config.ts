export function readApiConfig(env: Record<string, unknown>) {
  const flag = env.VITE_USE_MOCK
  if (flag !== undefined && flag !== 'true' && flag !== 'false') {
    throw new Error('VITE_USE_MOCK must be true or false.')
  }
  const baseUrl = String(env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/$/, '')
  if (baseUrl.startsWith('//') || (!baseUrl.startsWith('/') && !/^https?:\/\//.test(baseUrl))) {
    throw new Error('VITE_API_BASE_URL must be an absolute HTTP URL or a root-relative path.')
  }
  return { useMock: flag !== 'false', baseUrl }
}

export const apiConfig = readApiConfig(import.meta.env)
