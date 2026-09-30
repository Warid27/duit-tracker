// Budget routes (spec 9). Thin: validate -> service -> response shape.
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { monthQuerySchema, upsertBudgetSchema } from '@shared/schemas'
import type { Db } from '../db/client'
import { requireAuth, type UserContext } from '../middleware/session'
import * as budgets from '../services/budgets.service'
import { resolveMonth } from '../services/reports.service'

type Bindings = Env
type Variables = { user: UserContext; db: Db }

export const budgetsRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>()

budgetsRoute.use('*', requireAuth)

budgetsRoute.get('/', zValidator('query', monthQuerySchema), async (c) => {
  const { userId } = c.get('user')
  const month = resolveMonth(c.req.valid('query').month, c.env.APP_TIMEZONE)
  const items = await budgets.listBudgets(c.get('db'), userId, month)
  return c.json({ data: { month, items } })
})

budgetsRoute.put('/:categoryId', zValidator('json', upsertBudgetSchema), async (c) => {
  const { userId } = c.get('user')
  await budgets.upsertBudget(c.get('db'), userId, c.req.param('categoryId'), c.req.valid('json').amount)
  return c.json({ data: { ok: true } })
})

budgetsRoute.delete('/:categoryId', async (c) => {
  const { userId } = c.get('user')
  await budgets.deleteBudget(c.get('db'), userId, c.req.param('categoryId'))
  return c.body(null, 204)
})
