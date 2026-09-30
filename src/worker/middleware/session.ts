// Session middleware (spec 4.5, 8.2): resolves the cookie, enforces auth, sliding renewal.
import type { MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import { AppError } from '../lib/errors'
import type { Db } from '../db/client'
import { getSessionUser, maybeRenewSession, SESSION_COOKIE } from '../services/session.service'
import { sessionCookie } from '../services/session.service'

export interface UserContext {
  userId: string
  email: string
  name: string | null
  sessionId: string
}

declare module 'hono' {
  interface ContextVariableMap {
    user: UserContext
  }
}

type AppEnv = { Bindings: Env; Variables: { user: UserContext; db: Db } }

function ttlDaysOf(c: { env: Env }): number {
  const n = Number.parseInt(c.env.SESSION_TTL_DAYS ?? '90', 10)
  return Number.isFinite(n) && n > 0 ? n : 90
}

/** Requires a valid session; attaches user to context. */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE)
  if (!token) throw AppError.unauthenticated()
  const db = c.get('db')
  const dbUser = await getSessionUser(db, token)
  if (!dbUser) throw AppError.unauthenticated('Sesi kamu sudah berakhir. Silakan login lagi.')
  // Sliding expiration: extend cookie + DB when close to expiry.
  const renewed = await maybeRenewSession(db, dbUser.sessionId, ttlDaysOf(c))
  if (renewed) {
    const maxAge = ttlDaysOf(c) * 86_400
    c.header('Set-Cookie', sessionCookie(token, { secure: isSecure(c), maxAgeSeconds: maxAge }))
  }
  c.set('user', {
    userId: dbUser.userId,
    email: dbUser.email,
    name: dbUser.name,
    sessionId: dbUser.sessionId,
  })
  await next()
}

/** Attaches user when a valid session exists; never rejects. */
export const optionalAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE)
  if (token) {
    const dbUser = await getSessionUser(c.get('db'), token)
    if (dbUser) {
      c.set('user', {
        userId: dbUser.userId,
        email: dbUser.email,
        name: dbUser.name,
        sessionId: dbUser.sessionId,
      })
    }
  }
  await next()
}

export function isSecure(c: { req: { url: string } }): boolean {
  return new URL(c.req.url).protocol === 'https:'
}
