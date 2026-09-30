// Session lifecycle (spec 8.2): tokens, DB rows, cookies, sliding expiration.
import { and, eq, lt, ne } from 'drizzle-orm'
import type { Db } from '../db/client'
import { sessions, users } from '../db/schema'
import { sha256Hex } from '../lib/base64'
import { addDaysIso, nowIsoUtc } from '@shared/domain/dates'

export const SESSION_COOKIE = 'duit_session'
const SLIDING_RENEW_DAYS = 45

export function newSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

export async function createSession(
  db: Db,
  userId: string,
  ttlDays: number,
): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
  const token = newSessionToken()
  const id = await sha256Hex(token)
  const expiresAt = addDaysIso(new Date(), ttlDays)
  await db.insert(sessions).values({ id, userId, expiresAt: expiresAt.toISOString() })
  return { token, sessionId: id, expiresAt }
}

/** Resolve a raw cookie token to its user + session row, or null when missing/expired. */
export async function getSessionUser(db: Db, token: string) {
  const id = await sha256Hex(token)
  const row = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      userId: users.id,
      email: users.email,
      name: users.name,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, id))
    .get()
  if (!row) return null
  if (new Date(row.expiresAt).getTime() <= Date.now()) {
    await deleteSession(db, row.sessionId)
    return null
  }
  return row
}

/** Sliding expiration: renew when remaining life < 45 days. Returns new expiry ISO or null. */
export async function maybeRenewSession(db: Db, sessionId: string, ttlDays: number): Promise<string | null> {
  const row = await db
    .select({ expiresAt: sessions.expiresAt })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get()
  if (!row) return null
  const remainingMs = new Date(row.expiresAt).getTime() - Date.now()
  if (remainingMs > SLIDING_RENEW_DAYS * 86_400_000) return null
  const expiresAt = addDaysIso(new Date(), ttlDays).toISOString()
  await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, sessionId))
  return expiresAt
}

export async function deleteSession(db: Db, sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId))
}

/** Remove every session of the user (logout-all). */
export async function deleteAllSessions(db: Db, userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId))
}

/** BR-15: remove all sessions of the user except the current one. */
export async function deleteOtherSessions(db: Db, userId: string, keepSessionId: string): Promise<void> {
  await db.delete(sessions).where(and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId)))
}

/** Opportunistic cleanup of expired sessions (spec 8.2). */
export async function purgeExpiredSessions(db: Db): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, nowIsoUtc()))
}

export function sessionCookie(token: string, opts: { secure: boolean; maxAgeSeconds: number }): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${opts.maxAgeSeconds}`,
  ]
  if (opts.secure) parts.push('Secure')
  return parts.join('; ')
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
}
