// Report routes (spec 9, 9.1). Aggregation lives in the reports service.
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { monthQuerySchema, trendQuerySchema } from '@shared/schemas'
import type { Db } from '../db/client'
import { requireAuth, type UserContext } from '../middleware/session'
import * as reports from '../services/reports.service'

type Bindings = Env
type Variables = { user: UserContext; db: Db }

export const reportsRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>()

reportsRoute.use('*', requireAuth)

reportsRoute.get('/summary', zValidator('query', monthQuerySchema), async (c) => {
  const { userId } = c.get('user')
  const month = reports.resolveMonth(c.req.valid('query').month, c.env.APP_TIMEZONE)
  const data = await reports.summary(c.get('db'), userId, month, c.env.APP_TIMEZONE)
  return c.json({ data })
})

reportsRoute.get('/trend', zValidator('query', trendQuerySchema), async (c) => {
  const { userId } = c.get('user')
  const items = await reports.trend(c.get('db'), userId, c.req.valid('query').months ?? 6, c.env.APP_TIMEZONE)
  return c.json({ data: { items } })
})

reportsRoute.get('/wallets', async (c) => {
  const { userId } = c.get('user')
  const data = await reports.walletBalances(c.get('db'), userId)
  return c.json({ data })
})
