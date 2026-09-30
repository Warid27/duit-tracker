// Shared constants used by both client and worker.

export const MAX_TAGS_PER_TX = 5
export const MAX_NOTE_LENGTH = 200
export const MIN_NAME_LENGTH = 1
export const MAX_NAME_LENGTH = 40
export const MIN_PASSWORD_LENGTH = 8
export const MAX_PASSWORD_LENGTH = 128
export const MIN_AMOUNT = 1
export const MAX_AMOUNT = 999_999_999_999
export const MIN_OCCURRED_ON = '2000-01-01'
export const DEFAULT_PAGE_SIZE = 30
export const MAX_PAGE_SIZE = 100
export const RECENT_TRANSACTIONS_LIMIT = 5
export const CATEGORY_USAGE_WINDOW_DAYS = 60
export const TREND_MONTHS_DEFAULT = 6
export const MAX_RECURRING_ITERATIONS_PER_RUN = 366
export const UNDO_DELAY_MS = 5000

// Budget status thresholds (BR-09)
export const BUDGET_WARNING_PERCENT = 80

export type WalletKind = 'cash' | 'bank' | 'ewallet' | 'other'
export type CategoryKind = 'income' | 'expense'
export type TransactionType = 'income' | 'expense' | 'transfer'
export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly'
export type BudgetStatus = 'ok' | 'warning' | 'over'

export const WALLET_KINDS: readonly WalletKind[] = ['cash', 'bank', 'ewallet', 'other']
export const CATEGORY_KINDS: readonly CategoryKind[] = ['income', 'expense']
export const TRANSACTION_TYPES: readonly TransactionType[] = ['income', 'expense', 'transfer']
export const RECURRING_FREQUENCIES: readonly RecurringFrequency[] = [
  'daily',
  'weekly',
  'monthly',
  'yearly',
]

/** Data-viz palette (spec 12.3). Stored by token name, never raw hex. */
export const PALETTE = {
  sage: '#7D8F69',
  clay: '#B5654A',
  ochre: '#C9A24E',
  indigo: '#4A5A78',
  wood: '#9A7B5B',
  plum: '#85607A',
  stone: '#8C8880',
  sea: '#6E8F8C',
} as const

export type PaletteColor = keyof typeof PALETTE
export const PALETTE_COLORS = Object.keys(PALETTE) as PaletteColor[]

export function isValidPaletteColor(value: string): value is PaletteColor {
  return (PALETTE_COLORS as readonly string[]).includes(value)
}

/** UI labels (Indonesian) for enum values. */
export const WALLET_KIND_LABELS: Record<WalletKind, string> = {
  cash: 'Tunai',
  bank: 'Bank',
  ewallet: 'E-Wallet',
  other: 'Lainnya',
}

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  income: 'Masuk',
  expense: 'Keluar',
  transfer: 'Pindah',
}

export const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  daily: 'Harian',
  weekly: 'Mingguan',
  monthly: 'Bulanan',
  yearly: 'Tahunan',
}
