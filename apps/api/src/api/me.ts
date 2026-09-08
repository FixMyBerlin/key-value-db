import { Hono } from 'hono'
import { bearerToken, requireOsm } from '../auth/osmAuth'
import type { AppEnv } from '../auth/projectAuth'
import { sha256Hex } from '../auth/timingSafe'
import { json } from '../http/json'
import { deleteVerifiedToken } from '../store/verifiedTokens'

export const meApi = new Hono<AppEnv>()

meApi.get('/me', requireOsm, (c) => {
  const user = c.get('osmUser')
  if (!user) {
    return json(c, { user: null, can_write: false }, 401)
  }
  return json(c, { user, can_write: true })
})

meApi.delete('/me', async (c) => {
  const token = await bearerToken(c)
  const tokenHash = await sha256Hex(token)
  await deleteVerifiedToken(c.env.DB, tokenHash)
  return c.body(null, 204)
})
