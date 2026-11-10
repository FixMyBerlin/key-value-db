export type AllowedUser = { osm_uid: number; display_name: string; added_at: string }

export async function listAllowedUsers(db: D1Database, projectId: number): Promise<AllowedUser[]> {
  const { results } = await db
    .prepare(
      `SELECT osm_uid, display_name, added_at FROM project_allowed_users
       WHERE project_id = ? ORDER BY display_name COLLATE NOCASE, osm_uid`,
    )
    .bind(projectId)
    .all<AllowedUser>()
  return results
}

export async function isAllowedUser(
  db: D1Database,
  projectId: number,
  osmUid: number,
): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS ok FROM project_allowed_users WHERE project_id = ? AND osm_uid = ?')
    .bind(projectId, osmUid)
    .first<{ ok: number }>()
  return row !== null
}

/** Adds the user or refreshes the display name note. Returns true when the user was new. */
export async function addAllowedUser(
  db: D1Database,
  projectId: number,
  user: { osm_uid: number; display_name: string },
  at: string,
): Promise<boolean> {
  const existed = await isAllowedUser(db, projectId, user.osm_uid)
  await db
    .prepare(
      `INSERT INTO project_allowed_users (project_id, osm_uid, display_name, added_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (project_id, osm_uid) DO UPDATE SET display_name = excluded.display_name`,
    )
    .bind(projectId, user.osm_uid, user.display_name, at)
    .run()
  return !existed
}

export async function removeAllowedUser(
  db: D1Database,
  projectId: number,
  osmUid: number,
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM project_allowed_users WHERE project_id = ? AND osm_uid = ?')
    .bind(projectId, osmUid)
    .run()
  return (result.meta.changes ?? 0) > 0
}
