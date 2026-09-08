import { app } from './app'
import { cleanupVerifiedTokens } from './cron/cleanup'

export default {
  fetch: app.fetch,
  async scheduled(_controller, env, _ctx) {
    await cleanupVerifiedTokens(env)
  },
} satisfies ExportedHandler<Env>
