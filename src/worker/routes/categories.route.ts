// Category ("Jenis") routes (spec 9).
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { categoryListQuerySchema, createCategorySchema, updateCategorySchema } from '@shared/schemas'
import type { Db } from '../db/client'
import { requireAuth, type UserContext } from '../middleware/session'
import * as categories from '../services/categories.service'

type Bindings = Env
type Variables = { user: UserContext; db: Db }

export const categoriesRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>()

categoriesRoute.use('*', requireAuth)

categoriesRoute.get('/', zValidator('query', categoryListQuerySchema), async (c) => {
  const { userId } = c.get('user')
  const q = c.req.valid('query')
  const items = await categories.listCategories(c.get('db'), userId, {
    kind: q.kind,
    includeArchived: q.includeArchived ?? false,
  })
  return c.json({ data: { items } })
})

categoriesRoute.post('/', zValidator('json', createCategorySchema), async (c) => {
  const { userId } = c.get('user')
  const row = await categories.createCategory(c.get('db'), userId, c.req.valid('json'))
  return c.json({ data: row }, 201)
})

categoriesRoute.patch('/:id', zValidator('json', updateCategorySchema), async (c) => {
  const { userId } = c.get('user')
  const row = await categories.updateCategory(c.get('db'), userId, c.req.param('id'), c.req.valid('json'))
  return c.json({ data: row })
})

categoriesRoute.delete('/:id', async (c) => {
  const { userId } = c.get('user')
  await categories.deleteCategory(c.get('db'), userId, c.req.param('id'))
  return c.body(null, 204)
})
