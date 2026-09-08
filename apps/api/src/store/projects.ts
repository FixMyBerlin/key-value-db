export type ProjectRow = {
  id: number
  slug: string
  name: string
  api_key: string
  origins: string
  read_access: 'public' | 'osm_user'
  write_access: 'any_osm_user' | 'allowlist'
  created_at: string
  updated_at: string
  disabled_at: string | null
}

export type Project = Omit<ProjectRow, 'origins'> & { origins: string[] }

const CACHE_TTL_MS = 60_000
const cache = new Map<string, { project: Project; expiresAt: number }>()

export function parseProjectRow(row: ProjectRow): Project {
  return { ...row, origins: JSON.parse(row.origins) as string[] }
}

export function clearProjectCache() {
  cache.clear()
}

export function invalidateProjectCache(slug: string) {
  cache.delete(slug)
}

export async function getProjectBySlug(db: D1Database, slug: string): Promise<Project | null> {
  const cached = cache.get(slug)
  if (cached && cached.expiresAt > Date.now()) return cached.project

  const row = await db
    .prepare(
      `SELECT id, slug, name, api_key, origins, read_access, write_access, created_at, updated_at, disabled_at
       FROM projects WHERE slug = ?`,
    )
    .bind(slug)
    .first<ProjectRow>()
  if (!row) return null

  const project = parseProjectRow(row)
  cache.set(slug, { project, expiresAt: Date.now() + CACHE_TTL_MS })
  return project
}

function randomApiKey(): string {
  const bytes = new Uint8Array(20)
  crypto.getRandomValues(bytes)
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `kv_${hex}`
}

export async function listProjects(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.slug, p.name, p.api_key, p.origins, p.read_access, p.write_access,
              p.created_at, p.updated_at, p.disabled_at,
              (SELECT COUNT(*) FROM entries e WHERE e.project_id = p.id) AS entry_count
       FROM projects p
       ORDER BY p.slug`,
    )
    .all<ProjectRow & { entry_count: number }>()

  return results.map((row) => ({
    ...parseProjectRow(row),
    entry_count: row.entry_count,
  }))
}

export async function createProject(
  db: D1Database,
  input: {
    slug: string
    name: string
    origins: string[]
    read_access?: 'public' | 'osm_user'
    write_access?: 'any_osm_user' | 'allowlist'
  },
): Promise<Project> {
  const now = new Date().toISOString()
  const apiKey = randomApiKey()
  await db
    .prepare(
      `INSERT INTO projects (slug, name, api_key, origins, read_access, write_access, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.slug,
      input.name,
      apiKey,
      JSON.stringify(input.origins),
      input.read_access ?? 'public',
      input.write_access ?? 'any_osm_user',
      now,
      now,
    )
    .run()
  const project = await getProjectBySlug(db, input.slug)
  if (!project) throw new Error('project insert failed')
  return project
}

export async function getProjectStats(db: D1Database, projectId: number) {
  const entries = await db
    .prepare('SELECT COUNT(*) AS n FROM entries WHERE project_id = ?')
    .bind(projectId)
    .first<{ n: number }>()
  const tags = await db
    .prepare('SELECT COUNT(*) AS n FROM entry_tags WHERE project_id = ?')
    .bind(projectId)
    .first<{ n: number }>()
  const writers = await db
    .prepare('SELECT COUNT(DISTINCT updated_by_osm_uid) AS n FROM entries WHERE project_id = ?')
    .bind(projectId)
    .first<{ n: number }>()
  return {
    entries: entries?.n ?? 0,
    tags: tags?.n ?? 0,
    distinct_writers: writers?.n ?? 0,
  }
}

export async function updateProject(
  db: D1Database,
  slug: string,
  patch: {
    name?: string
    origins?: string[]
    read_access?: 'public' | 'osm_user'
    write_access?: 'any_osm_user' | 'allowlist'
    disabled?: boolean
  },
): Promise<Project | null> {
  const current = await db
    .prepare('SELECT * FROM projects WHERE slug = ?')
    .bind(slug)
    .first<ProjectRow>()
  if (!current) return null

  const now = new Date().toISOString()
  let disabledAt = current.disabled_at
  if (patch.disabled === true) disabledAt = now
  if (patch.disabled === false) disabledAt = null

  await db
    .prepare(
      `UPDATE projects SET
         name = ?, origins = ?, read_access = ?, write_access = ?, disabled_at = ?, updated_at = ?
       WHERE slug = ?`,
    )
    .bind(
      patch.name ?? current.name,
      JSON.stringify(patch.origins ?? JSON.parse(current.origins)),
      patch.read_access ?? current.read_access,
      patch.write_access ?? current.write_access,
      disabledAt,
      now,
      slug,
    )
    .run()
  invalidateProjectCache(slug)
  return getProjectBySlug(db, slug)
}

export async function rotateProjectKey(db: D1Database, slug: string): Promise<Project | null> {
  const now = new Date().toISOString()
  const apiKey = randomApiKey()
  const result = await db
    .prepare('UPDATE projects SET api_key = ?, updated_at = ? WHERE slug = ?')
    .bind(apiKey, now, slug)
    .run()
  if (!result.meta.changes) return null
  invalidateProjectCache(slug)
  return getProjectBySlug(db, slug)
}

export async function deleteProject(db: D1Database, slug: string): Promise<boolean> {
  const result = await db.prepare('DELETE FROM projects WHERE slug = ?').bind(slug).run()
  invalidateProjectCache(slug)
  return (result.meta.changes ?? 0) > 0
}
