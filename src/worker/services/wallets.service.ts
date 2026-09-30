// Wallet CRUD + balance computation (spec 6.3, 6.4, BR-04, BR-05, BR-07).
import { and, asc, eq, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { transactions, wallets } from '../db/schema'
import { AppError } from '../lib/errors'
import { normalizeName } from '../lib/name'
import { recomputeInitialBalance } from '@shared/domain/balance'
import type { CreateWalletInput, UpdateWalletInput } from '@shared/schemas'

export interface WalletWithBalance {
  id: string
  name: string
  kind: string
  color: string
  sortOrder: number
  isArchived: boolean
  initialBalance: number
  balance: number
}

/**
 * Balance formula from spec 6.3, computed with one correlated aggregate per
 * wallet (no join fan-out): initial + income(in) - expense(out)
 * - transfer(out) + transfer(in).
 */
const BALANCE_EXPR = sql<number>`coalesce(${wallets.initialBalance}, 0) + coalesce((
    select sum(
      case
        when ${transactions.type} = 'income' then ${transactions.amount}
        when ${transactions.type} = 'expense' then -${transactions.amount}
        when ${transactions.type} = 'transfer' then -${transactions.amount}
        else 0
      end
    )
    from ${transactions}
    where ${transactions.userId} = ${wallets.userId}
      and ${transactions.walletId} = ${wallets.id}
  ), 0) + coalesce((
    select sum(${transactions.amount})
    from ${transactions}
    where ${transactions.userId} = ${wallets.userId}
      and ${transactions.type} = 'transfer'
      and ${transactions.toWalletId} = ${wallets.id}
  ), 0)`

async function balancesOf(db: Db, userId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ id: wallets.id, balance: BALANCE_EXPR })
    .from(wallets)
    .where(eq(wallets.userId, userId))
  return new Map(rows.map((r) => [r.id, r.balance]))
}

export async function listWallets(
  db: Db,
  userId: string,
  includeArchived: boolean,
): Promise<WalletWithBalance[]> {
  const conds = [eq(wallets.userId, userId)]
  if (!includeArchived) conds.push(eq(wallets.isArchived, false))
  const rows = await db
    .select()
    .from(wallets)
    .where(and(...conds))
    .orderBy(asc(wallets.sortOrder), asc(wallets.name))
  const balances = await balancesOf(db, userId)
  return rows.map((w) => ({ ...w, balance: balances.get(w.id) ?? w.initialBalance }))
}

async function assertNameFree(db: Db, userId: string, name: string, exceptId?: string): Promise<void> {
  const rows = await db
    .select({ id: wallets.id, name: wallets.name })
    .from(wallets)
    .where(eq(wallets.userId, userId))
  const norm = normalizeName(name)
  const clash = rows.find((r) => normalizeName(r.name) === norm && r.id !== exceptId)
  if (clash) throw AppError.duplicate('Kamu sudah punya dompet dengan nama itu.')
}

/** Spec 6.4: on create, "saldo saat ini" is stored directly as initial_balance. */
export async function createWallet(
  db: Db,
  userId: string,
  input: CreateWalletInput,
): Promise<WalletWithBalance> {
  await assertNameFree(db, userId, input.name)
  const id = crypto.randomUUID()
  const maxSort = await db
    .select({ m: sql<number>`coalesce(max(${wallets.sortOrder}), -1)` })
    .from(wallets)
    .where(eq(wallets.userId, userId))
    .get()
  try {
    await db.batch([
      db.insert(wallets).values({
        id,
        userId,
        name: input.name.trim(),
        kind: input.kind,
        color: input.color,
        initialBalance: input.currentBalance,
        sortOrder: (maxSort?.m ?? -1) + 1,
      }),
    ])
  } catch (err) {
    if (/UNIQUE/i.test(err instanceof Error ? err.message : String(err))) {
      throw AppError.duplicate('Kamu sudah punya dompet dengan nama itu.')
    }
    throw err
  }
  const w = await db.select().from(wallets).where(eq(wallets.id, id)).get()
  if (!w) throw AppError.notFound()
  return { ...w, balance: w.initialBalance }
}

export async function updateWallet(
  db: Db,
  userId: string,
  walletId: string,
  input: UpdateWalletInput,
): Promise<WalletWithBalance> {
  const existing = await db
    .select()
    .from(wallets)
    .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)))
    .get()
  if (!existing) throw AppError.notFound()
  const nextName = input.name !== undefined ? input.name.trim() : existing.name
  if (input.name !== undefined && normalizeName(nextName) !== normalizeName(existing.name)) {
    await assertNameFree(db, userId, nextName, walletId)
  }
  await db
    .update(wallets)
    .set({
      ...(input.name !== undefined ? { name: nextName } : {}),
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.isArchived !== undefined ? { isArchived: input.isArchived } : {}),
    })
    .where(eq(wallets.id, walletId))
  const updated = await db.select().from(wallets).where(eq(wallets.id, walletId)).get()
  if (!updated) throw AppError.notFound()
  const balances = await balancesOf(db, userId)
  return { ...updated, balance: balances.get(walletId) ?? updated.initialBalance }
}

/** Spec 6.4: set actual current balance without touching history. */
export async function setWalletBalance(db: Db, userId: string, walletId: string, currentBalance: number) {
  const existing = await db
    .select()
    .from(wallets)
    .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)))
    .get()
  if (!existing) throw AppError.notFound()
  const balances = await balancesOf(db, userId)
  const computed = balances.get(walletId) ?? existing.initialBalance
  let nextInitial: number
  try {
    nextInitial = recomputeInitialBalance(currentBalance, computed, existing.initialBalance)
  } catch {
    throw AppError.validation('Saldo di luar batas yang diperbolehkan.')
  }
  await db.update(wallets).set({ initialBalance: nextInitial }).where(eq(wallets.id, walletId))
  return { id: walletId, balance: currentBalance, initialBalance: nextInitial }
}

/** BR-05: only deletable when no transaction/recurring references it. */
export async function deleteWallet(db: Db, userId: string, walletId: string): Promise<void> {
  const existing = await db
    .select({ id: wallets.id })
    .from(wallets)
    .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)))
    .get()
  if (!existing) throw AppError.notFound()
  const used = await db
    .select({ c: sql<number>`count(*)` })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        sql`(${transactions.walletId} = ${walletId} or ${transactions.toWalletId} = ${walletId})`,
      ),
    )
    .get()
  if ((used?.c ?? 0) > 0) {
    throw AppError.inUse('Dompet ini sudah dipakai transaksi. Arsipkan saja kalau tidak lagi dipakai.')
  }
  // Recurring rules also reference wallets with ON DELETE RESTRICT.
  const { recurringRules } = await import('../db/schema')
  const ruleUsed = await db
    .select({ c: sql<number>`count(*)` })
    .from(recurringRules)
    .where(
      and(
        eq(recurringRules.userId, userId),
        sql`(${recurringRules.walletId} = ${walletId} OR ${recurringRules.toWalletId} = ${walletId})`,
      ),
    )
    .get()
  if ((ruleUsed?.c ?? 0) > 0) {
    throw AppError.inUse('Dompet ini masih dipakai aturan berulang. Hapus/jeda aturannya dulu.')
  }
  await db.delete(wallets).where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)))
}

/** Total balance across non-archived wallets (bootstrap header). */
export async function totalBalance(db: Db, userId: string): Promise<number> {
  const list = await listWallets(db, userId, false)
  return list.reduce((s, w) => s + w.balance, 0)
}

/** Used by transactions service: wallet must exist, belong to user, not archived (BR-04). */
export async function assertActiveWallet(
  db: Db,
  userId: string,
  walletId: string,
  label = 'dompet',
): Promise<void> {
  const w = await db
    .select()
    .from(wallets)
    .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)))
    .get()
  if (!w) throw AppError.notFound(`${label.charAt(0).toUpperCase() + label.slice(1)} tidak ditemukan.`)
  if (w.isArchived) throw AppError.validation(`Dompet "${w.name}" sudah diarsipkan. Pakai dompet lain.`)
}
