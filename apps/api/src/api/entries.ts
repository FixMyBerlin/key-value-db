import { Hono } from 'hono'
import { requireOsm, requireOsmIfPrivateRead } from '../auth/osmAuth'
import type { AppEnv } from '../auth/projectAuth'
import { isoNow } from '../env'
import { decodeCursor, encodeCursor } from '../http/cursor'
import { ApiError } from '../http/errors'
import { json, readJsonBody } from '../http/json'
import { zodApiError } from '../http/zod'
import {
  batchSchema,
  entryIdSchema,
  listEntriesQuerySchema,
  putEntrySchema,
} from '../schemas/entry'
import {
  deleteEntry,
  deleteStatement,
  getEntry,
  listEntries,
  mapEntry,
  upsertEntry,
  upsertStatements,
  type EntryRow,
} from '../store/entries'
import type { Project } from '../store/projects'
import { getOsmUsersByUids } from '../store/users'

export const entriesApi = new Hono<AppEnv>()

/** write_scope = 'owner': ids must live in the writer's own namespace `<osm_uid>/…`. */
function assertOwnNamespace(project: Project, osmUid: number, entryIds: string[]) {
  if (project.write_scope !== 'owner') return
  const foreign = entryIds.filter((id) => !id.startsWith(`${osmUid}/`))
  if (foreign.length > 0) {
    throw new ApiError(
      403,
      'forbidden_user',
      "Entry ids must start with the writer's OSM user id and '/'",
      { prefix: `${osmUid}/`, ids: foreign },
    )
  }
}

function expiresAtFor(project: Project, now: string): string | null {
  if (project.entry_ttl_s === null) return null
  return new Date(Date.parse(now) + project.entry_ttl_s * 1000).toISOString()
}

function parseIfMatch(header: string | undefined): number | null {
  if (header === undefined) return null
  const match = /^"(\d+)"$/.exec(header.trim())
  if (!match?.[1]) {
    throw new ApiError(422, 'validation_failed', 'If-Match must be a quoted version', {
      field: 'If-Match',
    })
  }
  return Number(match[1])
}

entriesApi.get('/entries', requireOsmIfPrivateRead, async (c) => {
  const project = c.get('project')
  const url = new URL(c.req.url)
  const tags = url.searchParams
    .getAll('tag')
    .map((t) => t.trim())
    .filter(Boolean)
  const parsed = listEntriesQuerySchema.safeParse({
    match: url.searchParams.get('match') ?? undefined,
    updated_since: url.searchParams.get('updated_since') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
    cursor: url.searchParams.get('cursor') ?? undefined,
  })
  if (!parsed.success) throw zodApiError(parsed.error)

  const query = parsed.data
  const cursor = query.cursor ? decodeCursor(query.cursor) : undefined
  const rows = await listEntries(c.env.DB, {
    projectId: project.id,
    tags,
    match: query.match,
    updatedSince: query.updated_since,
    cursor,
    limit: query.limit + 1,
    now: isoNow(),
  })

  let nextCursor: string | null = null
  if (rows.length > query.limit) {
    const extra = rows.pop()
    const last = rows.at(-1)
    if (extra && last) nextCursor = encodeCursor(last.updated_at, last.pk)
  }

  const names = await getOsmUsersByUids(
    c.env.DB,
    rows.flatMap((row) => [row.created_by_osm_uid, row.updated_by_osm_uid]),
  )
  return json(c, {
    items: rows.map((row) => mapEntry(row, names, c.get('osmUser'))),
    next_cursor: nextCursor,
  })
})

entriesApi.get('/entries/:id{.+}', requireOsmIfPrivateRead, async (c) => {
  const project = c.get('project')
  const idParsed = entryIdSchema.safeParse(c.req.param('id'))
  if (!idParsed.success) throw zodApiError(idParsed.error)

  const row = await getEntry(c.env.DB, project.id, idParsed.data, isoNow())
  if (!row) throw new ApiError(404, 'not_found', 'Entry not found')

  const names = await getOsmUsersByUids(c.env.DB, [row.created_by_osm_uid, row.updated_by_osm_uid])
  c.header('ETag', `"${row.version}"`)
  return json(c, mapEntry(row, names, c.get('osmUser')))
})

entriesApi.put('/entries/:id{.+}', requireOsm, async (c) => {
  const project = c.get('project')
  const user = c.get('osmUser')
  if (!user) throw new ApiError(401, 'unauthenticated', 'OSM user required')

  const idParsed = entryIdSchema.safeParse(c.req.param('id'))
  if (!idParsed.success) throw zodApiError(idParsed.error)

  const body = putEntrySchema.safeParse(await readJsonBody(c))
  if (!body.success) throw zodApiError(body.error)

  assertOwnNamespace(project, user.osm_uid, [idParsed.data])
  const expectedVersion = parseIfMatch(c.req.header('If-Match'))
  const now = isoNow()
  const row = await upsertEntry(c.env.DB, {
    projectId: project.id,
    entryId: idParsed.data,
    dataJson: JSON.stringify(body.data.data),
    tagsJson: JSON.stringify(body.data.tags),
    now,
    osmUid: user.osm_uid,
    expectedVersion,
    ownerOnly: project.write_scope === 'owner',
    expiresAt: expiresAtFor(project, now),
  })
  if (!row) {
    const existing = await getEntry(c.env.DB, project.id, idParsed.data, now)
    if (
      existing &&
      project.write_scope === 'owner' &&
      existing.created_by_osm_uid !== user.osm_uid
    ) {
      throw new ApiError(403, 'forbidden_user', 'Only the creator may change this entry')
    }
    throw new ApiError(409, 'version_conflict', 'Entry version does not match If-Match')
  }

  const names = await getOsmUsersByUids(c.env.DB, [row.created_by_osm_uid, row.updated_by_osm_uid])
  const entry = mapEntry(row, names, user)
  const created = row.created_at === row.updated_at
  return json(c, entry, created ? 201 : 200)
})

entriesApi.delete('/entries/:id{.+}', requireOsm, async (c) => {
  const project = c.get('project')
  const user = c.get('osmUser')
  if (!user) throw new ApiError(401, 'unauthenticated', 'OSM user required')
  const idParsed = entryIdSchema.safeParse(c.req.param('id'))
  if (!idParsed.success) throw zodApiError(idParsed.error)
  assertOwnNamespace(project, user.osm_uid, [idParsed.data])
  const now = isoNow()
  const deleted = await deleteEntry(c.env.DB, {
    projectId: project.id,
    entryId: idParsed.data,
    now,
    ownerUid: project.write_scope === 'owner' ? user.osm_uid : null,
  })
  if (!deleted) {
    const existing = await getEntry(c.env.DB, project.id, idParsed.data, now)
    if (existing)
      throw new ApiError(403, 'forbidden_user', 'Only the creator may delete this entry')
    throw new ApiError(404, 'not_found', 'Entry not found')
  }
  return c.body(null, 204)
})

/**
 * Several puts and deletes in one atomic D1 batch. No If-Match. In owner-scope
 * projects every id must be in the writer's namespace, and the whole batch fails
 * with 403 if one of them belongs to another creator. Deleting an absent id is not an error.
 */
entriesApi.post('/batch', requireOsm, async (c) => {
  const project = c.get('project')
  const user = c.get('osmUser')
  if (!user) throw new ApiError(401, 'unauthenticated', 'OSM user required')

  const body = batchSchema.safeParse(await readJsonBody(c))
  if (!body.success) throw zodApiError(body.error)
  const { put, delete: deleteIds } = body.data
  const allIds = [...put.map((p) => p.id), ...deleteIds]
  assertOwnNamespace(project, user.osm_uid, allIds)

  const now = isoNow()
  const ownerOnly = project.write_scope === 'owner'
  if (ownerOnly && allIds.length > 0) {
    const placeholders = allIds.map(() => '?').join(', ')
    const { results } = await c.env.DB.prepare(
      `SELECT entry_id FROM entries
       WHERE project_id = ? AND entry_id IN (${placeholders})
         AND (expires_at IS NULL OR expires_at > ?) AND created_by_osm_uid != ?`,
    )
      .bind(project.id, ...allIds, now, user.osm_uid)
      .all<{ entry_id: string }>()
    if (results.length > 0) {
      throw new ApiError(403, 'forbidden_user', 'Only the creator may change these entries', {
        ids: results.map((r) => r.entry_id),
      })
    }
  }

  const expiresAt = expiresAtFor(project, now)
  const statements = [
    ...put.flatMap((p) =>
      upsertStatements(c.env.DB, {
        projectId: project.id,
        entryId: p.id,
        dataJson: JSON.stringify(p.data),
        tagsJson: JSON.stringify(p.tags),
        now,
        osmUid: user.osm_uid,
        expectedVersion: null,
        ownerOnly,
        expiresAt,
      }),
    ),
    ...deleteIds.map((id) =>
      deleteStatement(c.env.DB, {
        projectId: project.id,
        entryId: id,
        now,
        ownerUid: ownerOnly ? user.osm_uid : null,
      }),
    ),
  ]
  const results = statements.length > 0 ? await c.env.DB.batch<EntryRow>(statements) : []

  const rows = put
    .map((_, i) => results[i * 3]?.results[0])
    .filter((row): row is EntryRow => row !== undefined)
  const deleted = deleteIds.reduce(
    (n, _, i) => n + (results[put.length * 3 + i]?.results.length ?? 0),
    0,
  )
  const names = await getOsmUsersByUids(
    c.env.DB,
    rows.flatMap((row) => [row.created_by_osm_uid, row.updated_by_osm_uid]),
  )
  return json(c, { put: rows.map((row) => mapEntry(row, names, user)), deleted })
})
