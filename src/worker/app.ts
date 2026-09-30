// Hono app assembly (spec 4.5): middleware order -> securityHeaders, originCheck, db, routes.
import { Hono } from 'hono'
import { createDb, type Db } from './db/client'
import { onError } from './middleware/error-handler'
import { originCheck } from './middleware/origin-check'
import { securityHeaders } from './middleware/security-headers'
import { authRoute } from './routes/auth.route'
import { bootstrapRoute } from './routes/bootstrap.route'
import { budgetsRoute } from './routes/budgets.route'
import { categoriesRoute } from './routes/categories.route'
import { configRoute } from './routes/config.route'
import { exportRoute } from './routes/export.route'
import { recurringRoute } from './routes/recurring.route'
import { reportsRoute } from './routes/reports.route'
import { tagsRoute } from './routes/tags.route'
import { transactionsRoute } from './routes/transactions.route'
import { walletsRoute } from './routes/wallets.route'

export function createApp() {
  const app = new Hono<{ Bindings: Env; Variables: { db: Db } }>()

  app.onError(onError)
  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan.' } }, 404))

  // Attach the D1 client for every request.
  app.use('*', async (c, next) => {
    c.set('db', createDb(c.env.DB))
    await next()
  })

  const api = new Hono<{ Bindings: Env; Variables: { db: Db } }>()
  api.use('*', securityHeaders)
  api.use('*', originCheck)

  api.route('/config', configRoute)
  api.route('/auth', authRoute)
  api.route('/bootstrap', bootstrapRoute)
  api.route('/wallets', walletsRoute)
  api.route('/categories', categoriesRoute)
  api.route('/tags', tagsRoute)
  api.route('/transactions', transactionsRoute)
  api.route('/budgets', budgetsRoute)
  api.route('/recurring', recurringRoute)
  api.route('/reports', reportsRoute)
  api.route('/export', exportRoute)

  app.route('/api', api)

  return app
}
