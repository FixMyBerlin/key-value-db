import { createExecutionContext, createScheduledController, env } from 'cloudflare:test'
import { expect, test } from 'vitest'
import { cleanupVerifiedTokens } from '../src/cron/cleanup'
import worker from '../src/index'

test('cron cleanup deletes tokens older than 24h', async () => {
  const now = new Date().toISOString()
  const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
  await env.DB.prepare(
    `INSERT INTO verified_tokens (token_hash, osm_uid, verified_at) VALUES (?, 1, ?), (?, 1, ?)`,
  )
    .bind('old-hash', old, 'new-hash', now)
    .run()

  await cleanupVerifiedTokens(env)

  const remaining = await env.DB.prepare(
    'SELECT token_hash FROM verified_tokens ORDER BY token_hash',
  ).all<{ token_hash: string }>()
  expect(remaining.results.map((r) => r.token_hash)).toEqual(['new-hash'])
})

test('scheduled handler runs cleanup', async () => {
  const ancient = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  await env.DB.prepare(
    `INSERT INTO verified_tokens (token_hash, osm_uid, verified_at) VALUES ('scheduled-old', 2, ?)`,
  )
    .bind(ancient)
    .run()

  await worker.scheduled(createScheduledController(), env, createExecutionContext())

  const row = await env.DB.prepare(
    `SELECT token_hash FROM verified_tokens WHERE token_hash = 'scheduled-old'`,
  ).first()
  expect(row).toBeNull()
})
