// Transaction business logic (spec 7: BR-01..BR-04, BR-08, BR-10). All queries
// are user-scoped; cross-user access surfaces as 404 (spec 4.3).
import { and, desc, eq, gte, lt, lte, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { budgets, categories, tags, transactionTags, transactions, wallets } from '../db/schema'
import { AppError } from '../lib/errors'
import { assertActiveWallet } from './wallets.service'
import { resolveTagIds } from './tags.service'
import { shouldAlertBudget } from '@shared/domain/budget'
import { MIN_OCCURRED_ON } from '@shared/constants'
import type { CreateTransactionInput, ListTransactionsQuery, UpdateTransactionInput } from '@shared/schemas'

export interface TxDetail {
  id: string
  type: string
  amount: number
  walletId: string
  walletName: string
  toWalletId: string | null
  toWalletName: string | null
  categoryId: string | null
  categoryName: string | null
  categoryColor: string | null
  note: string
  occurredOn: string
  recurringId: string | null
  tagIds: string[]
  tagNames: string[]
  createdAt: string
  updatedAt: string
}

type TxRow = typeof transactions.$inferSelect

/** BR-01/BR-02/BR-03/BR-04/BR-08 validation shared by create & update. */
async function validateShape(
  db: Db,
  userId: string,
  v: {
    type: string
    amount: number
    walletId: string
    toWalletId?: string | null
    categoryId?: string | null
    occurredOn: string
  },
): Promise<void> {
  await assertActiveWallet(db, userId, v.walletId)

  if (v.type === 'transfer') {
    // BR-02: transfer needs a distinct destination, no category.
    if (!v.toWalletId) throw AppError.validation('Pilih dompet tujuan untuk transfer.')
    if (v.toWalletId === v.walletId) throw AppError.validation('Dompet asal dan tujuan tidak boleh sama.')
    if (v.categoryId) throw AppError.validation('Transfer tidak punya jenis.')
    await assertActiveWallet(db, userId, v.toWalletId, 'dompet tujuan')
  } else {
    if (v.toWalletId) throw AppError.validation('Hanya transfer yang punya dompet tujuan.')
    // BR-01: category kind must match the transaction type.
    if (!v.categoryId) throw AppError.validation('Pilih jenis dulu.')
    const cat = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, v.categoryId), eq(categories.userId, userId)))
      .get()
    if (!cat) throw AppError.notFound('Jenis tidak ditemukan.')
    if (cat.isArchived) throw AppError.validation(`Jenis "${cat.name}" sudah diarsipkan. Pilih jenis lain.`)
    if (cat.kind !== v.type) {
      throw AppError.validation(
        v.type === 'income' ? 'Jenis itu bukan jenis pemasukan.' : 'Jenis itu bukan jenis pengeluaran.',
      )
    }
  }

  // BR-03: date bounds.
  if (v.occurredOn < MIN_OCCURRED_ON) {
    throw AppError.validation('Tanggal terlalu lama, minimal 2000-01-01.')
  }
}

async function loadDetail(db: Db, row: TxRow): Promise<TxDetail> {
  const linkRows = await db
    .select({ tagId: transactionTags.tagId, name: tags.name })
    .from(transactionTags)
    .innerJoin(tags, eq(tags.id, transactionTags.tagId))
    .where(eq(transactionTags.transactionId, row.id))
  const w = await db.select({ name: wallets.name }).from(wallets).where(eq(wallets.id, row.walletId)).get()
  let toWalletName: string | null = null
  if (row.toWalletId) {
    const tw = await db
      .select({ name: wallets.name })
      .from(wallets)
      .where(eq(wallets.id, row.toWalletId))
      .get()
    toWalletName = tw?.name ?? null
  }
  let categoryName: string | null = null
  let categoryColor: string | null = null
  if (row.categoryId) {
    const c = await db
      .select({ name: categories.name, color: categories.color })
      .from(categories)
      .where(eq(categories.id, row.categoryId))
      .get()
    categoryName = c?.name ?? null
    categoryColor = c?.color ?? null
  }
  return {
    id: row.id,
    type: row.type,
    amount: row.amount,
    walletId: row.walletId,
    walletName: w?.name ?? '',
    toWalletId: row.toWalletId,
    toWalletName,
    categoryId: row.categoryId,
    categoryName,
    categoryColor,
    note: row.note,
    occurredOn: row.occurredOn,
    recurringId: row.recurringId,
    tagIds: linkRows.map((r) => r.tagId),
    tagNames: linkRows.map((r) => r.name),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function tagLinkStmts(db: Db, txId: string, tagIds: readonly string[]) {
  return tagIds.map((tagId) => db.insert(transactionTags).values({ transactionId: txId, tagId }))
}

export interface CreateTxResult {
  transaction: TxDetail
  budgetAlert?: {
    categoryId: string
    categoryName: string
    limit: number
    spent: number
    percent: number
    status: string
  }
}

/** BR-10: after saving an expense, alert when the category budget crossed 80%. */
async function maybeBudgetAlert(
  db: Db,
  userId: string,
  categoryId: string | null | undefined,
  monthFirst: string,
  monthNext: string,
): Promise<CreateTxResult['budgetAlert'] | undefined> {
  if (!categoryId) return undefined
  const budget = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.userId, userId), eq(budgets.categoryId, categoryId)))
    .get()
  if (!budget) return undefined
  const spendRow = await db
    .select({ spent: sql<number>`coalesce(sum(${transactions.amount}), 0)` })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.categoryId, categoryId),
        eq(transactions.type, 'expense'),
        gte(transactions.occurredOn, monthFirst),
        lt(transactions.occurredOn, monthNext),
      ),
    )
    .get()
  const spent = spendRow?.spent ?? 0
  const cat = await db
    .select({ name: categories.name })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .get()
  const percent = Math.round((spent / budget.amount) * 100)
  const status = spent > budget.amount ? 'over' : percent >= 80 ? 'warning' : 'ok'
  return {
    categoryId,
    categoryName: cat?.name ?? '',
    limit: budget.amount,
    spent,
    percent,
    status,
  }
}

export async function createTransaction(
  db: Db,
  userId: string,
  input: CreateTransactionInput,
  today: string,
): Promise<CreateTxResult> {
  if (input.occurredOn > today) throw AppError.validation('Tanggal tidak boleh di masa depan.') // BR-03
  await validateShape(db, userId, input)

  const tagIds = await resolveTagIds(db, userId, input.tagIds ?? [])
  if (input.tagIds && tagIds.length !== new Set(input.tagIds).size) {
    // Unknown tag ids are rejected on explicit user input (recurring drops silently).
    throw AppError.notFound('Ada tag yang tidak kamu kenal.')
  }
  if (input.type === 'transfer' && tagIds.length > 0) {
    throw AppError.validation('Transfer tidak bisa diberi tag.') // BR-02
  }

  const id = crypto.randomUUID()
  const monthFirst = `${input.occurredOn.slice(0, 7)}-01`
  const nextMonthKey = bumpMonth(input.occurredOn.slice(0, 7))
  const stmts = [
    db.insert(transactions).values({
      id,
      userId,
      type: input.type,
      amount: input.amount,
      walletId: input.walletId,
      toWalletId: input.type === 'transfer' ? (input.toWalletId ?? null) : null,
      categoryId: input.type === 'transfer' ? null : (input.categoryId ?? null),
      note: input.note,
      occurredOn: input.occurredOn,
    }),
    ...tagLinkStmts(db, id, tagIds),
  ]
  await db.batch(stmts as unknown as Parameters<Db['batch']>[0])

  const row = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .get()
  if (!row) throw AppError.notFound()
  const transaction = await loadDetail(db, row)

  // BR-10: compute alert AFTER insert so `spent` includes this transaction;
  // only fires when the crossing happened now (previous spend was under 80%).
  let budgetAlert: CreateTxResult['budgetAlert']
  if (input.type === 'expense') {
    const prevSpent =
      (await monthSpend(db, userId, row.categoryId, monthFirst, `${nextMonthKey}-01`)) - input.amount
    const alert = await maybeBudgetAlert(db, userId, row.categoryId, monthFirst, `${nextMonthKey}-01`)
    if (alert && shouldAlertBudget(prevSpent, alert.spent, alert.limit)) budgetAlert = alert
  }
  return { transaction, ...(budgetAlert ? { budgetAlert } : {}) }
}

function bumpMonth(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number) as [number, number]
  return m === 12
    ? `${String(y + 1).padStart(4, '0')}-01`
    : `${String(y).padStart(4, '0')}-${String(m + 1).padStart(2, '0')}`
}

async function monthSpend(
  db: Db,
  userId: string,
  categoryId: string | null,
  fromIncl: string,
  toExcl: string,
): Promise<number> {
  if (!categoryId) return 0
  const row = await db
    .select({ spent: sql<number>`coalesce(sum(${transactions.amount}), 0)` })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.categoryId, categoryId),
        eq(transactions.type, 'expense'),
        gte(transactions.occurredOn, fromIncl),
        lt(transactions.occurredOn, toExcl),
      ),
    )
    .get()
  return row?.spent ?? 0
}

async function getOwned(db: Db, userId: string, id: string): Promise<TxRow> {
  const row = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .get()
  if (!row) throw AppError.notFound('Catatan tidak ditemukan.')
  return row
}

export async function getTransaction(db: Db, userId: string, id: string): Promise<TxDetail> {
  return loadDetail(db, await getOwned(db, userId, id))
}

export async function updateTransaction(
  db: Db,
  userId: string,
  id: string,
  input: UpdateTransactionInput,
  today: string,
): Promise<TxDetail> {
  const existing = await getOwned(db, userId, id)
  const merged = {
    type: input.type ?? existing.type,
    amount: input.amount ?? existing.amount,
    walletId: input.walletId ?? existing.walletId,
    toWalletId: input.toWalletId !== undefined ? input.toWalletId : existing.toWalletId,
    categoryId: input.categoryId !== undefined ? input.categoryId : existing.categoryId,
    occurredOn: input.occurredOn ?? existing.occurredOn,
  }
  if (merged.occurredOn > today) throw AppError.validation('Tanggal tidak boleh di masa depan.')
  await validateShape(db, userId, merged)

  const stmts = [
    db
      .update(transactions)
      .set({
        type: merged.type,
        amount: merged.amount,
        walletId: merged.walletId,
        toWalletId: merged.type === 'transfer' ? merged.toWalletId : null,
        categoryId: merged.type === 'transfer' ? null : merged.categoryId,
        note: input.note ?? existing.note,
        occurredOn: merged.occurredOn,
        updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
      })
      .where(eq(transactions.id, id)),
  ]
  if (input.tagIds !== undefined) {
    const tagIds = await resolveTagIds(db, userId, input.tagIds)
    if (new Set(input.tagIds).size !== tagIds.length)
      throw AppError.notFound('Ada tag yang tidak kamu kenal.')
    if (merged.type === 'transfer' && tagIds.length > 0)
      throw AppError.validation('Transfer tidak bisa diberi tag.')
    stmts.push(
      db
        .delete(transactionTags)
        .where(eq(transactionTags.transactionId, id)) as unknown as (typeof stmts)[number],
      ...(tagLinkStmts(db, id, tagIds) as unknown as (typeof stmts)[number][]),
    )
  }
  await db.batch(stmts as unknown as Parameters<Db['batch']>[0])
  return loadDetail(db, await getOwned(db, userId, id))
}

export async function deleteTransaction(db: Db, userId: string, id: string): Promise<void> {
  await getOwned(db, userId, id)
  // Links cascade via FK, but be explicit for D1 batch semantics.
  await db.batch([
    db.delete(transactionTags).where(eq(transactionTags.transactionId, id)),
    db.delete(transactions).where(and(eq(transactions.id, id), eq(transactions.userId, userId))),
  ])
}

export interface TransactionListResult {
  items: TxDetail[]
  page: number
  pageSize: number
  total: number
  totals: { income: number; expense: number }
}

export async function listTransactions(
  db: Db,
  userId: string,
  q: ListTransactionsQuery,
): Promise<TransactionListResult> {
  const conds = [eq(transactions.userId, userId)]
  if (q.from) conds.push(gte(transactions.occurredOn, q.from))
  if (q.to) conds.push(lte(transactions.occurredOn, q.to))
  if (q.type) conds.push(eq(transactions.type, q.type))
  if (q.walletId) conds.push(eq(transactions.walletId, q.walletId))
  if (q.categoryId) conds.push(eq(transactions.categoryId, q.categoryId))
  if (q.tagId) {
    conds.push(
      sql`${transactions.id} in (select transaction_id from transaction_tags where tag_id = ${q.tagId})`,
    )
  }
  if (q.q) {
    const like = `%${q.q.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
    conds.push(sql`${transactions.note} like ${like} escape '\\'`)
  }
  const where = and(...conds)

  const countRow = await db
    .select({ c: sql<number>`count(*)` })
    .from(transactions)
    .where(where)
    .get()
  const total = countRow?.c ?? 0

  // Totals follow the filter but exclude transfers (spec §9).
  const totalsRow = await db
    .select({
      income: sql<number>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amount} else 0 end), 0)`,
      expense: sql<number>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amount} else 0 end), 0)`,
    })
    .from(transactions)
    .where(where)
    .get()

  const rows = await db
    .select()
    .from(transactions)
    .where(where)
    .orderBy(desc(transactions.occurredOn), desc(transactions.createdAt))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize)

  const items = await Promise.all(rows.map((r) => loadDetail(db, r)))
  return {
    items,
    page: q.page,
    pageSize: q.pageSize,
    total,
    totals: { income: totalsRow?.income ?? 0, expense: totalsRow?.expense ?? 0 },
  }
}

/** Recent N transactions for the Catat page ("Terakhir dicatat"). */
export async function recentTransactions(db: Db, userId: string, limit: number): Promise<TxDetail[]> {
  const rows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(desc(transactions.occurredOn), desc(transactions.createdAt))
    .limit(limit)
  return Promise.all(rows.map((r) => loadDetail(db, r)))
}

/** Day-of-month sums used by bootstrap totals (today / month-to-date expenses). */
export async function expenseTotals(
  db: Db,
  userId: string,
  today: string,
): Promise<{ todayExpense: number; monthExpense: number }> {
  const monthFirst = `${today.slice(0, 7)}-01`
  const row = await db
    .select({
      todayExpense: sql<number>`coalesce(sum(case when ${transactions.occurredOn} = ${today} then ${transactions.amount} else 0 end), 0)`,
      monthExpense: sql<number>`coalesce(sum(case when ${transactions.occurredOn} >= ${monthFirst} then ${transactions.amount} else 0 end), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.type, 'expense'),
        gte(transactions.occurredOn, monthFirst),
        lte(transactions.occurredOn, today),
      ),
    )
    .get()
  return { todayExpense: row?.todayExpense ?? 0, monthExpense: row?.monthExpense ?? 0 }
}

/** Last non-transfer wallet used — default wallet on the Catat page. */
export async function lastUsedWalletId(db: Db, userId: string): Promise<string | null> {
  const row = await db
    .select({ walletId: transactions.walletId })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), sql`${transactions.type} <> 'transfer'`))
    .orderBy(desc(transactions.occurredOn), desc(transactions.createdAt))
    .limit(1)
    .get()
  return row?.walletId ?? null
}
