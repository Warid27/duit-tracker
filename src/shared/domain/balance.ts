// Wallet balance math (spec 6.3 / 6.4). Pure functions used by tests and scripts;
// the worker computes balances with SQL aggregates for efficiency.
import { MAX_AMOUNT } from '@shared/constants'

export type BalanceTxn = {
  type: 'income' | 'expense' | 'transfer'
  amount: number
  walletId: string
  toWalletId?: string | null
}

/**
 * balance(w) = initial + SUM income(wallet=w) - SUM expense(wallet=w)
 *              - SUM transfer-out(wallet=w) + SUM transfer-in(toWallet=w)
 */
export function calcBalance(initialBalance: number, txns: readonly BalanceTxn[]): number {
  let bal = initialBalance
  for (const t of txns) {
    if (t.walletId != null) {
      // source side: income adds, expense & transfer-out subtract
      if (t.type === 'income') bal += t.amount
      else bal -= t.amount
    }
    if (t.type === 'transfer' && t.toWalletId != null) {
      bal += t.amount
    }
  }
  return bal
}

/**
 * Spec 6.4 "setting saldo saat ini": given the user-entered actual balance now,
 * compute the new initial_balance so today's computed balance equals it,
 * without touching historical transactions.
 */
export function recomputeInitialBalance(
  currentBalance: number,
  computedBalance: number,
  oldInitialBalance: number,
): number {
  const next = oldInitialBalance + (currentBalance - computedBalance)
  if (!Number.isInteger(next) || Math.abs(next) > MAX_AMOUNT) {
    throw new RangeError('Saldo di luar batas yang diperbolehkan.')
  }
  return next
}
