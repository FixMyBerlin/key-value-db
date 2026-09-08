export async function listTagCounts(db: D1Database, projectId: number) {
  const { results } = await db
    .prepare(
      `SELECT tag, COUNT(*) AS count
       FROM entry_tags
       WHERE project_id = ?
       GROUP BY tag
       ORDER BY tag`,
    )
    .bind(projectId)
    .all<{ tag: string; count: number }>()
  return results
}
