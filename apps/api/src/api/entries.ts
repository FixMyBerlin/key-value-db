import { Hono } from 'hono'
import { requireOsm, requireOsmIfPrivateRead } from '../auth/osmAuth'
import type { AppEnv } from '../auth/projectAuth'
import { decodeCursor, encodeCursor } from '../http/cursor'
import { ApiError } from '../http/errors'
import { json, readJsonBody } from '../http/json'
import { zodApiError } from '../http/zod'
import { entryIdSchema, listEntriesQuerySchema, putEntrySchema } from '../schemas/entry'
import { deleteEntry, getEntry, listEntries, mapEntry, upsertEntry } from '../store/entries'
import { getOsmUsersByUids } from '../store/users'

export const entriesApi = new Hono<AppEnv>()

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

  const row = await getEntry(c.env.DB, project.id, idParsed.data)
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

  const expectedVersion = parseIfMatch(c.req.header('If-Match'))
  const now = new Date().toISOString()
  const row = await upsertEntry(c.env.DB, {
    projectId: project.id,
    entryId: idParsed.data,
    dataJson: JSON.stringify(body.data.data),
    tagsJson: JSON.stringify(body.data.tags),
    now,
    osmUid: user.osm_uid,
    expectedVersion,
  })
  if (!row) throw new ApiError(409, 'version_conflict', 'Entry version does not match If-Match')

  const names = await getOsmUsersByUids(c.env.DB, [row.created_by_osm_uid, row.updated_by_osm_uid])
  const entry = mapEntry(row, names, user)
  const created = row.created_at === row.updated_at
  return json(c, entry, created ? 201 : 200)
})

entriesApi.delete('/entries/:id{.+}', requireOsm, async (c) => {
  const project = c.get('project')
  const idParsed = entryIdSchema.safeParse(c.req.param('id'))
  if (!idParsed.success) throw zodApiError(idParsed.error)
  const deleted = await deleteEntry(c.env.DB, project.id, idParsed.data)
  if (!deleted) throw new ApiError(404, 'not_found', 'Entry not found')
  return c.body(null, 204)
})
