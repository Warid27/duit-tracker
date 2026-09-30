// Typed fetch wrapper for the /api contract (spec 9). Same-origin cookies included.
export class ApiError extends Error {
  code: string
  status: number
  details?: unknown
  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message)
    this.code = code
    this.status = status
    this.details = details
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  if (res.status === 204) return undefined as T
  let json: unknown
  try {
    json = await res.json()
  } catch {
    throw new ApiError('INTERNAL', 'Respons tidak valid dari server.', res.status)
  }
  const body = json as { data?: T; error?: { code: string; message: string; details?: unknown } }
  if (!res.ok || body.error) {
    const err = body.error ?? { code: 'INTERNAL', message: 'Terjadi kesalahan.' }
    throw new ApiError(err.code, err.message, res.status, err.details)
  }
  return body.data as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: data === undefined ? undefined : JSON.stringify(data) }),
  put: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PUT', body: data === undefined ? undefined : JSON.stringify(data) }),
  patch: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
