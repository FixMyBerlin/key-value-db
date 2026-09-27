import { Hono } from 'hono'
import { requireOsmIfPrivateRead } from '../auth/osmAuth'
import type { AppEnv } from '../auth/projectAuth'
import { isoNow } from '../env'
import { json } from '../http/json'
import { listTagCounts } from '../store/tags'

export const tagsApi = new Hono<AppEnv>()

tagsApi.get('/tags', requireOsmIfPrivateRead, async (c) => {
  const project = c.get('project')
  const tags = await listTagCounts(c.env.DB, project.id, isoNow())
  return json(c, { tags })
})
