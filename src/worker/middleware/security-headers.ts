// Security headers for API responses (spec 8.3). Static asset headers live in public/_headers.
import type { MiddlewareHandler } from 'hono'

export const securityHeaders: MiddlewareHandler = async (_c, next) => {
  _c.header('X-Content-Type-Options', 'nosniff')
  _c.header('Referrer-Policy', 'same-origin')
  _c.header('X-Frame-Options', 'DENY')
  await next()
  // no-store for all /api/* responses
  _c.header('Cache-Control', 'no-store')
}
