export type EntryRow = {
  pk: number
  project_id: number
  entry_id: string
  data: string
  tags: string
  version: number
  created_at: string
  updated_at: string
  created_by_osm_uid: number
  updated_by_osm_uid: number
  expires_at: string | null
}

export type OsmIdentity = { osm_uid: number; display_name: string }

export type EntryJson = {
  id: string
  data: unknown
  tags: string[]
  version: number
  created_at: string
  updated_at: string
  created_by: OsmIdentity
  updated_by: OsmIdentity
  expires_at: string | null
}

export function mapEntry(
  row: EntryRow,
  names: Map<number, string>,
  fallback?: OsmIdentity,
): EntryJson {
  const createdName =
    names.get(row.created_by_osm_uid) ??
    (fallback?.osm_uid === row.created_by_osm_uid ? fallback.display_name : 'unknown')
  const updatedName =
    names.get(row.updated_by_osm_uid) ??
    (fallback?.osm_uid === row.updated_by_osm_uid ? fallback.display_name : 'unknown')
  return {
    id: row.entry_id,
    data: JSON.parse(row.data) as unknown,
    tags: JSON.parse(row.tags) as string[],
    version: row.version,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: { osm_uid: row.created_by_osm_uid, display_name: createdName },
    updated_by: { osm_uid: row.updated_by_osm_uid, display_name: updatedName },
    expires_at: row.expires_at,
  }
}

/** SQL condition for "not expired"; `?` is bound to the current ISO time. */
const NOT_EXPIRED = '(expires_at IS NULL OR expires_at > ?)'

export async function getEntry(db: D1Database, projectId: number, entryId: string, now: string) {
  return db
    .prepare(`SELECT * FROM entries WHERE project_id = ? AND entry_id = ? AND ${NOT_EXPIRED}`)
    .bind(projectId, entryId, now)
    .first<EntryRow>()
}

export type UpsertArgs = {
  projectId: number
  entryId: string
  dataJson: string
  tagsJson: string
  now: string
  osmUid: number
  expectedVersion: number | null
  /** write_scope = 'owner': only the creator may update a live entry. */
  ownerOnly: boolean
  /** ISO time the entry expires when it is (re)created; null = never (project has no TTL). */
  expiresAt: string | null
}

/**
 * The three statements of one upsert, for `db.batch()`. The first returns the row
 * (RETURNING *), or no row when the If-Match or owner guard rejected the update.
 *
 * An expired row that the cron has not purged yet counts as absent: the update
 * resets it like a fresh insert (version 1, new creator, new created_at/expires_at).
 *
 * The tag statements only touch the tag index when the upsert actually wrote this
 * request's tags (same tags, updated_at and writer), so a rejected update cannot
 * rewrite another entry's tag index.
 */
export function upsertStatements(db: D1Database, args: UpsertArgs): D1PreparedStatement[] {
  const expired = 'entries.expires_at IS NOT NULL AND entries.expires_at <= excluded.updated_at'
  return [
    db
      .prepare(
        `INSERT INTO entries (project_id, entry_id, data, tags, version, created_at, updated_at, created_by_osm_uid, updated_by_osm_uid, expires_at)
         VALUES (?1, ?2, ?3, ?4, 1, ?5, ?5, ?6, ?6, ?9)
         ON CONFLICT (project_id, entry_id) DO UPDATE SET
           data = excluded.data, tags = excluded.tags,
           version = CASE WHEN ${expired} THEN 1 ELSE entries.version + 1 END,
           created_at = CASE WHEN ${expired} THEN excluded.created_at ELSE entries.created_at END,
           created_by_osm_uid = CASE WHEN ${expired} THEN excluded.created_by_osm_uid ELSE entries.created_by_osm_uid END,
           expires_at = CASE WHEN ${expired} THEN excluded.expires_at ELSE entries.expires_at END,
           updated_at = excluded.updated_at, updated_by_osm_uid = excluded.updated_by_osm_uid
         WHERE (${expired})
            OR ((?7 IS NULL OR entries.version = ?7)
                AND (?8 = 0 OR entries.created_by_osm_uid = excluded.created_by_osm_uid))
         RETURNING *`,
      )
      .bind(
        args.projectId,
        args.entryId,
        args.dataJson,
        args.tagsJson,
        args.now,
        args.osmUid,
        args.expectedVersion,
        args.ownerOnly ? 1 : 0,
        args.expiresAt,
      ),
    db
      .prepare(
        `DELETE FROM entry_tags WHERE entry_pk = (
           SELECT pk FROM entries
           WHERE project_id = ?1 AND entry_id = ?2 AND tags = ?3 AND updated_at = ?4 AND updated_by_osm_uid = ?5
         )`,
      )
      .bind(args.projectId, args.entryId, args.tagsJson, args.now, args.osmUid),
    db
      .prepare(
        `INSERT INTO entry_tags (entry_pk, project_id, tag)
         SELECT e.pk, e.project_id, j.value FROM entries e, json_each(?3) j
         WHERE e.project_id = ?1 AND e.entry_id = ?2 AND e.tags = ?3 AND e.updated_at = ?4 AND e.updated_by_osm_uid = ?5`,
      )
      .bind(args.projectId, args.entryId, args.tagsJson, args.now, args.osmUid),
  ]
}

export async function upsertEntry(db: D1Database, args: UpsertArgs): Promise<EntryRow | null> {
  const results = await db.batch<EntryRow>(upsertStatements(db, args))
  const rows = results[0]?.results ?? []
  return rows[0] ?? null
}

/** Deletes a live entry. With `ownerUid`, only if that user created it. Returns true if deleted. */
export function deleteStatement(
  db: D1Database,
  args: { projectId: number; entryId: string; now: string; ownerUid: number | null },
) {
  return db
    .prepare(
      `DELETE FROM entries
       WHERE project_id = ?1 AND entry_id = ?2 AND (expires_at IS NULL OR expires_at > ?3)
         AND (?4 IS NULL OR created_by_osm_uid = ?4)
       RETURNING pk`,
    )
    .bind(args.projectId, args.entryId, args.now, args.ownerUid)
}

export async function deleteEntry(
  db: D1Database,
  args: { projectId: number; entryId: string; now: string; ownerUid: number | null },
) {
  // Count RETURNING rows: D1's meta.changes also counts the cascaded entry_tags rows.
  const { results } = await deleteStatement(db, args).all()
  return results.length > 0
}

/** "Delete my data": every entry this user created in this one project. */
export async function deleteEntriesCreatedBy(db: D1Database, projectId: number, osmUid: number) {
  const { results } = await db
    .prepare('DELETE FROM entries WHERE project_id = ? AND created_by_osm_uid = ? RETURNING pk')
    .bind(projectId, osmUid)
    .all()
  return results.length
}

/** Cron: physically removes expired entries (tags cascade). */
export async function purgeExpiredEntries(db: D1Database, now: string) {
  const { results } = await db
    .prepare('DELETE FROM entries WHERE expires_at IS NOT NULL AND expires_at <= ? RETURNING pk')
    .bind(now)
    .all()
  return results.length
}

export async function listEntries(
  db: D1Database,
  args: {
    projectId: number
    tags: string[]
    match: 'all' | 'any'
    updatedSince?: string
    cursor?: { updatedAt: string; pk: number }
    limit: number
    now: string
  },
): Promise<EntryRow[]> {
  const params: unknown[] = []
  let sql = 'SELECT e.* FROM entries e'

  if (args.tags.length > 0) {
    const placeholders = args.tags.map(() => '?').join(', ')
    sql += ` JOIN (
      SELECT entry_pk FROM entry_tags
      WHERE project_id = ? AND tag IN (${placeholders})
      GROUP BY entry_pk`
    params.push(args.projectId, ...args.tags)
    if (args.match === 'all') {
      sql += ' HAVING COUNT(DISTINCT tag) = ?'
      params.push(args.tags.length)
    }
    sql += ') m ON m.entry_pk = e.pk'
  }

  sql += ' WHERE e.project_id = ? AND (e.expires_at IS NULL OR e.expires_at > ?)'
  params.push(args.projectId, args.now)

  if (args.updatedSince) {
    sql += ' AND e.updated_at >= ?'
    params.push(args.updatedSince)
  }

  if (args.cursor) {
    sql += ' AND (e.updated_at, e.pk) > (?, ?)'
    params.push(args.cursor.updatedAt, args.cursor.pk)
  }

  sql += ' ORDER BY e.updated_at, e.pk LIMIT ?'
  params.push(args.limit)

  const { results } = await db
    .prepare(sql)
    .bind(...params)
    .all<EntryRow>()
  return results
}
