import { Hono } from 'hono'
import { adminRoutes } from './admin/routes'
import { entriesApi } from './api/entries'
import { health } from './api/health'
import { meApi } from './api/me'
import { tagsApi } from './api/tags'
import { adminAuth } from './auth/adminAuth'
import { projectAuth, type AppEnv } from './auth/projectAuth'
import { ApiError, jsonError } from './http/errors'
import { mcpFetch } from './mcp/server'

export const app = new Hono<AppEnv>()

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
app.route('/', adminRoutes)

app.all('/mcp', adminAuth, (c) => mcpFetch(c.req.raw, c.env, c.executionCtx as never))

app.use('/v1/projects/:slug/*', projectAuth)
app.route('/v1/projects/:slug', meApi)
app.route('/v1/projects/:slug', entriesApi)
app.route('/v1/projects/:slug', tagsApi)
