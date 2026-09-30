// Worker entrypoint (spec 4.1): fetch -> Hono API; scheduled -> daily recurring cron.
import { createApp } from './app'
import { createDb } from './db/client'
import { processDueRecurring } from './services/recurring.service'
import { purgeExpiredSessions } from './services/session.service'

const app = createApp()

export default {
  fetch: app.fetch,

  /** Cron trigger (00:00 WIB / 17:00 UTC per wrangler.jsonc): process all due recurring rules. */
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    const db = createDb(env.DB)
    await processDueRecurring(db, { timezone: env.APP_TIMEZONE })
    await purgeExpiredSessions(db)
  },
}
