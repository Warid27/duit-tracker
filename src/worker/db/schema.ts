// Drizzle schema (spec §6.2). Column names snake_case, TS camelCase.
import { sql } from 'drizzle-orm'
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const pk = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID())
const nowIso = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`

export const users = sqliteTable(
  'users',
  {
    id: pk(),
    email: text('email').notNull().unique(), // normalized: trim + lowercase
    passwordHash: text('password_hash').notNull(), // "pbkdf2_sha256$<iter>$<saltB64url>$<hashB64url>"
    name: text('name'),
    createdAt: text('created_at').notNull().default(nowIso),
  },
  (t) => [index('users_email_idx').on(t.email)],
)

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(), // sha256 hex of the token; raw token is never stored
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: text('expires_at').notNull(),
    createdAt: text('created_at').notNull().default(nowIso),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
)

export const rateLimits = sqliteTable('rate_limits', {
  key: text('key').primaryKey(), // "login:email:<email>" | "login:ip:<ip>"
  count: integer('count').notNull(),
  windowStart: integer('window_start').notNull(), // epoch seconds
})

export const wallets = sqliteTable(
  'wallets',
  {
    id: pk(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind', { enum: ['cash', 'bank', 'ewallet', 'other'] })
      .notNull()
      .default('other'),
    initialBalance: integer('initial_balance').notNull().default(0),
    color: text('color').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull().default(nowIso),
  },
  (t) => [uniqueIndex('wallets_user_name_uq').on(t.userId, t.name)],
)

export const categories = sqliteTable(
  // UI term: "Jenis"
  'categories',
  {
    id: pk(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind', { enum: ['income', 'expense'] }).notNull(),
    color: text('color').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull().default(nowIso),
  },
  (t) => [uniqueIndex('categories_user_kind_name_uq').on(t.userId, t.kind, t.name)],
)

export const tags = sqliteTable(
  'tags',
  {
    id: pk(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: text('created_at').notNull().default(nowIso),
  },
  (t) => [uniqueIndex('tags_user_name_uq').on(t.userId, t.name)],
)

export const recurringRules = sqliteTable(
  'recurring_rules',
  {
    id: pk(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['income', 'expense', 'transfer'] }).notNull(),
    amount: integer('amount').notNull(),
    walletId: text('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'restrict' }),
    toWalletId: text('to_wallet_id').references(() => wallets.id, { onDelete: 'restrict' }),
    categoryId: text('category_id').references(() => categories.id, { onDelete: 'restrict' }),
    note: text('note').notNull().default(''),
    tagIds: text('tag_ids').notNull().default('[]'), // JSON array; stale ids ignored on generate
    frequency: text('frequency', { enum: ['daily', 'weekly', 'monthly', 'yearly'] }).notNull(),
    startDate: text('start_date').notNull(), // also the anchor day/weekday/month-day
    endDate: text('end_date'),
    nextRunDate: text('next_run_date').notNull(),
    lastRunDate: text('last_run_date'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull().default(nowIso),
  },
  (t) => [index('recurring_due_idx').on(t.isActive, t.nextRunDate)],
)

export const transactions = sqliteTable(
  'transactions',
  {
    id: pk(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['income', 'expense', 'transfer'] }).notNull(),
    amount: integer('amount').notNull(),
    /** Source wallet (for transfers: the wallet money leaves). */
    walletId: text('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'restrict' }),
    /** Only for transfers. */
    toWalletId: text('to_wallet_id').references(() => wallets.id, { onDelete: 'restrict' }),
    /** Null for transfers. */
    categoryId: text('category_id').references(() => categories.id, { onDelete: 'restrict' }),
    note: text('note').notNull().default(''),
    occurredOn: text('occurred_on').notNull(), // YYYY-MM-DD in APP_TIMEZONE
    recurringId: text('recurring_id').references(() => recurringRules.id, {
      onDelete: 'set null',
    }),
    createdAt: text('created_at').notNull().default(nowIso),
    updatedAt: text('updated_at').notNull().default(nowIso),
  },
  (t) => [
    index('tx_user_date_idx').on(t.userId, t.occurredOn),
    index('tx_user_wallet_idx').on(t.userId, t.walletId),
    index('tx_user_category_idx').on(t.userId, t.categoryId),
    // Idempotency guard for recurring generation (NULLs are distinct in SQLite).
    uniqueIndex('tx_recurring_date_uq').on(t.recurringId, t.occurredOn),
    check('tx_amount_pos', sql`${t.amount} > 0`),
    check(
      'tx_transfer_shape',
      sql`(${t.type} = 'transfer' AND ${t.toWalletId} IS NOT NULL AND ${t.toWalletId} <> ${t.walletId} AND ${t.categoryId} IS NULL) OR (${t.type} <> 'transfer' AND ${t.toWalletId} IS NULL)`,
    ),
  ],
)

export const transactionTags = sqliteTable(
  'transaction_tags',
  {
    transactionId: text('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.transactionId, t.tagId] }), index('tx_tags_tag_idx').on(t.tagId)],
)

export const budgets = sqliteTable(
  'budgets', // monthly limit per expense category, no rollover (BR-09)
  {
    id: pk(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
  },
  (t) => [
    uniqueIndex('budgets_user_category_uq').on(t.userId, t.categoryId),
    check('budget_amount_pos', sql`${t.amount} > 0`),
  ],
)

export type User = typeof users.$inferSelect
export type Session = typeof sessions.$inferSelect
export type Wallet = typeof wallets.$inferSelect
export type Category = typeof categories.$inferSelect
export type Tag = typeof tags.$inferSelect
export type TransactionRow = typeof transactions.$inferSelect
export type Budget = typeof budgets.$inferSelect
export type RecurringRule = typeof recurringRules.$inferSelect
