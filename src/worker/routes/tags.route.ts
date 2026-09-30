// Tag routes (spec 9).
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { createTagSchema, updateTagSchema } from '@shared/schemas'
import type { Db } from '../db/client'
import { requireAuth, type UserContext } from '../middleware/session'
import * as tagsService from '../services/tags.service'

type Bindings = Env
type Variables = { user: UserContext; db: Db }

export const tagsRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>()

tagsRoute.use('*', requireAuth)

tagsRoute.get('/', async (c) => {
  const { userId } = c.get('user')
  const items = await tagsService.listTags(c.get('db'), userId)
  return c.json({ data: { items } })
})

tagsRoute.post('/', zValidator('json', createTagSchema), async (c) => {
  const { userId } = c.get('user')
  const row = await tagsService.createTag(c.get('db'), userId, c.req.valid('json').name)
  return c.json({ data: row }, 201)
})

tagsRoute.patch('/:id', zValidator('json', updateTagSchema), async (c) => {
  const { userId } = c.get('user')
  const row = await tagsService.renameTag(c.get('db'), userId, c.req.param('id'), c.req.valid('json').name)
  return c.json({ data: row })
})

tagsRoute.delete('/:id', async (c) => {
  const { userId } = c.get('user')
  await tagsService.deleteTag(c.get('db'), userId, c.req.param('id'))
  return c.body(null, 204)
})
