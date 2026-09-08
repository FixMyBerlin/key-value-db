import { Hono } from 'hono'
import { BUILD_SHA } from '../build-info'

export const health = new Hono<{ Bindings: Env }>()

async function latestMigrationName(db: D1Database): Promise<string | null> {
  try {
    const row = await db
      .prepare('SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1')
      .first<{ name: string }>()
    return row?.name ?? null
  } catch {
    return null
  }
}

health.get('/v1/health', async (c) => {
  try {
    await c.env.DB.prepare('SELECT 1').first()
  } catch (err) {
    console.error(err)
    return c.json({ ok: false, error: 'D1 unavailable' }, 503)
  }

  const schema = await latestMigrationName(c.env.DB)
  return c.json({
    ok: true,
    time: new Date().toISOString(),
    schema,
    commit: BUILD_SHA,
  })
})
