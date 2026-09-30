import { z } from 'zod'
import {
  CATEGORY_KINDS,
  MAX_AMOUNT,
  MAX_NAME_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_PAGE_SIZE,
  MAX_PASSWORD_LENGTH,
  MAX_TAGS_PER_TX,
  MIN_AMOUNT,
  MIN_NAME_LENGTH,
  MIN_PASSWORD_LENGTH,
  PALETTE_COLORS,
  RECURRING_FREQUENCIES,
  TRANSACTION_TYPES,
  WALLET_KINDS,
} from '@shared/constants'

// ---------------------------------------------------------------------------
// Reusable primitives
// ---------------------------------------------------------------------------

const trimmedString = (min: number, max: number, label: string) =>
  z.string().trim().min(min, `${label} tidak boleh kosong.`).max(max, `${label} maksimal ${max} karakter.`)

const trimmedOptionalString = (max: number, label: string) =>
  z.string().trim().max(max, `${label} maksimal ${max} karakter.`)

const idSchema = z.string().min(1).max(64)

/** `YYYY-MM-DD` calendar date. */
export const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal tidak valid.')

/** `YYYY-MM` month key. */
export const monthStringSchema = z.string().regex(/^\d{4}-\d{2}$/, 'Format bulan tidak valid.')

const moneyAmountSchema = z
  .number({ message: 'Nominal harus angka.' })
  .int('Nominal harus Rupiah utuh.')
  .min(MIN_AMOUNT, 'Nominal minimal Rp 1.')
  .max(MAX_AMOUNT, 'Nominal terlalu besar.')

/** Balances may be negative (e.g. credit card wallets). */
const balanceSchema = z
  .number({ message: 'Saldo harus angka.' })
  .int('Saldo harus Rupiah utuh.')
  .min(-MAX_AMOUNT)
  .max(MAX_AMOUNT)

const paletteColorSchema = z.enum(PALETTE_COLORS as [PaletteColorTuple, ...PaletteColorTuple[]])
type PaletteColorTuple = (typeof PALETTE_COLORS)[number]

const walletKindSchema = z.enum(WALLET_KINDS as [WalletKindTuple, ...WalletKindTuple[]])
type WalletKindTuple = (typeof WALLET_KINDS)[number]

const categoryKindSchema = z.enum(CATEGORY_KINDS as [CategoryKindTuple, ...CategoryKindTuple[]])
type CategoryKindTuple = (typeof CATEGORY_KINDS)[number]

const transactionTypeSchema = z.enum(TRANSACTION_TYPES as [TxTypeTuple, ...TxTypeTuple[]])
type TxTypeTuple = (typeof TRANSACTION_TYPES)[number]

const frequencySchema = z.enum(RECURRING_FREQUENCIES as [FreqTuple, ...FreqTuple[]])
type FreqTuple = (typeof RECURRING_FREQUENCIES)[number]

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email wajib diisi.')
  .max(254)
  .email('Format email tidak valid.')
  .transform((v) => v.toLowerCase())

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password minimal ${MIN_PASSWORD_LENGTH} karakter.`)
  .max(MAX_PASSWORD_LENGTH, `Password maksimal ${MAX_PASSWORD_LENGTH} karakter.`)

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: trimmedOptionalString(MAX_NAME_LENGTH, 'Nama').optional(),
})
export type RegisterInput = z.infer<typeof registerSchema>

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password wajib diisi.'),
})
export type LoginInput = z.infer<typeof loginSchema>

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Password saat ini wajib diisi.'),
  newPassword: passwordSchema,
})
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>

// ---------------------------------------------------------------------------
// Wallets
// ---------------------------------------------------------------------------

export const createWalletSchema = z.object({
  name: trimmedString(MIN_NAME_LENGTH, MAX_NAME_LENGTH, 'Nama dompet'),
  kind: walletKindSchema.default('other'),
  currentBalance: balanceSchema.default(0),
  color: paletteColorSchema,
})
export type CreateWalletInput = z.infer<typeof createWalletSchema>

export const updateWalletSchema = z.object({
  name: trimmedString(MIN_NAME_LENGTH, MAX_NAME_LENGTH, 'Nama dompet').optional(),
  kind: walletKindSchema.optional(),
  color: paletteColorSchema.optional(),
  isArchived: z.boolean().optional(),
})
export type UpdateWalletInput = z.infer<typeof updateWalletSchema>

export const setWalletBalanceSchema = z.object({
  currentBalance: balanceSchema,
})
export type SetWalletBalanceInput = z.infer<typeof setWalletBalanceSchema>

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const createCategorySchema = z.object({
  name: trimmedString(MIN_NAME_LENGTH, MAX_NAME_LENGTH, 'Nama jenis'),
  kind: categoryKindSchema,
  color: paletteColorSchema,
})
export type CreateCategoryInput = z.infer<typeof createCategorySchema>

export const updateCategorySchema = z.object({
  name: trimmedString(MIN_NAME_LENGTH, MAX_NAME_LENGTH, 'Nama jenis').optional(),
  color: paletteColorSchema.optional(),
  isArchived: z.boolean().optional(),
})
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export const createTagSchema = z.object({
  name: trimmedString(MIN_NAME_LENGTH, MAX_NAME_LENGTH, 'Nama tag'),
})
export type CreateTagInput = z.infer<typeof createTagSchema>

export const updateTagSchema = z.object({
  name: trimmedString(MIN_NAME_LENGTH, MAX_NAME_LENGTH, 'Nama tag'),
})
export type UpdateTagInput = z.infer<typeof updateTagSchema>

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

const transactionTagIdsSchema = z
  .array(idSchema)
  .max(MAX_TAGS_PER_TX, `Maksimal ${MAX_TAGS_PER_TX} tag per transaksi.`)
  .optional()

export const createTransactionSchema = z.object({
  type: transactionTypeSchema,
  amount: moneyAmountSchema,
  walletId: idSchema,
  toWalletId: idSchema.optional(),
  categoryId: idSchema.optional(),
  tagIds: transactionTagIdsSchema,
  note: trimmedOptionalString(MAX_NOTE_LENGTH, 'Catatan').default(''),
  occurredOn: dateStringSchema,
})
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>

/** PATCH accepts the same fields, all optional. Cross-field BR checks run in the service. */
export const updateTransactionSchema = createTransactionSchema.partial()
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>

export const listTransactionsQuerySchema = z.object({
  from: dateStringSchema.optional(),
  to: dateStringSchema.optional(),
  type: transactionTypeSchema.optional(),
  walletId: idSchema.optional(),
  categoryId: idSchema.optional(),
  tagId: idSchema.optional(),
  q: trimmedOptionalString(100, 'Pencarian').optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(30),
})
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

export const upsertBudgetSchema = z.object({
  amount: moneyAmountSchema,
})
export type UpsertBudgetInput = z.infer<typeof upsertBudgetSchema>

// ---------------------------------------------------------------------------
// Recurring rules
// ---------------------------------------------------------------------------

export const createRecurringSchema = z
  .object({
    type: transactionTypeSchema,
    amount: moneyAmountSchema,
    walletId: idSchema,
    toWalletId: idSchema.optional(),
    categoryId: idSchema.optional(),
    tagIds: transactionTagIdsSchema,
    note: trimmedOptionalString(MAX_NOTE_LENGTH, 'Catatan').default(''),
    frequency: frequencySchema,
    startDate: dateStringSchema,
    endDate: dateStringSchema.optional(),
  })
  .refine((v) => (v.endDate ? v.endDate >= v.startDate : true), {
    message: 'Tanggal berakhir tidak boleh sebelum tanggal mulai.',
    path: ['endDate'],
  })
export type CreateRecurringInput = z.infer<typeof createRecurringSchema>

export const updateRecurringSchema = z.object({
  amount: moneyAmountSchema.optional(),
  note: trimmedOptionalString(MAX_NOTE_LENGTH, 'Catatan').optional(),
  tagIds: transactionTagIdsSchema,
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.nullable().optional(),
  isActive: z.boolean().optional(),
})
export type UpdateRecurringInput = z.infer<typeof updateRecurringSchema>

// ---------------------------------------------------------------------------
// Reports / misc query params
// ---------------------------------------------------------------------------

export const monthQuerySchema = z.object({ month: monthStringSchema.optional() })

export const trendQuerySchema = z.object({
  months: z.coerce.number().int().min(2).max(24).default(6),
})

export const includeArchivedQuerySchema = z.object({
  includeArchived: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
})

export const categoryListQuerySchema = includeArchivedQuerySchema.extend({
  kind: categoryKindSchema.optional(),
})

export const exportCsvQuerySchema = z.object({
  from: dateStringSchema.optional(),
  to: dateStringSchema.optional(),
})
