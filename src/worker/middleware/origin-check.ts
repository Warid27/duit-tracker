// CSRF defense-in-depth (spec 8.3): SameSite=Lax + Origin host must equal request host on mutations.
import type { MiddlewareHandler } from 'hono'
import { AppError } from '../lib/errors'

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export const originCheck: MiddlewareHandler = async (c, next) => {
  if (MUTATING.has(c.req.method)) {
    const origin = c.req.header('Origin')
    if (origin) {
      const originHost = (() => {
        try {
          return new URL(origin).host
        } catch {
          return null
        }
      })()
      const reqHost = new URL(c.req.url).host
      if (originHost !== reqHost) throw AppError.forbidden('Permintaan dari sumber yang tidak dikenal.')
    }
    const ct = c.req.header('Content-Type')
    if (ct && !ct.startsWith('application/json')) {
      throw AppError.validation('Tipe konten harus application/json.')
    }
  }
  await next()
}
