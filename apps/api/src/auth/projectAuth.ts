import type { Context, MiddlewareHandler } from 'hono'
import { originAllowed, setProjectCorsHeaders } from '../http/cors'
import { ApiError } from '../http/errors'
import { getProjectBySlug, type Project } from '../store/projects'
import { timingSafeEqualString } from './timingSafe'

export type OsmIdentity = { osm_uid: number; display_name: string }

export type AppEnv = {
  Bindings: Env
  Variables: {
    project: Project
    osmUser?: OsmIdentity
  }
}

export function slugFromPath(c: Context<AppEnv>): string {
  return c.req.param('slug') ?? new URL(c.req.url).pathname.split('/')[3] ?? ''
}

export const projectAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const slug = slugFromPath(c)
  const project = slug ? await getProjectBySlug(c.env.DB, slug) : null
  const origin = c.req.header('Origin')
  if (!origin) {
    throw new ApiError(403, 'origin_not_allowed', 'Origin header is required')
  }
  if (!project || !originAllowed(origin, project.origins)) {
    throw new ApiError(403, 'origin_not_allowed', 'Origin is not allowed for this project')
  }

  setProjectCorsHeaders(c, origin)

  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204)
  }

  if (project.disabled_at) {
    throw new ApiError(401, 'invalid_project_key', 'Invalid project key')
  }

  const apiKey = c.req.header('X-Api-Key') ?? ''
  if (!(await timingSafeEqualString(apiKey, project.api_key))) {
    throw new ApiError(401, 'invalid_project_key', 'Invalid project key')
  }

  c.set('project', project)
  await next()
}
