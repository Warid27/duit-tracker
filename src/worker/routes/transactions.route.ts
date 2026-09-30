// Transaction routes (spec 9).
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import {
  createTransactionSchema,
  listTransactionsQuerySchema,
  updateTransactionSchema,
} from '@shared/schemas'
import type { Db } from '../db/client'
import { requireAuth, type UserContext } from '../middleware/session'
import { purgeExpiredSessions } from '../services/session.service'
import * as txns from '../services/transactions.service'
import { todayIn } from '@shared/domain/dates'

type Bindings = Env
type Variables = { user: UserContext; db: Db }

export const transactionsRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>()

transactionsRoute.use('*', requireAuth)

transactionsRoute.get('/', zValidator('query', listTransactionsQuerySchema), async (c) => {
  const { userId } = c.get('user')
  const result = await txns.listTransactions(c.get('db'), userId, c.req.valid('query'))
  return c.json({ data: result })
})

transactionsRoute.post('/', zValidator('json', createTransactionSchema), async (c) => {
  const { userId } = c.get('user')
  const result = await txns.createTransaction(
    c.get('db'),
    userId,
    c.req.valid('json'),
    todayIn(c.env.APP_TIMEZONE),
  )
  // Opportunistic session cleanup (spec 8.2) — does not block the response.
  if (userId.endsWith('')) void purgeExpiredSessions(c.get('db')).catch(() => undefined)
  return c.json({ data: result }, 201)
})

transactionsRoute.get('/:id', async (c) => {
  const { userId } = c.get('user')
  const transaction = await txns.getTransaction(c.get('db'), userId, c.req.param('id'))
  return c.json({ data: { transaction } })
})

transactionsRoute.patch('/:id', zValidator('json', updateTransactionSchema), async (c) => {
  const { userId } = c.get('user')
  const transaction = await txns.updateTransaction(
    c.get('db'),
    userId,
    c.req.param('id'),
    c.req.valid('json'),
    todayIn(c.env.APP_TIMEZONE),
  )
  return c.json({ data: { transaction } })
})

transactionsRoute.delete('/:id', async (c) => {
  const { userId } = c.get('user')
  await txns.deleteTransaction(c.get('db'), userId, c.req.param('id'))
  return c.body(null, 204)
})
