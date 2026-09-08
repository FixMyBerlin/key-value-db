export async function dbStatus(db: D1Database) {
  let migrations: Record<string, unknown>[] = []
  try {
    const result = await db.prepare('SELECT * FROM d1_migrations ORDER BY id').all()
    migrations = result.results
  } catch {
    migrations = []
  }

  const tables = ['projects', 'osm_users', 'entries', 'entry_tags', 'verified_tokens'] as const
  const counts: Record<string, number> = {}
  for (const table of tables) {
    const row = await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>()
    counts[table] = row?.n ?? 0
  }
  return { migrations, counts }
}
