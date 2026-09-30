// Fixed-window rate limiting backed by the rate_limits table (spec 8.3).
import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { rateLimits } from '../db/schema'
import { AppError } from '../lib/errors'

const WINDOW_SECONDS = 15 * 60

export async function checkRateLimit(db: Db, key: string, max: number): Promise<void> {
  const nowSec = Math.floor(Date.now() / 1000)
  const row = await db.select().from(rateLimits).where(eq(rateLimits.key, key)).get()
  if (!row || nowSec - row.windowStart >= WINDOW_SECONDS) {
    await db.batch([
      db
        .insert(rateLimits)
        .values({ key, count: 1, windowStart: nowSec })
        .onConflictDoUpdate({ target: rateLimits.key, set: { count: 1, windowStart: nowSec } }),
    ])
    return
  }
  if (row.count >= max) {
    throw AppError.rateLimited(
      'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.',
      WINDOW_SECONDS - (nowSec - row.windowStart),
    )
  }
  await db
    .update(rateLimits)
    .set({ count: row.count + 1 })
    .where(eq(rateLimits.key, key))
}

/** Reset counters after a successful login. */
export async function resetRateLimit(db: Db, ...keys: string[]): Promise<void> {
  for (const k of keys) {
    await db.delete(rateLimits).where(eq(rateLimits.key, k))
  }
}
