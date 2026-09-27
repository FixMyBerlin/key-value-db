export async function upsertOsmUser(
  db: D1Database,
  osmUid: number,
  displayName: string,
  at: string,
) {
  await db
    .prepare(
      `INSERT INTO osm_users (osm_uid, display_name, first_seen_at, last_seen_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (osm_uid) DO UPDATE SET
         display_name = excluded.display_name,
         last_seen_at = excluded.last_seen_at`,
    )
    .bind(osmUid, displayName, at, at)
    .run()
}

export async function getOsmUsersByUids(
  db: D1Database,
  uids: number[],
): Promise<Map<number, string>> {
  const names = new Map<number, string>()
  const unique = [...new Set(uids)]
  if (unique.length === 0) return names
  const placeholders = unique.map(() => '?').join(', ')
  const { results } = await db
    .prepare(`SELECT osm_uid, display_name FROM osm_users WHERE osm_uid IN (${placeholders})`)
    .bind(...unique)
    .all<{ osm_uid: number; display_name: string }>()
  for (const row of results) names.set(row.osm_uid, row.display_name)
  return names
}

/**
 * Deletes user records that no entry (any project) and no token cache row refers to.
 * Keeping users with a cached token avoids 'unknown' display names until the next OSM check.
 */
export async function purgeOrphanOsmUsers(db: D1Database) {
  const result = await db
    .prepare(
      `DELETE FROM osm_users
       WHERE NOT EXISTS (SELECT 1 FROM entries e WHERE e.created_by_osm_uid = osm_users.osm_uid)
         AND NOT EXISTS (SELECT 1 FROM entries e WHERE e.updated_by_osm_uid = osm_users.osm_uid)
         AND NOT EXISTS (SELECT 1 FROM verified_tokens t WHERE t.osm_uid = osm_users.osm_uid)`,
    )
    .run()
  return result.meta.changes ?? 0
}
