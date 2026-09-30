// Reports (spec 9.1) + CSV export (spec 9.2). Aggregation happens in SQL.
import { and, desc, eq, gte, lte, lt, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { categories, tags, transactionTags, transactions, wallets } from '../db/schema'
import { AppError } from '../lib/errors'
import { listBudgets } from './budgets.service'
import { TRANSACTION_TYPE_LABELS, type TransactionType } from '@shared/constants'
import {
  addMonths,
  datesOfMonth,
  daysInMonth,
  lastNMonths,
  monthKeyOf,
  monthRange,
  todayIn,
} from '@shared/domain/dates'
import { csvFileName, transactionsToCsv, type CsvTransactionRow } from '@shared/domain/csv'

export interface ReportSummary {
  month: string
  income: number
  expense: number
  net: number
  previousExpense: number
  expenseChangePercent: number | null
  avgDailyExpense: number
  projectedExpense: number | null
  byCategory: { categoryId: string; name: string; color: string; total: number; percent: number }[]
  byTag: { tagId: string; name: string; total: number; percent: number }[]
  daily: { date: string; income: number; expense: number }[]
  topExpenses: {
    id: string
    note: string
    amount: number
    occurredOn: string
    categoryName: string | null
    categoryColor: string | null
  }[]
  budgets: Awaited<ReturnType<typeof listBudgets>>
}

async function sumByType(
  db: Db,
  userId: string,
  type: 'income' | 'expense',
  fromIncl: string,
  toExcl: string,
): Promise<number> {
  const row = await db
    .select({ total: sql<number>`coalesce(sum(${transactions.amount}), 0)` })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.type, type),
        gte(transactions.occurredOn, fromIncl),
        lt(transactions.occurredOn, toExcl),
      ),
    )
    .get()
  return row?.total ?? 0
}

/** Validate `month` param or default to the current month in APP_TIMEZONE. */
export function resolveMonth(month: string | undefined, timezone: string): string {
  if (!month) return monthKeyOf(todayIn(timezone))
  if (!/^\d{4}-\d{2}$/.test(month)) throw AppError.validation('Format bulan tidak valid.')
  return month
}

export async function summary(
  db: Db,
  userId: string,
  monthKey: string,
  timezone: string,
): Promise<ReportSummary> {
  const { first } = monthRange(monthKey)
  const nextFirst = `${addMonths(monthKey, 1)}-01`
  const prevKey = addMonths(monthKey, -1)
  const prevRange = monthRange(prevKey)
  const prevNextFirst = `${addMonths(prevKey, 1)}-01`

  const income = await sumByType(db, userId, 'income', first, nextFirst)
  const expense = await sumByType(db, userId, 'expense', first, nextFirst)
  const previousExpense = await sumByType(db, userId, 'expense', prevRange.first, prevNextFirst)

  const today = todayIn(timezone)
  const isCurrentMonth = monthKeyOf(today) === monthKey
  const year = Number(monthKey.slice(0, 4))
  const monthNum = Number(monthKey.slice(5, 7))
  const daysElapsed = isCurrentMonth ? Number.parseInt(today.slice(8), 10) : daysInMonth(year, monthNum)
  const totalDays = daysInMonth(year, monthNum)
  const avgDailyExpense = daysElapsed > 0 ? Math.round(expense / daysElapsed) : 0
  const expenseChangePercent =
    previousExpense > 0 ? Math.round(((expense - previousExpense) / previousExpense) * 100) : null

  // Expense per category, largest first.
  const catRows = await db
    .select({
      categoryId: transactions.categoryId,
      name: categories.name,
      color: categories.color,
      total: sql<number>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.type, 'expense'),
        gte(transactions.occurredOn, first),
        lt(transactions.occurredOn, nextFirst),
      ),
    )
    .groupBy(transactions.categoryId, categories.name, categories.color)
    .orderBy(desc(sql`sum(${transactions.amount})`))
  const byCategory = catRows.map((r) => ({
    categoryId: r.categoryId ?? '',
    name: r.name,
    color: r.color,
    total: r.total,
    percent: expense > 0 ? Math.round((r.total / expense) * 100) : 0,
  }))

  // Expense per tag.
  const tagRows = await db
    .select({
      tagId: transactionTags.tagId,
      name: tags.name,
      total: sql<number>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .innerJoin(transactionTags, eq(transactionTags.transactionId, transactions.id))
    .innerJoin(tags, eq(tags.id, transactionTags.tagId))
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.type, 'expense'),
        gte(transactions.occurredOn, first),
        lt(transactions.occurredOn, nextFirst),
      ),
    )
    .groupBy(transactionTags.tagId, tags.name)
    .orderBy(desc(sql`sum(${transactions.amount})`))
  const byTag = tagRows.map((r) => ({
    tagId: r.tagId,
    name: r.name,
    total: r.total,
    percent: expense > 0 ? Math.round((r.total / expense) * 100) : 0,
  }))

  // Daily income/expense across the whole month (empty days included as 0).
  const dailyRows = await db
    .select({
      date: transactions.occurredOn,
      income: sql<number>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amount} else 0 end), 0)`,
      expense: sql<number>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amount} else 0 end), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        gte(transactions.occurredOn, first),
        lt(transactions.occurredOn, nextFirst),
        sql`${transactions.type} <> 'transfer'`,
      ),
    )
    .groupBy(transactions.occurredOn)
  const dailyMap = new Map(dailyRows.map((r) => [r.date, r]))
  const daily = datesOfMonth(monthKey).map((date) => ({
    date,
    income: dailyMap.get(date)?.income ?? 0,
    expense: dailyMap.get(date)?.expense ?? 0,
  }))

  const topRows = await db
    .select({
      id: transactions.id,
      note: transactions.note,
      amount: transactions.amount,
      occurredOn: transactions.occurredOn,
      categoryName: categories.name,
      categoryColor: categories.color,
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.type, 'expense'),
        gte(transactions.occurredOn, first),
        lt(transactions.occurredOn, nextFirst),
      ),
    )
    .orderBy(desc(transactions.amount))
    .limit(5)

  return {
    month: monthKey,
    income,
    expense,
    net: income - expense,
    previousExpense,
    expenseChangePercent,
    avgDailyExpense,
    projectedExpense: isCurrentMonth ? avgDailyExpense * totalDays : null,
    byCategory,
    byTag,
    daily,
    topExpenses: topRows.map((r) => ({
      id: r.id,
      note: r.note,
      amount: r.amount,
      occurredOn: r.occurredOn,
      categoryName: r.categoryName ?? null,
      categoryColor: r.categoryColor ?? null,
    })),
    budgets: await listBudgets(db, userId, monthKey),
  }
}

export interface TrendPoint {
  month: string
  income: number
  expense: number
}

/** Last N months (oldest -> newest); empty months are 0 (spec 9 trend). */
export async function trend(db: Db, userId: string, months: number, timezone: string): Promise<TrendPoint[]> {
  const keys = lastNMonths(monthKeyOf(todayIn(timezone)), months)
  const lastKey = keys[keys.length - 1] ?? monthKeyOf(todayIn(timezone))
  const firstKey = keys[0] ?? lastKey
  const rows = await db
    .select({
      month: sql<string>`substr(${transactions.occurredOn}, 1, 7)`,
      income: sql<number>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amount} else 0 end), 0)`,
      expense: sql<number>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amount} else 0 end), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        gte(transactions.occurredOn, `${firstKey}-01`),
        lt(transactions.occurredOn, `${addMonths(lastKey, 1)}-01`),
        sql`${transactions.type} <> 'transfer'`,
      ),
    )
    .groupBy(sql`substr(${transactions.occurredOn}, 1, 7)`)
  const map = new Map(rows.map((r) => [r.month, r]))
  return keys.map((month) => ({
    month,
    income: map.get(month)?.income ?? 0,
    expense: map.get(month)?.expense ?? 0,
  }))
}

export async function walletBalances(db: Db, userId: string) {
  const { listWallets } = await import('./wallets.service')
  const list = await listWallets(db, userId, false)
  return {
    wallets: list.map((w) => ({ id: w.id, name: w.name, color: w.color, balance: w.balance })),
    total: list.reduce((s, w) => s + w.balance, 0),
  }
}

/** CSV export (spec 9.2): own data only, defaults to the current month. */
export async function exportCsv(db: Db, userId: string, timezone: string, from?: string, to?: string) {
  const today = todayIn(timezone)
  const range = monthRange(monthKeyOf(today))
  const fromD = from ?? range.first
  const toD = to ?? range.last
  if (fromD > toD) throw AppError.validation('Tanggal mulai harus sebelum tanggal akhir.')

  const rows = await db
    .select({
      id: transactions.id,
      occurredOn: transactions.occurredOn,
      type: transactions.type,
      amount: transactions.amount,
      note: transactions.note,
      walletName: wallets.name,
      toWalletName: sql<
        string | null
      >`(select w2.name from wallets w2 inner join transactions t2 on t2.to_wallet_id = w2.id where t2.id = ${transactions.id} limit 1)`,
      categoryName: categories.name,
    })
    .from(transactions)
    .innerJoin(wallets, eq(wallets.id, transactions.walletId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.userId, userId),
        gte(transactions.occurredOn, fromD),
        lte(transactions.occurredOn, toD),
      ),
    )
    .orderBy(transactions.occurredOn, transactions.createdAt)

  // Tags per transaction in one extra query.
  const tagLinkRows = await db
    .select({ txId: transactionTags.transactionId, name: tags.name })
    .from(transactionTags)
    .innerJoin(transactions, eq(transactions.id, transactionTags.transactionId))
    .innerJoin(tags, eq(tags.id, transactionTags.tagId))
    .where(
      and(
        eq(transactions.userId, userId),
        gte(transactions.occurredOn, fromD),
        lte(transactions.occurredOn, toD),
      ),
    )
  const tagMap = new Map<string, string[]>()
  for (const r of tagLinkRows) {
    const arr = tagMap.get(r.txId) ?? []
    arr.push(r.name)
    tagMap.set(r.txId, arr)
  }

  const csvRows: CsvTransactionRow[] = rows.map((r) => ({
    occurredOn: r.occurredOn,
    typeLabel: TRANSACTION_TYPE_LABELS[r.type as TransactionType] ?? r.type,
    walletName: r.walletName,
    toWalletName: r.toWalletName ?? '',
    categoryName: r.categoryName ?? '',
    tags: (tagMap.get(r.id) ?? []).join('; '),
    amount: r.amount,
    note: r.note,
  }))
  return { filename: csvFileName(fromD, toD), body: transactionsToCsv(csvRows) }
}
