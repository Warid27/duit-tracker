// CSV export route (spec 9, 9.2). Auth required — own data only.
import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { dateStringSchema } from '@shared/schemas'
import type { Db } from '../db/client'
import { requireAuth, type UserContext } from '../middleware/session'
import * as reports from '../services/reports.service'

type Bindings = Env
type Variables = { user: UserContext; db: Db }

const csvQuerySchema = z.object({ from: dateStringSchema.optional(), to: dateStringSchema.optional() })

export const exportRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>()

exportRoute.use('*', requireAuth)

exportRoute.get('/transactions.csv', zValidator('query', csvQuerySchema), async (c) => {
  const { userId } = c.get('user')
  const q = c.req.valid('query')
  const { filename, body } = await reports.exportCsv(c.get('db'), userId, c.env.APP_TIMEZONE, q.from, q.to)
  c.header('Content-Type', 'text/csv; charset=utf-8')
  c.header('Content-Disposition', `attachment; filename="${filename}"`)
  return c.body(body)
})
