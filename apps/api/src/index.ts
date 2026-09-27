import { app } from './app'
import { cleanup } from './cron/cleanup'

export default {
  fetch: app.fetch,
  async scheduled(_controller, env, _ctx) {
    await cleanup(env)
  },
} satisfies ExportedHandler<Env>
