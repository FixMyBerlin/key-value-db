import { Hono } from 'hono'
import { health } from './api/health'
import { ApiError, jsonError } from './http/errors'

export const app = new Hono<{ Bindings: Env }>()

app.onError((err, c) => {
  console.error(err)
  if (err instanceof ApiError) return jsonError(c, err)
  return c.json({ error: { code: 'internal', message: 'Internal error' } }, 500)
})

app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Not found' } }, 404))

app.use('*', async (c, next) => {
  await next()
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Cache-Control', 'no-store')
})

app.route('/', health)
