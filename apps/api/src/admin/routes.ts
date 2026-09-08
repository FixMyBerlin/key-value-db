import { Hono } from 'hono'
import { adminAuth } from '../auth/adminAuth'
import { json, readJsonBody } from '../http/json'
import {
  toolCreateProject,
  toolDbStatus,
  toolDeleteProject,
  toolGetProject,
  toolListProjects,
  toolRotateProjectKey,
  toolUpdateProject,
} from './tools'

export const adminRoutes = new Hono<{ Bindings: Env }>()

adminRoutes.use('/admin/*', adminAuth)

adminRoutes.get('/admin/projects', async (c) => json(c, await toolListProjects(c.env)))

adminRoutes.post('/admin/projects', async (c) =>
  json(c, await toolCreateProject(c.env, await readJsonBody(c)), 201),
)

adminRoutes.get('/admin/projects/:slug', async (c) =>
  json(c, await toolGetProject(c.env, { slug: c.req.param('slug') })),
)

adminRoutes.patch('/admin/projects/:slug', async (c) => {
  const body = await readJsonBody(c)
  const patch = typeof body === 'object' && body ? body : {}
  return json(c, await toolUpdateProject(c.env, { slug: c.req.param('slug'), ...patch }))
})

adminRoutes.post('/admin/projects/:slug/rotate-key', async (c) =>
  json(c, await toolRotateProjectKey(c.env, { slug: c.req.param('slug') })),
)

adminRoutes.delete('/admin/projects/:slug', async (c) => {
  const body = await readJsonBody(c)
  const extra = typeof body === 'object' && body ? body : {}
  return json(c, await toolDeleteProject(c.env, { slug: c.req.param('slug'), ...extra }))
})

adminRoutes.get('/admin/db-status', async (c) => json(c, await toolDbStatus(c.env)))
