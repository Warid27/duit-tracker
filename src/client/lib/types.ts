// Client-side API types mirroring the /api contract (spec 9).
import type { BudgetStatus, PaletteColor } from '@shared/constants'

export interface SessionUser {
  id: string
  email: string
  name: string | null
}

export interface AppConfig {
  registrationEnabled: boolean
  timezone: string
}

export interface Wallet {
  id: string
  name: string
  kind: string
  color: PaletteColor | string
  sortOrder: number
  isArchived: boolean
  initialBalance: number
  balance: number
}

export interface Category {
  id: string
  name: string
  kind: 'income' | 'expense'
  color: PaletteColor | string
  sortOrder: number
  isArchived: boolean
  usageCount?: number
}

export interface Tag {
  id: string
  name: string
}

export interface TxDetail {
  id: string
  type: 'income' | 'expense' | 'transfer'
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

export interface BudgetAlert {
  categoryId: string
  categoryName: string
  limit: number
  spent: number
  percent: number
  status: string
}

export interface CreateTxResult {
  transaction: TxDetail
  budgetAlert?: BudgetAlert
}

export interface TransactionListResult {
  items: TxDetail[]
  page: number
  pageSize: number
  total: number
  totals: { income: number; expense: number }
}

export interface BudgetRow {
  categoryId: string
  name: string
  color: string
  limit: number
  spent: number
  percent: number
  status: BudgetStatus
}

export interface RecurringRule {
  id: string
  type: 'income' | 'expense' | 'transfer'
  amount: number
  walletId: string
  toWalletId: string | null
  categoryId: string | null
  note: string
  tagIds: string[]
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
  startDate: string
  endDate: string | null
  nextRunDate: string
  lastRunDate: string | null
  isActive: boolean
  createdAt: string
}

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
  budgets: BudgetRow[]
}

export interface TrendPoint {
  month: string
  income: number
  expense: number
}

export interface BootstrapData {
  wallets: Wallet[]
  totalBalance: number
  categories: Category[]
  tags: Tag[]
  recent: TxDetail[]
  todayExpense: number
  monthExpense: number
}
