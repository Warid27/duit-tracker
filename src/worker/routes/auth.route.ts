// Auth routes (spec 9): thin — validate, call service, shape response.
import { Hono } from 'hono'
import { deleteCookie, getCookie } from 'hono/cookie'
import { zValidator } from '@hono/zod-validator'
import { changePasswordSchema, loginSchema, registerSchema } from '@shared/schemas'
import type { Db } from '../db/client'
import { changePassword, login, register, type AuthEnv } from '../services/auth.service'
import {
  clearSessionCookie,
  deleteAllSessions,
  deleteSession,
  SESSION_COOKIE,
  sessionCookie,
} from '../services/session.service'
import { isSecure, requireAuth, type UserContext } from '../middleware/session'

export interface AuthEnvVars {
  DB: D1Database
  PASSWORD_PEPPER: string
  PBKDF2_ITERATIONS: string
  SESSION_TTL_DAYS: string
  REGISTRATION_ENABLED: string
}

type Bindings = AuthEnvVars
type Variables = { user: UserContext; db: Db }

function authEnvOf(env: AuthEnvVars): AuthEnv {
  return {
    pepper: env.PASSWORD_PEPPER,
    iterations: Number.parseInt(env.PBKDF2_ITERATIONS || '100000', 10),
    ttlDays: Number.parseInt(env.SESSION_TTL_DAYS || '90', 10),
    registrationEnabled: env.REGISTRATION_ENABLED !== 'false',
  }
}

export const authRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>()

authRoute.post('/register', zValidator('json', registerSchema), async (c) => {
  const input = c.req.valid('json')
  const db = c.get('db')
  const result = await register(db, authEnvOf(c.env), input)
  const ttlDays = Number.parseInt(c.env.SESSION_TTL_DAYS || '90', 10)
  c.header(
    'Set-Cookie',
    sessionCookie(result.token, { secure: isSecure(c), maxAgeSeconds: ttlDays * 86_400 }),
  )
  return c.json({ data: result.user }, 201)
})

authRoute.post('/login', zValidator('json', loginSchema), async (c) => {
  const input = c.req.valid('json')
  const db = c.get('db')
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
  const result = await login(db, authEnvOf(c.env), input, ip)
  const ttlDays = Number.parseInt(c.env.SESSION_TTL_DAYS || '90', 10)
  c.header(
    'Set-Cookie',
    sessionCookie(result.token, { secure: isSecure(c), maxAgeSeconds: ttlDays * 86_400 }),
  )
  return c.json({ data: result.user })
})

authRoute.post('/logout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE)
  if (token) {
    const db = c.get('db')
    // resolve without requiring validity; deleting by id is harmless when missing
    const sess = await import('../services/session.service').then((m) => m.getSessionUser(db, token))
    if (sess) await deleteSession(db, sess.sessionId)
  }
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  c.header('Set-Cookie', clearSessionCookie())
  return c.body(null, 204)
})

authRoute.post('/logout-all', requireAuth, async (c) => {
  const { userId } = c.get('user')
  await deleteAllSessions(c.get('db'), userId)
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  c.header('Set-Cookie', clearSessionCookie())
  return c.body(null, 204)
})

authRoute.get('/me', requireAuth, (c) => {
  const u = c.get('user')
  return c.json({ data: { id: u.userId, email: u.email, name: u.name } })
})

authRoute.post('/change-password', requireAuth, zValidator('json', changePasswordSchema), async (c) => {
  const { userId, sessionId } = c.get('user')
  await changePassword(c.get('db'), authEnvOf(c.env), userId, sessionId, c.req.valid('json'))
  return c.json({ data: { ok: true } })
})
