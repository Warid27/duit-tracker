// Wallet routes (spec 9). Thin: validate -> service -> response shape.
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import {
  createWalletSchema,
  includeArchivedQuerySchema,
  setWalletBalanceSchema,
  updateWalletSchema,
} from '@shared/schemas'
import type { Db } from '../db/client'
import { requireAuth, type UserContext } from '../middleware/session'
import * as wallets from '../services/wallets.service'

type Bindings = Env
type Variables = { user: UserContext; db: Db }

export const walletsRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>()

walletsRoute.use('*', requireAuth)

walletsRoute.get('/', zValidator('query', includeArchivedQuerySchema), async (c) => {
  const { userId } = c.get('user')
  const items = await wallets.listWallets(c.get('db'), userId, c.req.valid('query').includeArchived ?? false)
  return c.json({ data: { items, total: items.reduce((s, w) => s + w.balance, 0) } })
})

walletsRoute.post('/', zValidator('json', createWalletSchema), async (c) => {
  const { userId } = c.get('user')
  const wallet = await wallets.createWallet(c.get('db'), userId, c.req.valid('json'))
  return c.json({ data: wallet }, 201)
})

walletsRoute.patch('/:id', zValidator('json', updateWalletSchema), async (c) => {
  const { userId } = c.get('user')
  const wallet = await wallets.updateWallet(c.get('db'), userId, c.req.param('id'), c.req.valid('json'))
  return c.json({ data: wallet })
})

walletsRoute.put('/:id/balance', zValidator('json', setWalletBalanceSchema), async (c) => {
  const { userId } = c.get('user')
  const result = await wallets.setWalletBalance(
    c.get('db'),
    userId,
    c.req.param('id'),
    c.req.valid('json').currentBalance,
  )
  return c.json({ data: result })
})

walletsRoute.delete('/:id', async (c) => {
  const { userId } = c.get('user')
  await wallets.deleteWallet(c.get('db'), userId, c.req.param('id'))
  return c.body(null, 204)
})
