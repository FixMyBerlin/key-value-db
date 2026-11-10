import type { Context, MiddlewareHandler } from 'hono'
import { isoNow, osmVerifyTtlS } from '../env'
import { ApiError } from '../http/errors'
import { isAllowedUser } from '../store/allowedUsers'
import type { Project } from '../store/projects'
import { upsertOsmUser } from '../store/users'
import { deleteVerifiedToken, getVerifiedToken, upsertVerifiedToken } from '../store/verifiedTokens'
import { fetchOsmUserDetails } from './osmClient'
import type { AppEnv, OsmIdentity } from './projectAuth'
import { sha256Hex } from './timingSafe'

const GRACE_MS = 24 * 60 * 60 * 1000

function ageMs(verifiedAt: string): number {
  const t = Date.parse(verifiedAt)
  return Number.isFinite(t) ? Date.now() - t : Number.POSITIVE_INFINITY
}

function clientIp(c: Context): string {
  return (
    c.req.header('cf-connecting-ip') ??
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  )
}

export async function bearerToken(c: Context): Promise<string> {
  const header = c.req.header('Authorization')
  if (!header?.startsWith('Bearer ') || header.length < 8) {
    throw new ApiError(401, 'unauthenticated', 'Missing or malformed Authorization header')
  }
  return header.slice('Bearer '.length)
}

export async function verifyOsm(c: Context<AppEnv>): Promise<OsmIdentity> {
  const token = await bearerToken(c)
  const tokenHash = await sha256Hex(token)
  const cached = await getVerifiedToken(c.env.DB, tokenHash)
  const ttlMs = osmVerifyTtlS(c.env) * 1000

  if (cached && ageMs(cached.verified_at) < ttlMs) {
    return {
      osm_uid: cached.osm_uid,
      display_name: cached.display_name ?? 'unknown',
    }
  }

  const limit = await c.env.OSM_VERIFY_RL.limit({ key: clientIp(c) })
  if (!limit.success) {
    throw new ApiError(429, 'rate_limited', 'Too many OSM verification attempts')
  }

  const authorization = `Bearer ${token}`
  const result = await fetchOsmUserDetails(c.env, authorization)

  if (result.kind === 'ok') {
    const at = isoNow()
    const identity: OsmIdentity = {
      osm_uid: result.user.id,
      display_name: result.user.display_name,
    }
    const persist = (async () => {
      await upsertOsmUser(c.env.DB, identity.osm_uid, identity.display_name, at)
      await upsertVerifiedToken(c.env.DB, tokenHash, identity.osm_uid, at)
    })()
    c.executionCtx.waitUntil(persist)
    await persist
    return identity
  }

  if (result.kind === 'unauthorized') {
    await deleteVerifiedToken(c.env.DB, tokenHash)
    throw new ApiError(401, 'unauthenticated', 'OSM token was rejected')
  }

  if (cached && ageMs(cached.verified_at) < GRACE_MS) {
    console.log(
      JSON.stringify({
        msg: 'osm_stale_grace',
        osm_uid: cached.osm_uid,
        verified_at: cached.verified_at,
      }),
    )
    return {
      osm_uid: cached.osm_uid,
      display_name: cached.display_name ?? 'unknown',
    }
  }

  throw new ApiError(502, 'osm_unavailable', 'OSM user details are unavailable')
}

export const requireOsm: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set('osmUser', await verifyOsm(c))
  await next()
}

/** False only when the project has write_access = 'allowlist' and the user is not on its list. */
export async function canWrite(db: D1Database, project: Project, osmUid: number) {
  if (project.write_access !== 'allowlist') return true
  return isAllowedUser(db, project.id, osmUid)
}

/** OSM login plus, for write_access = 'allowlist', membership in the project's allowed users. */
export const requireWriter: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await verifyOsm(c)
  if (!(await canWrite(c.env.DB, c.get('project'), user.osm_uid))) {
    throw new ApiError(
      403,
      'forbidden_user',
      'This project only accepts writes from allowed OSM users',
      { reason: 'not_on_allowlist', osm_uid: user.osm_uid },
    )
  }
  c.set('osmUser', user)
  await next()
}

export const requireOsmIfPrivateRead: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get('project').read_access === 'osm_user') {
    c.set('osmUser', await verifyOsm(c))
  }
  await next()
}
