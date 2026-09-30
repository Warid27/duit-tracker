// Recurring rules CRUD + due processing (spec BR-11..BR-14). The same
// processDueRecurring() runs from the daily Cron (all users) and from
// POST /recurring/process (single user). Idempotent via the unique
// (recurring_id, occurred_on) index + INSERT ... ON CONFLICT DO NOTHING.
import { and, asc, eq, lte } from 'drizzle-orm'
import type { Db } from '../db/client'
import { recurringRules, transactionTags, transactions } from '../db/schema'
import { AppError } from '../lib/errors'
import { resolveTagIds } from './tags.service'
import { assertActiveWallet } from './wallets.service'
import { categories } from '../db/schema'
import { occurrencesBetween, nextOccurrence } from '@shared/domain/recurrence'
import { todayIn } from '@shared/domain/dates'
import { MAX_RECURRING_ITERATIONS_PER_RUN } from '@shared/constants'
import type { CreateRecurringInput, UpdateRecurringInput } from '@shared/schemas'

export async function listRecurring(db: Db, userId: string) {
  return db
    .select()
    .from(recurringRules)
    .where(eq(recurringRules.userId, userId))
    .orderBy(asc(recurringRules.nextRunDate))
}

async function validateRuleShape(db: Db, userId: string, v: CreateRecurringInput): Promise<void> {
  await assertActiveWallet(db, userId, v.walletId)
  if (v.type === 'transfer') {
    if (!v.toWalletId) throw AppError.validation('Pilih dompet tujuan untuk transfer.')
    if (v.toWalletId === v.walletId) throw AppError.validation('Dompet asal dan tujuan tidak boleh sama.')
    if (v.categoryId) throw AppError.validation('Transfer tidak punya jenis.')
    await assertActiveWallet(db, userId, v.toWalletId, 'dompet tujuan')
  } else {
    if (v.toWalletId) throw AppError.validation('Hanya transfer yang punya dompet tujuan.')
    if (!v.categoryId) throw AppError.validation('Pilih jenis dulu.')
    const cat = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, v.categoryId), eq(categories.userId, userId)))
      .get()
    if (!cat) throw AppError.notFound('Jenis tidak ditemukan.')
    if (cat.kind !== v.type) throw AppError.validation('Jenis tidak cocok dengan tipe transaksi.')
  }
}

export async function createRule(db: Db, userId: string, input: CreateRecurringInput, today: string) {
  await validateRuleShape(db, userId, input)
  const tagIds = await resolveTagIds(db, userId, input.tagIds ?? [])
  if (input.type === 'transfer' && tagIds.length > 0)
    throw AppError.validation('Transfer tidak bisa diberi tag.')
  const id = crypto.randomUUID()
  // First run happens on startDate itself when it is already due.
  const firstRun = input.startDate <= today ? today : input.startDate
  const anchor = { frequency: input.frequency, startDate: input.startDate }
  const nextRun = nextOccurrence(anchor, firstRun, input.endDate ?? null) ?? firstRun
  await db.batch([
    db.insert(recurringRules).values({
      id,
      userId,
      type: input.type,
      amount: input.amount,
      walletId: input.walletId,
      toWalletId: input.type === 'transfer' ? (input.toWalletId ?? null) : null,
      categoryId: input.type === 'transfer' ? null : (input.categoryId ?? null),
      note: input.note,
      tagIds: JSON.stringify(tagIds),
      frequency: input.frequency,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      nextRunDate: nextRun,
      isActive: true,
    }),
  ])
  const row = await db.select().from(recurringRules).where(eq(recurringRules.id, id)).get()
  if (!row) throw AppError.notFound()
  return row
}

export async function updateRule(
  db: Db,
  userId: string,
  id: string,
  input: UpdateRecurringInput,
  today: string,
) {
  const existing = await db
    .select()
    .from(recurringRules)
    .where(and(eq(recurringRules.id, id), eq(recurringRules.userId, userId)))
    .get()
  if (!existing) throw AppError.notFound('Aturan tidak ditemukan.')
  const patch: Record<string, unknown> = {}
  if (input.amount !== undefined) patch.amount = input.amount
  if (input.note !== undefined) patch.note = input.note
  if (input.isActive !== undefined) patch.isActive = input.isActive
  if (input.endDate !== undefined) patch.endDate = input.endDate
  if (input.tagIds !== undefined) {
    patch.tagIds = JSON.stringify(await resolveTagIds(db, userId, input.tagIds))
  }
  const startChanged = input.startDate !== undefined && input.startDate !== existing.startDate
  if (startChanged) patch.startDate = input.startDate
  if (Object.keys(patch).length > 0) {
    await db.update(recurringRules).set(patch).where(eq(recurringRules.id, id))
  }
  // Re-anchor nextRunDate when the schedule changed; never move it into the past.
  if (startChanged || input.endDate !== undefined) {
    const updated = await db.select().from(recurringRules).where(eq(recurringRules.id, id)).get()
    if (!updated) throw AppError.notFound()
    const anchor = { frequency: updated.frequency, startDate: updated.startDate }
    const from = updated.nextRunDate < today ? today : updated.nextRunDate
    const next = nextOccurrence(anchor, from, updated.endDate)
    if (next === null) {
      await db.update(recurringRules).set({ isActive: false }).where(eq(recurringRules.id, id)) // BR-13
    } else if (next !== updated.nextRunDate) {
      await db.update(recurringRules).set({ nextRunDate: next }).where(eq(recurringRules.id, id))
    }
  }
  const row = await db.select().from(recurringRules).where(eq(recurringRules.id, id)).get()
  if (!row) throw AppError.notFound()
  return row
}

export async function deleteRule(db: Db, userId: string, id: string): Promise<void> {
  const existing = await db
    .select({ id: recurringRules.id })
    .from(recurringRules)
    .where(and(eq(recurringRules.id, id), eq(recurringRules.userId, userId)))
    .get()
  if (!existing) throw AppError.notFound('Aturan tidak ditemukan.')
  // BR-14: generated transactions keep existing but lose the link (FK set null).
  await db.delete(recurringRules).where(eq(recurringRules.id, id))
}

export interface ProcessResult {
  created: number
}

/**
 * Generate all transactions due up to `today` for active rules. When userId is
 * omitted (Cron), every user's due rules are processed. Catch-up loops are
 * bounded by MAX_RECURRING_ITERATIONS_PER_RUN per rule (BR-11).
 */
export async function processDueRecurring(
  db: Db,
  opts: { timezone: string; userId?: string; today?: string },
): Promise<ProcessResult> {
  const today = opts.today ?? todayIn(opts.timezone)
  const conds = [eq(recurringRules.isActive, true), lte(recurringRules.nextRunDate, today)]
  if (opts.userId) conds.push(eq(recurringRules.userId, opts.userId))
  const due = await db
    .select()
    .from(recurringRules)
    .where(and(...conds))

  let created = 0
  for (const rule of due) {
    const anchor = { frequency: rule.frequency, startDate: rule.startDate }
    const dates = occurrencesBetween(
      anchor,
      rule.nextRunDate,
      today,
      rule.endDate,
      MAX_RECURRING_ITERATIONS_PER_RUN,
    )
    const tagIds: string[] = safeParseTagIds(rule.tagIds)
    for (const date of dates) {
      const txId = crypto.randomUUID()
      // ON CONFLICT DO NOTHING on tx_recurring_date_uq makes this idempotent (BR-11).
      const stmts = [
        db
          .insert(transactions)
          .values({
            id: txId,
            userId: rule.userId,
            type: rule.type,
            amount: rule.amount,
            walletId: rule.walletId,
            toWalletId: rule.toWalletId,
            categoryId: rule.categoryId,
            note: rule.note,
            occurredOn: date,
            recurringId: rule.id,
          })
          .onConflictDoNothing({ target: [transactions.recurringId, transactions.occurredOn] }),
        ...tagIds.map((tagId) =>
          db.insert(transactionTags).values({ transactionId: txId, tagId }).onConflictDoNothing(),
        ),
      ]
      const results = await db.batch(stmts as unknown as Parameters<Db['batch']>[0])
      // batch returns per-statement meta; the insert meta carries changes=0 on conflict.
      const insertMeta = results[0] as { meta?: { changes?: number } } | undefined
      const changes = insertMeta?.meta?.changes ?? (typeof insertMeta?.meta === 'undefined' ? 1 : 0)
      if (changes > 0) created += 1

      const after = nextOccurrence(anchor, date, rule.endDate)
      if (after === null) {
        await db
          .update(recurringRules)
          .set({ nextRunDate: date, lastRunDate: date, isActive: false }) // BR-13
          .where(eq(recurringRules.id, rule.id))
        break
      }
      await db
        .update(recurringRules)
        .set({ nextRunDate: after, lastRunDate: date })
        .where(eq(recurringRules.id, rule.id))
    }
    if (dates.length === 0) {
      // Rule was marked due but its window closed (endDate passed between runs).
      const after = nextOccurrence(anchor, today, rule.endDate)
      if (after === null) {
        await db.update(recurringRules).set({ isActive: false }).where(eq(recurringRules.id, rule.id))
      } else {
        await db.update(recurringRules).set({ nextRunDate: after }).where(eq(recurringRules.id, rule.id))
      }
    }
  }
  return { created }
}

function safeParseTagIds(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
