// Bootstrap route (spec 9): everything the Catat page needs in one round trip.
import { Hono } from 'hono'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { categories, transactions } from '../db/schema'
import type { Db } from '../db/client'
import { requireAuth, type UserContext } from '../middleware/session'
import { todayIn } from '@shared/domain/dates'
import * as wallets from '../services/wallets.service'
import * as tagsService from '../services/tags.service'
import * as txns from '../services/transactions.service'

type Bindings = Env
type Variables = { user: UserContext; db: Db }

const USAGE_WINDOW_DAYS = 60

export const bootstrapRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>()

bootstrapRoute.use('*', requireAuth)

bootstrapRoute.get('/', async (c) => {
  const { userId } = c.get('user')
  const db = c.get('db')
  const timezone = c.env.APP_TIMEZONE
  const today = todayIn(timezone)

  // Usage count per active category over the last 60 days (for quick-pick ordering).
  const windowStart = new Date(Date.parse(today) - USAGE_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10)
  const usageRows = await db
    .select({ categoryId: transactions.categoryId, count: sql<number>`count(*)` })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        gte(transactions.occurredOn, windowStart),
        sql`${transactions.categoryId} is not null`,
      ),
    )
    .groupBy(transactions.categoryId)

  const [walletList, categoryRows, tagItems, recent, totals] = await Promise.all([
    wallets.listWallets(db, userId, false),
    db
      .select()
      .from(categories)
      .where(and(eq(categories.userId, userId), eq(categories.isArchived, false)))
      .orderBy(categories.kind, desc(categories.sortOrder)),
    tagsService.listTags(db, userId),
    txns.recentTransactions(db, userId, 5),
    txns.expenseTotals(db, userId, today),
  ])

  const usageByCategory = new Map(usageRows.map((r) => [r.categoryId, Number(r.count)]))
  const totalBalance = walletList.reduce((s, w) => s + w.balance, 0)

  return c.json({
    data: {
      wallets: walletList,
      totalBalance,
      categories: categoryRows.map((cat) => ({ ...cat, usageCount: usageByCategory.get(cat.id) ?? 0 })),
      tags: tagItems,
      recent,
      todayExpense: totals.todayExpense,
      monthExpense: totals.monthExpense,
    },
  })
})
