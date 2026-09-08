import { app } from './app'

export default {
  fetch: app.fetch,
  scheduled(_controller, _env, _ctx) {
    console.log('scheduled: stub')
  },
} satisfies ExportedHandler<Env>
