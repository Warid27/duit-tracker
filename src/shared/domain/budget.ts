// Budget status math (BR-09). Pure & unit-testable.
import { BUDGET_WARNING_PERCENT } from '@shared/constants'

export type BudgetStatus = 'ok' | 'warning' | 'over'

/** Percent spent against the monthly limit, rounded to integer for display. */
export function budgetPercent(spent: number, limit: number): number {
  if (limit <= 0) return 0
  return Math.round((spent / limit) * 100)
}

/** ok < 80%, warning 80–100%, over > 100% (BR-09). */
export function budgetStatus(spent: number, limit: number): BudgetStatus {
  const raw = limit > 0 ? (spent / limit) * 100 : 0
  if (raw > 100) return 'over'
  if (raw >= BUDGET_WARNING_PERCENT) return 'warning'
  return 'ok'
}

/** BR-10: alert fires when a saved expense pushes usage to ≥ 80%. */
export function shouldAlertBudget(previousSpent: number, spent: number, limit: number): boolean {
  if (limit <= 0) return false
  const before = budgetStatus(previousSpent, limit)
  const after = budgetStatus(spent, limit)
  return before === 'ok' && after !== 'ok'
}
