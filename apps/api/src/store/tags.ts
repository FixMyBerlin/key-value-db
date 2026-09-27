export async function listTagCounts(db: D1Database, projectId: number, now: string) {
  const { results } = await db
    .prepare(
      `SELECT t.tag, COUNT(*) AS count
       FROM entry_tags t
       JOIN entries e ON e.pk = t.entry_pk
       WHERE t.project_id = ? AND (e.expires_at IS NULL OR e.expires_at > ?)
       GROUP BY t.tag
       ORDER BY t.tag`,
    )
    .bind(projectId, now)
    .all<{ tag: string; count: number }>()
  return results
}
