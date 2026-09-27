import { purgeExpiredEntries } from '../store/entries'
import { purgeOrphanOsmUsers } from '../store/users'
import { purgeVerifiedTokensOlderThan } from '../store/verifiedTokens'

export async function cleanupVerifiedTokens(env: Env) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  await purgeVerifiedTokensOlderThan(env.DB, cutoff)
}

/**
 * Runs every 15 minutes (wrangler.jsonc `triggers.crons`). Order matters: expired
 * entries and old token cache rows go first, so users they referenced become orphans
 * and are removed in the same run.
 */
export async function cleanup(env: Env) {
  await purgeExpiredEntries(env.DB, new Date().toISOString())
  await cleanupVerifiedTokens(env)
  await purgeOrphanOsmUsers(env.DB)
}
