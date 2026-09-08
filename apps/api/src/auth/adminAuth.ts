import type { MiddlewareHandler } from 'hono'
import { ApiError } from '../http/errors'
import { timingSafeEqualString } from './timingSafe'

function adminKeys(env: Env): string[] {
  try {
    const parsed = JSON.parse(env.ADMIN_KEYS_JSON) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return []
    return Object.values(parsed as Record<string, unknown>).filter(
      (value): value is string => typeof value === 'string',
    )
  } catch {
    return []
  }
}

export const adminAuth: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const header = c.req.header('Authorization')
  if (!header?.startsWith('Bearer ') || header.length < 8) {
    throw new ApiError(401, 'unauthenticated', 'Missing or malformed Authorization header')
  }
  const presented = header.slice('Bearer '.length)
  const keys = adminKeys(c.env)
  let ok = false
  for (const key of keys) {
    if (await timingSafeEqualString(presented, key)) ok = true
  }
  if (!ok) {
    throw new ApiError(401, 'unauthenticated', 'Invalid admin key')
  }
  await next()
}
