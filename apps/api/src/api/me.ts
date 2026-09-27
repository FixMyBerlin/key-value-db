import { Hono } from 'hono'
import { bearerToken, requireOsm } from '../auth/osmAuth'
import type { AppEnv } from '../auth/projectAuth'
import { sha256Hex } from '../auth/timingSafe'
import { ApiError } from '../http/errors'
import { json } from '../http/json'
import { deleteEntriesCreatedBy } from '../store/entries'
import { deleteVerifiedToken } from '../store/verifiedTokens'

export const meApi = new Hono<AppEnv>()

meApi.get('/me', requireOsm, (c) => {
  const user = c.get('osmUser')
  if (!user) {
    return json(c, { user: null, can_write: false }, 401)
  }
  return json(c, { user, can_write: true })
})

/**
 * "Delete my data" for this project only: removes every entry the user created here.
 * Other projects are not touched. Clients call DELETE /me afterwards to drop the token cache row.
 */
meApi.delete('/me/entries', requireOsm, async (c) => {
  const user = c.get('osmUser')
  if (!user) throw new ApiError(401, 'unauthenticated', 'OSM user required')
  const deleted = await deleteEntriesCreatedBy(c.env.DB, c.get('project').id, user.osm_uid)
  return json(c, { deleted })
})

meApi.delete('/me', async (c) => {
  const token = await bearerToken(c)
  const tokenHash = await sha256Hex(token)
  await deleteVerifiedToken(c.env.DB, tokenHash)
  return c.body(null, 204)
})
