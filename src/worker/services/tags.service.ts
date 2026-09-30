// Tag CRUD (spec BR-06, BR-07, BR-08). Tags are freely deletable.
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { tags, transactionTags } from '../db/schema'
import { AppError } from '../lib/errors'
import { normalizeName } from '../lib/name'

export async function listTags(db: Db, userId: string) {
  return db.select().from(tags).where(eq(tags.userId, userId)).orderBy(asc(tags.name))
}

async function assertNameFree(db: Db, userId: string, name: string, exceptId?: string): Promise<void> {
  const rows = await db.select({ id: tags.id, name: tags.name }).from(tags).where(eq(tags.userId, userId))
  const norm = normalizeName(name)
  if (rows.some((r) => normalizeName(r.name) === norm && r.id !== exceptId)) {
    throw AppError.duplicate('Tag itu sudah ada.')
  }
}

export async function createTag(db: Db, userId: string, name: string) {
  await assertNameFree(db, userId, name)
  const id = crypto.randomUUID()
  try {
    await db.batch([db.insert(tags).values({ id, userId, name: name.trim() })])
  } catch (err) {
    if (/UNIQUE/i.test(err instanceof Error ? err.message : String(err))) {
      throw AppError.duplicate('Tag itu sudah ada.')
    }
    throw err
  }
  const row = await db.select().from(tags).where(eq(tags.id, id)).get()
  if (!row) throw AppError.notFound()
  return row
}

export async function renameTag(db: Db, userId: string, id: string, name: string) {
  const existing = await db
    .select()
    .from(tags)
    .where(and(eq(tags.id, id), eq(tags.userId, userId)))
    .get()
  if (!existing) throw AppError.notFound()
  if (normalizeName(name) !== normalizeName(existing.name)) await assertNameFree(db, userId, name, id)
  await db.update(tags).set({ name: name.trim() }).where(eq(tags.id, id))
  const updated = await db.select().from(tags).where(eq(tags.id, id)).get()
  if (!updated) throw AppError.notFound()
  return updated
}

/** BR-06: deleting a tag also removes its transaction links. */
export async function deleteTag(db: Db, userId: string, id: string): Promise<void> {
  const existing = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.id, id), eq(tags.userId, userId)))
    .get()
  if (!existing) throw AppError.notFound()
  await db.batch([
    db.delete(transactionTags).where(eq(transactionTags.tagId, id)),
    db.delete(tags).where(eq(tags.id, id)),
  ])
}

/** Validate ids belong to the user; returns the subset that exists (stale ones dropped silently for recurring). */
export async function resolveTagIds(db: Db, userId: string, ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const rows = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.userId, userId), inArray(tags.id, [...ids])))
  const valid = new Set(rows.map((r) => r.id))
  return ids.filter((id) => valid.has(id))
}

/** Count of transactions using each tag (for UI hints). */
export async function tagUsageCounts(db: Db, userId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ tagId: transactionTags.tagId, c: sql<number>`count(*)` })
    .from(transactionTags)
    .innerJoin(tags, eq(tags.id, transactionTags.tagId))
    .where(eq(tags.userId, userId))
    .groupBy(transactionTags.tagId)
  return new Map(rows.map((r) => [r.tagId, r.c]))
}
