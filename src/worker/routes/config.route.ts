// Public config endpoint (spec 9): lets the client know about registration flag.
import { Hono } from 'hono'
import type { Db } from '../db/client'
import type { UserContext } from '../middleware/session'

type Bindings = Env
type Variables = { user: UserContext; db: Db }

export const configRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>()

configRoute.get('/', (c) => {
  return c.json({
    data: {
      registrationEnabled: c.env.REGISTRATION_ENABLED !== 'false',
      timezone: c.env.APP_TIMEZONE || 'Asia/Jakarta',
    },
  })
})
