export const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
export const WS_BASE_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000'
export const API_PREFIX = '/api'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface RequestOptions {
  body?: BodyInit | null
  headers?: HeadersInit
}

export class ApiError extends Error {
  status: number
  detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

function buildApiUrl(path: string): string {
  return `${BASE_URL}${API_PREFIX}${path}`
}

export function buildWsUrl(path: string): string {
  return `${WS_BASE_URL}${API_PREFIX}${path}`
}

async function getErrorDetail(res: Response): Promise<string> {
  const contentType = res.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    try {
      const json = await res.json()
      if (typeof json?.detail === 'string') {
        return json.detail
      }
      return JSON.stringify(json)
    } catch {
      return res.statusText || `HTTP ${res.status}`
    }
  }

  const text = await res.text().catch(() => '')
  return text || res.statusText || `HTTP ${res.status}`
}

async function ensureOk(res: Response): Promise<Response> {
  if (!res.ok) {
    throw new ApiError(res.status, await getErrorDetail(res))
  }
  return res
}

async function request<T>(
  method: HttpMethod,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const res = await fetch(buildApiUrl(path), {
    method,
    credentials: 'include',
    headers: options.headers,
    body: options.body,
  })

  await ensureOk(res)

  const text = await res.text()
  return text ? (JSON.parse(text) as T) : (undefined as T)
}

async function requestStream(
  method: HttpMethod,
  path: string,
  options: RequestOptions = {},
): Promise<Response> {
  const res = await fetch(buildApiUrl(path), {
    method,
    credentials: 'include',
    headers: options.headers,
    body: options.body,
  })

  return ensureOk(res)
}

async function uploadFile<T>(
  path: string,
  file: File,
  fieldName = 'file',
): Promise<T> {
  const form = new FormData()
  form.append(fieldName, file)

  return request<T>('POST', path, { body: form })
}

async function uploadStream(
  path: string,
  file: File,
  fieldName = 'file',
): Promise<Response> {
  const form = new FormData()
  form.append(fieldName, file)

  return requestStream('POST', path, { body: form })
}

export function buildQueryString(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(
    ([, value]) => value !== undefined && value !== null && value !== '',
  )

  if (entries.length === 0) {
    return ''
  }

  return `?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)])).toString()}`
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) =>
    request<T>('POST', path, {
      body: body ? JSON.stringify(body) : undefined,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
    }),
  put: <T>(path: string, body?: unknown) =>
    request<T>('PUT', path, {
      body: body ? JSON.stringify(body) : undefined,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>('PATCH', path, {
      body: body ? JSON.stringify(body) : undefined,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
    }),
  delete: <T>(path: string) => request<T>('DELETE', path),
  postStream: (path: string, body?: unknown) =>
    requestStream('POST', path, {
      body: body ? JSON.stringify(body) : undefined,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
    }),
  uploadFile,
  uploadStream,
}
