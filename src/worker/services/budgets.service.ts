// Monthly budget per expense category (spec BR-09). Spent computed in SQL.
import { and, eq, gte, lt, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { budgets, categories, transactions } from '../db/schema'
import { AppError } from '../lib/errors'
import { budgetPercent, budgetStatus } from '@shared/domain/budget'
import { monthRange } from '@shared/domain/dates'
import type { BudgetStatus } from '@shared/constants'

export interface BudgetRow {
  categoryId: string
  name: string
  color: string
  limit: number
  spent: number
  percent: number
  status: BudgetStatus
}

export async function listBudgets(db: Db, userId: string, monthKey: string): Promise<BudgetRow[]> {
  const { first, last } = monthRange(monthKey)
  const rows = await db
    .select({
      categoryId: budgets.categoryId,
      name: categories.name,
      color: categories.color,
      limit: budgets.amount,
      spent: sql<number>`coalesce((
        select sum(${transactions.amount}) from ${transactions}
        where ${transactions.userId} = ${budgets.userId}
          and ${transactions.categoryId} = ${budgets.categoryId}
          and ${transactions.type} = 'expense'
          and ${transactions.occurredOn} >= ${first}
          and ${transactions.occurredOn} <= ${last}
      ), 0)`,
    })
    .from(budgets)
    .innerJoin(categories, eq(categories.id, budgets.categoryId))
    .where(and(eq(budgets.userId, userId)))
    .orderBy(categories.name)
  return rows.map((r) => ({
    ...r,
    percent: budgetPercent(r.spent, r.limit),
    status: budgetStatus(r.spent, r.limit),
  }))
}

/** Upsert by category id; only expense categories can have a budget (BR-09). */
export async function upsertBudget(
  db: Db,
  userId: string,
  categoryId: string,
  amount: number,
): Promise<void> {
  const cat = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
    .get()
  if (!cat) throw AppError.notFound('Jenis tidak ditemukan.')
  if (cat.kind !== 'expense') throw AppError.validation('Budget hanya untuk jenis pengeluaran.')
  await db.batch([
    db
      .insert(budgets)
      .values({ id: crypto.randomUUID(), userId, categoryId, amount })
      .onConflictDoUpdate({ target: [budgets.userId, budgets.categoryId], set: { amount } }),
  ])
}

export async function deleteBudget(db: Db, userId: string, categoryId: string): Promise<void> {
  const existing = await db
    .select({ id: budgets.id })
    .from(budgets)
    .where(and(eq(budgets.userId, userId), eq(budgets.categoryId, categoryId)))
    .get()
  if (!existing) throw AppError.notFound('Budget tidak ditemukan.')
  await db.delete(budgets).where(and(eq(budgets.userId, userId), eq(budgets.categoryId, categoryId)))
}

/** Range-based spend used by reports for arbitrary from/to windows. */
export async function spendByCategory(db: Db, userId: string, fromIncl: string, toIncl: string) {
  const toExcl = addDays(toIncl, 1)
  return db
    .select({ categoryId: transactions.categoryId, spent: sql<number>`sum(${transactions.amount})` })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.type, 'expense'),
        gte(transactions.occurredOn, fromIncl),
        lt(transactions.occurredOn, toExcl),
        sql`${transactions.categoryId} is not null`,
      ),
    )
    .groupBy(transactions.categoryId)
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
