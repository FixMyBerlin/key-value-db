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
  }
}

export async function getEntry(db: D1Database, projectId: number, entryId: string) {
  return db
    .prepare('SELECT * FROM entries WHERE project_id = ? AND entry_id = ?')
    .bind(projectId, entryId)
    .first<EntryRow>()
}

export async function upsertEntry(
  db: D1Database,
  args: {
    projectId: number
    entryId: string
    dataJson: string
    tagsJson: string
    now: string
    osmUid: number
    expectedVersion: number | null
  },
): Promise<EntryRow | null> {
  const statements = [
    db
      .prepare(
        `INSERT INTO entries (project_id, entry_id, data, tags, version, created_at, updated_at, created_by_osm_uid, updated_by_osm_uid)
         VALUES (?1, ?2, ?3, ?4, 1, ?5, ?5, ?6, ?6)
         ON CONFLICT (project_id, entry_id) DO UPDATE SET
           data = excluded.data, tags = excluded.tags, version = entries.version + 1,
           updated_at = excluded.updated_at, updated_by_osm_uid = excluded.updated_by_osm_uid
         WHERE ?7 IS NULL OR entries.version = ?7
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
      ),
    db
      .prepare(
        'DELETE FROM entry_tags WHERE entry_pk = (SELECT pk FROM entries WHERE project_id = ? AND entry_id = ?)',
      )
      .bind(args.projectId, args.entryId),
    db
      .prepare(
        `INSERT INTO entry_tags (entry_pk, project_id, tag)
         SELECT e.pk, e.project_id, j.value FROM entries e, json_each(?) j
         WHERE e.project_id = ? AND e.entry_id = ?`,
      )
      .bind(args.tagsJson, args.projectId, args.entryId),
  ]

  const results = await db.batch<EntryRow>(statements)
  const rows = results[0]?.results ?? []
  return rows[0] ?? null
}

export async function deleteEntry(db: D1Database, projectId: number, entryId: string) {
  const result = await db
    .prepare('DELETE FROM entries WHERE project_id = ? AND entry_id = ?')
    .bind(projectId, entryId)
    .run()
  return (result.meta.changes ?? 0) > 0
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

  sql += ' WHERE e.project_id = ?'
  params.push(args.projectId)

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
