import { createExecutionContext, createScheduledController, env, SELF } from 'cloudflare:test'
import { afterEach, beforeEach, expect, test } from 'vitest'
import worker from '../src/index'
import { adminHeaders, createTestProject, osmUsers, projectHeaders } from './helpers'

const ORIGIN = 'https://app.example'
const ALICE = { id: 1, name: 'alice' }
const BOB = { id: 2, name: 'bob' }
// Only used by the orphan-cleanup test, so no other test's entries refer to her.
const CAROL = { id: 3, name: 'carol' }

let restoreFetch: (() => void) | undefined

beforeEach(() => {
  restoreFetch = osmUsers({ 'token-a': ALICE, 'token-b': BOB, 'token-c': CAROL })
})

afterEach(() => {
  restoreFetch?.()
  restoreFetch = undefined
})

type Entry = {
  id: string
  version: number
  tags: string[]
  created_by: { osm_uid: number }
  updated_by: { osm_uid: number }
  expires_at: string | null
}

function url(slug: string, path: string) {
  return `http://x/v1/projects/${slug}/${path}`
}

async function put(
  slug: string,
  apiKey: string,
  token: string,
  id: string,
  body: unknown,
  extra?: HeadersInit,
) {
  const headers = projectHeaders(apiKey, ORIGIN, token)
  for (const [k, v] of new Headers(extra)) headers.set(k, v)
  return SELF.fetch(url(slug, `entries/${encodeURIComponent(id)}`), {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  })
}

async function del(slug: string, apiKey: string, token: string, id: string) {
  return SELF.fetch(url(slug, `entries/${encodeURIComponent(id)}`), {
    method: 'DELETE',
    headers: projectHeaders(apiKey, ORIGIN, token),
  })
}

async function get(slug: string, apiKey: string, token: string, path: string) {
  return SELF.fetch(url(slug, path), { headers: projectHeaders(apiKey, ORIGIN, token) })
}

// --- compatibility: default settings behave like before -------------------

test('default project: shared editing, no expiry, unchanged response fields', async () => {
  const p = await createTestProject()
  const created = await put(p.slug, p.api_key, 'token-a', 'dataset:1', {
    data: { v: 1 },
    tags: ['dataset'],
  })
  expect(created.status).toBe(201)
  const a = (await created.json()) as Entry
  expect(a.expires_at).toBeNull()

  // Bob overwrites and then deletes Alice's entry (knotenpunkte / parkraum style).
  const updated = await put(p.slug, p.api_key, 'token-b', 'dataset:1', {
    data: { v: 2 },
    tags: ['dataset'],
  })
  expect(updated.status).toBe(200)
  const b = (await updated.json()) as Entry
  expect(b.version).toBe(2)
  expect(b.created_by.osm_uid).toBe(ALICE.id)
  expect(b.updated_by.osm_uid).toBe(BOB.id)
  expect(Object.keys(b).sort()).toEqual(
    [
      'created_at',
      'created_by',
      'data',
      'expires_at',
      'id',
      'tags',
      'updated_at',
      'updated_by',
      'version',
    ].sort(),
  )

  expect((await del(p.slug, p.api_key, 'token-b', 'dataset:1')).status).toBe(204)
})

test('a rejected If-Match update does not change the tag index', async () => {
  const p = await createTestProject()
  await put(p.slug, p.api_key, 'token-a', 'e1', { data: { v: 1 }, tags: ['old'] })
  const conflict = await put(
    p.slug,
    p.api_key,
    'token-a',
    'e1',
    { data: { v: 2 }, tags: ['new'] },
    { 'If-Match': '"99"' },
  )
  expect(conflict.status).toBe(409)

  const byOld = (await (await get(p.slug, p.api_key, 'token-a', 'entries?tag=old')).json()) as {
    items: Entry[]
  }
  expect(byOld.items.map((i) => i.id)).toEqual(['e1'])
  const byNew = (await (await get(p.slug, p.api_key, 'token-a', 'entries?tag=new')).json()) as {
    items: Entry[]
  }
  expect(byNew.items).toEqual([])
})

// --- R1 owner scope -------------------------------------------------------

test('owner scope: ids must be in the own namespace; others cannot change or delete', async () => {
  const p = await createTestProject({ write_scope: 'owner' })
  const foreign = await put(p.slug, p.api_key, 'token-a', 'n123', { data: {}, tags: [] })
  expect(foreign.status).toBe(403)
  expect(((await foreign.json()) as { error: { code: string } }).error.code).toBe('forbidden_user')

  expect((await put(p.slug, p.api_key, 'token-a', '1/n123', { data: {}, tags: [] })).status).toBe(
    201,
  )
  expect((await put(p.slug, p.api_key, 'token-b', '1/n123', { data: {}, tags: [] })).status).toBe(
    403,
  )
  expect((await del(p.slug, p.api_key, 'token-b', '1/n123')).status).toBe(403)
  expect((await del(p.slug, p.api_key, 'token-a', '1/n123')).status).toBe(204)
})

test('owner scope: a legacy entry in the namespace created by someone else stays protected', async () => {
  const p = await createTestProject({ write_scope: 'owner' })
  const projectId = (await env.DB.prepare('SELECT id FROM projects WHERE slug = ?')
    .bind(p.slug)
    .first<{ id: number }>())!.id
  const now = new Date().toISOString()
  await env.DB.prepare(
    `INSERT INTO entries (project_id, entry_id, data, tags, version, created_at, updated_at, created_by_osm_uid, updated_by_osm_uid)
     VALUES (?, '1/legacy', '{}', '[]', 1, ?, ?, 2, 2)`,
  )
    .bind(projectId, now, now)
    .run()
  expect((await put(p.slug, p.api_key, 'token-a', '1/legacy', { data: {}, tags: [] })).status).toBe(
    403,
  )
  expect((await del(p.slug, p.api_key, 'token-a', '1/legacy')).status).toBe(403)
})

// --- R2 TTL ---------------------------------------------------------------

test('TTL: expires_at is set on create, kept on update, and expired entries are hidden and reset', async () => {
  const p = await createTestProject({ entry_ttl_s: 3600 })
  const before = Date.now()
  const created = (await (
    await put(p.slug, p.api_key, 'token-a', 'x', { data: { v: 1 }, tags: ['t'] })
  ).json()) as Entry
  const expiresAt = Date.parse(created.expires_at!)
  expect(expiresAt).toBeGreaterThanOrEqual(before + 3600_000 - 1000)
  expect(expiresAt).toBeLessThanOrEqual(Date.now() + 3600_000 + 1000)

  const updated = (await (
    await put(p.slug, p.api_key, 'token-a', 'x', { data: { v: 2 }, tags: ['t'] })
  ).json()) as Entry
  expect(updated.expires_at).toBe(created.expires_at)

  // Let it expire.
  await env.DB.prepare(
    "UPDATE entries SET expires_at = '2000-01-01T00:00:00.000Z' WHERE entry_id = 'x'",
  ).run()
  expect((await get(p.slug, p.api_key, 'token-a', 'entries/x')).status).toBe(404)
  const list = (await (await get(p.slug, p.api_key, 'token-a', 'entries?tag=t')).json()) as {
    items: Entry[]
  }
  expect(list.items).toEqual([])
  const tags = (await (await get(p.slug, p.api_key, 'token-a', 'tags')).json()) as {
    tags: unknown[]
  }
  expect(tags.tags).toEqual([])

  // Writing again starts a fresh entry.
  const reset = await put(p.slug, p.api_key, 'token-b', 'x', { data: { v: 3 }, tags: ['t'] })
  expect(reset.status).toBe(201)
  const fresh = (await reset.json()) as Entry
  expect(fresh.version).toBe(1)
  expect(fresh.created_by.osm_uid).toBe(BOB.id)
  expect(Date.parse(fresh.expires_at!)).toBeGreaterThan(Date.now())
})

test('cleanup job purges expired entries and orphaned users', async () => {
  const p = await createTestProject({ entry_ttl_s: 3600 })
  await put(p.slug, p.api_key, 'token-c', 'gone', { data: {}, tags: ['t'] })
  await env.DB.prepare(
    "UPDATE entries SET expires_at = '2000-01-01T00:00:00.000Z' WHERE entry_id = 'gone'",
  ).run()
  await env.DB.prepare('DELETE FROM verified_tokens WHERE osm_uid = ?').bind(CAROL.id).run()

  await worker.scheduled(createScheduledController(), env, createExecutionContext())

  expect(await env.DB.prepare("SELECT 1 FROM entries WHERE entry_id = 'gone'").first()).toBeNull()
  expect(
    await env.DB.prepare(
      'SELECT 1 FROM entry_tags t LEFT JOIN entries e ON e.pk = t.entry_pk WHERE e.pk IS NULL',
    ).first(),
  ).toBeNull()
  expect(
    await env.DB.prepare('SELECT 1 FROM osm_users WHERE osm_uid = ?').bind(CAROL.id).first(),
  ).toBeNull()
})

test('cleanup job keeps users that still have entries or a cached token', async () => {
  const p = await createTestProject()
  await put(p.slug, p.api_key, 'token-a', 'keep', { data: {}, tags: [] })
  await put(p.slug, p.api_key, 'token-b', 'bob-temp', { data: {}, tags: [] })
  await del(p.slug, p.api_key, 'token-b', 'bob-temp')

  await worker.scheduled(createScheduledController(), env, createExecutionContext())

  // Alice has an entry; Bob has no entry but a cached token.
  expect(
    await env.DB.prepare('SELECT 1 FROM osm_users WHERE osm_uid = ?').bind(ALICE.id).first(),
  ).not.toBeNull()
  expect(
    await env.DB.prepare('SELECT 1 FROM osm_users WHERE osm_uid = ?').bind(BOB.id).first(),
  ).not.toBeNull()
})

// --- R3 delete my data (this project only) ---------------------------------

test('DELETE /me/entries removes only my entries in this project', async () => {
  const live = await createTestProject({ write_scope: 'owner' })
  const other = await createTestProject()
  await put(live.slug, live.api_key, 'token-a', '1/n1', { data: {}, tags: ['z14/1/1', 'z14/1/2'] })
  await put(live.slug, live.api_key, 'token-a', '1/w2', { data: {}, tags: [] })
  await put(live.slug, live.api_key, 'token-b', '2/n1', { data: {}, tags: [] })
  await put(other.slug, other.api_key, 'token-a', 'rating:1', { data: {}, tags: [] })

  const nuke = await SELF.fetch(url(live.slug, 'me/entries'), {
    method: 'DELETE',
    headers: projectHeaders(live.api_key, ORIGIN, 'token-a'),
  })
  expect(nuke.status).toBe(200)
  expect(await nuke.json()).toEqual({ deleted: 2 })

  expect((await get(live.slug, live.api_key, 'token-b', 'entries/2%2Fn1')).status).toBe(200)
  expect((await get(other.slug, other.api_key, 'token-a', 'entries/rating%3A1')).status).toBe(200)

  // Evict the token cache, then run the cleanup: Alice still has data in the other project.
  await SELF.fetch(url(live.slug, 'me'), {
    method: 'DELETE',
    headers: projectHeaders(live.api_key, ORIGIN, 'token-a'),
  })
  await worker.scheduled(createScheduledController(), env, createExecutionContext())
  expect(
    await env.DB.prepare('SELECT 1 FROM osm_users WHERE osm_uid = ?').bind(ALICE.id).first(),
  ).not.toBeNull()
})

test('DELETE /me/entries needs an OSM login', async () => {
  const p = await createTestProject()
  const res = await SELF.fetch(url(p.slug, 'me/entries'), {
    method: 'DELETE',
    headers: projectHeaders(p.api_key, ORIGIN),
  })
  expect(res.status).toBe(401)
})

// --- R5 batch --------------------------------------------------------------

test('POST /batch writes and deletes in one call', async () => {
  const p = await createTestProject({ write_scope: 'owner', entry_ttl_s: 3600 })
  await put(p.slug, p.api_key, 'token-a', '1/old', { data: {}, tags: ['z14/1/1'] })
  const res = await SELF.fetch(url(p.slug, 'batch'), {
    method: 'POST',
    headers: projectHeaders(p.api_key, ORIGIN, 'token-a'),
    body: JSON.stringify({
      put: [
        { id: '1/n1', data: { s: 'touched' }, tags: ['z14/1/1'] },
        { id: '1/w2', data: { s: 'touched' }, tags: ['z14/1/1', 'z14/1/2'] },
      ],
      delete: ['1/old', '1/never-existed'],
    }),
  })
  expect(res.status).toBe(200)
  const body = (await res.json()) as { put: Entry[]; deleted: number }
  expect(body.put.map((e) => e.id)).toEqual(['1/n1', '1/w2'])
  expect(body.deleted).toBe(1)

  const list = (await (
    await get(p.slug, p.api_key, 'token-b', 'entries?tag=z14/1/2&tag=z14/1/1&match=any')
  ).json()) as { items: Entry[] }
  expect(list.items.map((e) => e.id).sort()).toEqual(['1/n1', '1/w2'])
})

test('POST /batch in owner scope rejects the whole batch for a foreign id', async () => {
  const p = await createTestProject({ write_scope: 'owner' })
  const res = await SELF.fetch(url(p.slug, 'batch'), {
    method: 'POST',
    headers: projectHeaders(p.api_key, ORIGIN, 'token-a'),
    body: JSON.stringify({
      put: [
        { id: '1/ok', data: {} },
        { id: '2/theirs', data: {} },
      ],
    }),
  })
  expect(res.status).toBe(403)
  expect((await get(p.slug, p.api_key, 'token-a', 'entries/1%2Fok')).status).toBe(404)
})

test('POST /batch validates size and duplicate ids', async () => {
  const p = await createTestProject()
  const dup = await SELF.fetch(url(p.slug, 'batch'), {
    method: 'POST',
    headers: projectHeaders(p.api_key, ORIGIN, 'token-a'),
    body: JSON.stringify({ put: [{ id: 'a', data: {} }], delete: ['a'] }),
  })
  expect(dup.status).toBe(422)
  const tooMany = await SELF.fetch(url(p.slug, 'batch'), {
    method: 'POST',
    headers: projectHeaders(p.api_key, ORIGIN, 'token-a'),
    body: JSON.stringify({
      put: Array.from({ length: 26 }, (_, i) => ({ id: `e${i}`, data: {} })),
    }),
  })
  expect(tooMany.status).toBe(422)
})

// --- admin settings ----------------------------------------------------------

test('admin: new settings are admin-only project fields with warnings on change', async () => {
  const p = await createTestProject()
  const got = (await (
    await SELF.fetch(`http://x/admin/projects/${p.slug}`, { headers: adminHeaders() })
  ).json()) as {
    write_scope: string
    entry_ttl_s: number | null
  }
  expect(got.write_scope).toBe('any')
  expect(got.entry_ttl_s).toBeNull()

  await put(p.slug, p.api_key, 'token-a', 'legacy', { data: {}, tags: [] })
  const patched = await SELF.fetch(`http://x/admin/projects/${p.slug}`, {
    method: 'PATCH',
    headers: adminHeaders(),
    body: JSON.stringify({ write_scope: 'owner', entry_ttl_s: 10800 }),
  })
  expect(patched.status).toBe(200)
  const body = (await patched.json()) as {
    write_scope: string
    entry_ttl_s: number
    warnings: string[]
  }
  expect(body.write_scope).toBe('owner')
  expect(body.entry_ttl_s).toBe(10800)
  expect(body.warnings).toHaveLength(2)

  const invalid = await SELF.fetch(`http://x/admin/projects/${p.slug}`, {
    method: 'PATCH',
    headers: adminHeaders(),
    body: JSON.stringify({ entry_ttl_s: 5 }),
  })
  expect(invalid.status).toBe(422)
})
