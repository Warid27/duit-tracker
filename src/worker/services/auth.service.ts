// Auth business logic (spec 8). Pure-ish: receives (db, env-scoped values, input).
import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { users } from '../db/schema'
import { seedUserDefaultsStatements } from '../db/seed/defaults'
import { hashPassword, verifyPassword, burnPasswordHash } from '../lib/password'
import { AppError } from '../lib/errors'
import { createSession, deleteOtherSessions, purgeExpiredSessions } from './session.service'
import { checkRateLimit, resetRateLimit } from './rate-limit.service'
import type { RegisterInput, LoginInput, ChangePasswordInput } from '@shared/schemas'

export interface AuthEnv {
  pepper: string
  iterations: number
  ttlDays: number
  registrationEnabled: boolean
}

const GENERIC_LOGIN_ERROR = 'Email atau password salah.'
const LOGIN_EMAIL_LIMIT = 5
const LOGIN_IP_LIMIT = 20

export interface SessionResult {
  token: string
  expiresAt: Date
  user: { id: string; email: string; name: string | null }
}

export async function register(db: Db, env: AuthEnv, input: RegisterInput): Promise<SessionResult> {
  if (!env.registrationEnabled) {
    throw new AppError('REGISTRATION_CLOSED', 403, 'Pendaftaran sedang ditutup.')
  }
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).get()
  if (existing) throw AppError.duplicate('Email sudah terdaftar.')

  const userId = crypto.randomUUID()
  const passwordHash = await hashPassword(input.password, env.pepper, env.iterations)

  // Atomic: user + seed defaults together (spec 11.1). Session created after success.
  const stmts = [
    db.insert(users).values({ id: userId, email: input.email, passwordHash, name: input.name ?? null }),
    ...seedUserDefaultsStatements(db, userId),
  ]
  try {
    await db.batch(stmts as unknown as Parameters<Db['batch']>[0])
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/UNIQUE/i.test(msg)) throw AppError.duplicate('Email sudah terdaftar.')
    throw err
  }

  const session = await createSession(db, userId, env.ttlDays)
  return {
    token: session.token,
    expiresAt: session.expiresAt,
    user: { id: userId, email: input.email, name: input.name ?? null },
  }
}

export async function login(db: Db, env: AuthEnv, input: LoginInput, ip: string): Promise<SessionResult> {
  await checkRateLimit(db, `login:email:${input.email}`, LOGIN_EMAIL_LIMIT)
  await checkRateLimit(db, `login:ip:${ip}`, LOGIN_IP_LIMIT)

  const user = await db.select().from(users).where(eq(users.email, input.email)).get()
  if (!user) {
    // Uniform timing: still do a PBKDF2 round (spec 8.1).
    await burnPasswordHash(input.password, env.pepper, env.iterations)
    throw AppError.validation(GENERIC_LOGIN_ERROR)
  }
  const ok = await verifyPassword(input.password, user.passwordHash, env.pepper)
  if (!ok) throw AppError.validation(GENERIC_LOGIN_ERROR)

  await resetRateLimit(db, `login:email:${input.email}`, `login:ip:${ip}`)
  await purgeExpiredSessions(db) // opportunistic cleanup on login (spec 8.2)

  const session = await createSession(db, user.id, env.ttlDays)
  return {
    token: session.token,
    expiresAt: session.expiresAt,
    user: { id: user.id, email: user.email, name: user.name },
  }
}

export async function changePassword(
  db: Db,
  env: AuthEnv,
  userId: string,
  currentSessionId: string,
  input: ChangePasswordInput,
): Promise<void> {
  await checkRateLimit(db, `chpwd:${userId}`, LOGIN_EMAIL_LIMIT)
  const user = await db.select().from(users).where(eq(users.id, userId)).get()
  if (!user) throw AppError.notFound()
  const ok = await verifyPassword(input.currentPassword, user.passwordHash, env.pepper)
  if (!ok) throw AppError.validation('Password saat ini salah.')

  const newHash = await hashPassword(input.newPassword, env.pepper, env.iterations)
  await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, userId))
  // BR-15: revoke all other sessions.
  await deleteOtherSessions(db, userId, currentSessionId)
  await resetRateLimit(db, `chpwd:${userId}`)
}
