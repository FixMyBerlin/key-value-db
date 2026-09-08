import { purgeVerifiedTokensOlderThan } from '../store/verifiedTokens'

export async function cleanupVerifiedTokens(env: Env) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  await purgeVerifiedTokensOlderThan(env.DB, cutoff)
}
