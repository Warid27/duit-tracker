// Category ("Jenis") CRUD (spec BR-04, BR-05, BR-07).
import { and, asc, eq, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { categories, transactions } from '../db/schema'
import { AppError } from '../lib/errors'
import { normalizeName } from '../lib/name'
import type { CreateCategoryInput, UpdateCategoryInput } from '@shared/schemas'

export async function listCategories(
  db: Db,
  userId: string,
  opts: { kind?: 'income' | 'expense'; includeArchived: boolean },
) {
  const conds = [eq(categories.userId, userId)]
  if (opts.kind) conds.push(eq(categories.kind, opts.kind))
  if (!opts.includeArchived) conds.push(eq(categories.isArchived, false))
  return db
    .select()
    .from(categories)
    .where(and(...conds))
    .orderBy(asc(categories.sortOrder), asc(categories.name))
}

async function assertNameFree(
  db: Db,
  userId: string,
  kind: 'income' | 'expense',
  name: string,
  exceptId?: string,
): Promise<void> {
  // BR-07: unique per user per kind, case-insensitive.
  const rows = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.kind, kind)))
  const norm = normalizeName(name)
  if (rows.some((r) => normalizeName(r.name) === norm && r.id !== exceptId)) {
    throw AppError.duplicate('Kamu sudah punya jenis dengan nama itu.')
  }
}

export async function createCategory(db: Db, userId: string, input: CreateCategoryInput) {
  await assertNameFree(db, userId, input.kind, input.name)
  const id = crypto.randomUUID()
  const maxSort = await db
    .select({ m: sql<number>`coalesce(max(${categories.sortOrder}), -1)` })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.kind, input.kind)))
    .get()
  try {
    await db.batch([
      db.insert(categories).values({
        id,
        userId,
        name: input.name.trim(),
        kind: input.kind,
        color: input.color,
        sortOrder: (maxSort?.m ?? -1) + 1,
      }),
    ])
  } catch (err) {
    if (/UNIQUE/i.test(err instanceof Error ? err.message : String(err))) {
      throw AppError.duplicate('Kamu sudah punya jenis dengan nama itu.')
    }
    throw err
  }
  const row = await db.select().from(categories).where(eq(categories.id, id)).get()
  if (!row) throw AppError.notFound()
  return row
}

export async function updateCategory(db: Db, userId: string, id: string, input: UpdateCategoryInput) {
  const existing = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)))
    .get()
  if (!existing) throw AppError.notFound()
  const nextName = input.name !== undefined ? input.name.trim() : existing.name
  if (input.name !== undefined && normalizeName(nextName) !== normalizeName(existing.name)) {
    await assertNameFree(db, userId, existing.kind, nextName, id)
  }
  await db
    .update(categories)
    .set({
      ...(input.name !== undefined ? { name: nextName } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.isArchived !== undefined ? { isArchived: input.isArchived } : {}),
    })
    .where(eq(categories.id, id))
  const updated = await db.select().from(categories).where(eq(categories.id, id)).get()
  if (!updated) throw AppError.notFound()
  return updated
}

/** BR-05: refuse delete when referenced; UI then offers archiving. */
export async function deleteCategory(db: Db, userId: string, id: string): Promise<void> {
  const existing = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)))
    .get()
  if (!existing) throw AppError.notFound()
  const used = await db
    .select({ c: sql<number>`count(*)` })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.categoryId, id)))
    .get()
  if ((used?.c ?? 0) > 0) {
    throw AppError.inUse('Jenis ini sudah dipakai transaksi. Arsipkan saja kalau tidak lagi dipakai.')
  }
  const { recurringRules } = await import('../db/schema')
  const ruleUsed = await db
    .select({ c: sql<number>`count(*)` })
    .from(recurringRules)
    .where(and(eq(recurringRules.userId, userId), eq(recurringRules.categoryId, id)))
    .get()
  if ((ruleUsed?.c ?? 0) > 0) {
    throw AppError.inUse('Jenis ini masih dipakai aturan berulang.')
  }
  // Budgets reference categories with no FK restrict declared in schema; clean them atomically.
  const { budgets } = await import('../db/schema')
  await db.batch([
    db.delete(budgets).where(and(eq(budgets.userId, userId), eq(budgets.categoryId, id))),
    db.delete(categories).where(eq(categories.id, id)),
  ])
}

/** Usage count within the last N days — powers the Catat page category chips. */
export async function categoryUsage(db: Db, userId: string, sinceDate: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ categoryId: transactions.categoryId, c: sql<number>`count(*)` })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        sql`${transactions.occurredOn} >= ${sinceDate}`,
        sql`${transactions.categoryId} is not null`,
      ),
    )
    .groupBy(transactions.categoryId)
  return new Map(rows.map((r) => [r.categoryId ?? '', r.c]))
}
