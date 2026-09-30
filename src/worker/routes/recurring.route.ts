// Recurring rule routes (spec 9, BR-11..BR-14).
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { createRecurringSchema, updateRecurringSchema } from '@shared/schemas'
import { todayIn } from '@shared/domain/dates'
import type { Db } from '../db/client'
import { requireAuth, type UserContext } from '../middleware/session'
import * as recurring from '../services/recurring.service'

type Bindings = Env
type Variables = { user: UserContext; db: Db }

export const recurringRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>()

recurringRoute.use('*', requireAuth)

recurringRoute.get('/', async (c) => {
  const { userId } = c.get('user')
  const items = await recurring.listRecurring(c.get('db'), userId)
  return c.json({ data: { items } })
})

recurringRoute.post('/', zValidator('json', createRecurringSchema), async (c) => {
  const { userId } = c.get('user')
  const rule = await recurring.createRule(
    c.get('db'),
    userId,
    c.req.valid('json'),
    todayIn(c.env.APP_TIMEZONE),
  )
  return c.json({ data: rule }, 201)
})

recurringRoute.patch('/:id', zValidator('json', updateRecurringSchema), async (c) => {
  const { userId } = c.get('user')
  const rule = await recurring.updateRule(
    c.get('db'),
    userId,
    c.req.param('id'),
    c.req.valid('json'),
    todayIn(c.env.APP_TIMEZONE),
  )
  return c.json({ data: rule })
})

recurringRoute.delete('/:id', async (c) => {
  const { userId } = c.get('user')
  await recurring.deleteRule(c.get('db'), userId, c.req.param('id'))
  return c.body(null, 204)
})

recurringRoute.post('/process', async (c) => {
  const { userId } = c.get('user')
  const result = await recurring.processDueRecurring(c.get('db'), {
    timezone: c.env.APP_TIMEZONE,
    userId,
  })
  return c.json({ data: result })
})
