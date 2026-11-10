import { SELF } from 'cloudflare:test'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { adminHeaders, createTestProject, projectHeaders } from './helpers'

const ORIGIN = 'https://app.example'
const USERS = {
  'token-a': { id: 101, name: 'alice' },
  'token-b': { id: 102, name: 'bob' },
} as const
// alice has changesets; nochangesets exists but has none.
const CHANGESETS: Record<string, number | null> = { alice: 101, bob: 102, nochangesets: null }

let osmCalls: string[] = []
let originalFetch: typeof fetch

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Stubs the OSM API: token checks, public user profiles, and changeset lookups. */
function osmHandler(request: Request): Response | undefined {
  const url = new URL(request.url)
  if (url.pathname === '/api/0.6/user/details.json') {
    const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? ''
    const user = USERS[token as keyof typeof USERS]
    if (!user) return new Response('unauthorized', { status: 401 })
    return jsonResponse({ user: { id: user.id, display_name: user.name } })
  }
  const profile = /^\/api\/0\.6\/user\/(\d+)\.json$/.exec(url.pathname)
  if (profile) {
    osmCalls.push(url.pathname)
    const user = Object.values(USERS).find((u) => u.id === Number(profile[1]))
    if (!user) return new Response('not found', { status: 404 })
    return jsonResponse({ user: { id: user.id, display_name: user.name } })
  }
  if (url.pathname === '/api/0.6/changesets.json') {
    osmCalls.push(`${url.pathname}?${url.searchParams}`)
    const name = url.searchParams.get('display_name') ?? ''
    if (!(name in CHANGESETS)) return new Response('not found', { status: 404 })
    const uid = CHANGESETS[name]
    return jsonResponse({ changesets: uid === null ? [] : [{ id: 1, uid, user: name }] })
  }
  return undefined
}

beforeEach(() => {
  osmCalls = []
  originalFetch = globalThis.fetch
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init)
    const stubbed = osmHandler(request)
    return stubbed ? Promise.resolve(stubbed) : originalFetch(input, init)
  }
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

function url(slug: string, path: string) {
  return `http://x/v1/projects/${slug}/${path}`
}

function put(slug: string, apiKey: string, token: string, id: string) {
  return SELF.fetch(url(slug, `entries/${encodeURIComponent(id)}`), {
    method: 'PUT',
    headers: projectHeaders(apiKey, ORIGIN, token),
    body: JSON.stringify({ data: { v: 1 }, tags: ['t'] }),
  })
}

function del(slug: string, apiKey: string, token: string, id: string) {
  return SELF.fetch(url(slug, `entries/${encodeURIComponent(id)}`), {
    method: 'DELETE',
    headers: projectHeaders(apiKey, ORIGIN, token),
  })
}

function batch(slug: string, apiKey: string, token: string, body: unknown) {
  return SELF.fetch(url(slug, 'batch'), {
    method: 'POST',
    headers: projectHeaders(apiKey, ORIGIN, token),
    body: JSON.stringify(body),
  })
}

async function me(slug: string, apiKey: string, token: string) {
  const response = await SELF.fetch(url(slug, 'me'), {
    headers: projectHeaders(apiKey, ORIGIN, token),
  })
  return (await response.json()) as { can_write: boolean }
}

function allowUser(slug: string, body: unknown) {
  return SELF.fetch(`http://x/admin/projects/${slug}/allowed-users`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(body),
  })
}

type AllowedUsersResult = {
  write_access: string
  allowed_users: { osm_uid: number; display_name: string }[]
  user?: { osm_uid: number; display_name: string | null }
  note?: string
}

async function expectForbidden(response: Response) {
  expect(response.status).toBe(403)
  const body = (await response.json()) as { error: { code: string; details?: { reason?: string } } }
  expect(body.error.code).toBe('forbidden_user')
  expect(body.error.details?.reason).toBe('not_on_allowlist')
}

test('allowlist project: allowed user can create, update, delete and batch', async () => {
  const p = await createTestProject({ write_access: 'allowlist' })
  expect((await allowUser(p.slug, { osm_uid: 101 })).status).toBe(200)

  expect((await put(p.slug, p.api_key, 'token-a', 'n/1')).status).toBe(201)
  expect((await put(p.slug, p.api_key, 'token-a', 'n/1')).status).toBe(200)
  const b = await batch(p.slug, p.api_key, 'token-a', { put: [{ id: 'n/2', data: {} }] })
  expect(b.status).toBe(200)
  expect((await del(p.slug, p.api_key, 'token-a', 'n/1')).status).toBe(204)
  expect((await me(p.slug, p.api_key, 'token-a')).can_write).toBe(true)
})

test('allowlist project: user not on the list gets 403 on every write, reads still work', async () => {
  const p = await createTestProject({ write_access: 'allowlist' })
  await allowUser(p.slug, { osm_uid: 101 })
  expect((await put(p.slug, p.api_key, 'token-a', 'n/1')).status).toBe(201)

  await expectForbidden(await put(p.slug, p.api_key, 'token-b', 'n/1'))
  await expectForbidden(await put(p.slug, p.api_key, 'token-b', 'n/new'))
  await expectForbidden(await del(p.slug, p.api_key, 'token-b', 'n/1'))
  await expectForbidden(await batch(p.slug, p.api_key, 'token-b', { delete: ['n/1'] }))
  expect((await me(p.slug, p.api_key, 'token-b')).can_write).toBe(false)

  const list = await SELF.fetch(url(p.slug, 'entries'), {
    headers: projectHeaders(p.api_key, ORIGIN),
  })
  expect(list.status).toBe(200)
  const items = ((await list.json()) as { items: { id: string; version: number }[] }).items
  expect(items).toEqual([expect.objectContaining({ id: 'n/1', version: 1 })])
})

test('allowlist project: empty list blocks everybody; removal takes effect right away', async () => {
  const p = await createTestProject({ write_access: 'allowlist' })
  await expectForbidden(await put(p.slug, p.api_key, 'token-a', 'n/1'))

  await allowUser(p.slug, { osm_uid: 101 })
  expect((await put(p.slug, p.api_key, 'token-a', 'n/1')).status).toBe(201)

  const removed = await SELF.fetch(`http://x/admin/projects/${p.slug}/allowed-users/101`, {
    method: 'DELETE',
    headers: adminHeaders(),
  })
  expect(removed.status).toBe(200)
  await expectForbidden(await put(p.slug, p.api_key, 'token-a', 'n/2'))

  // "Delete my data" keeps working for users who were removed from the list.
  const mine = await SELF.fetch(url(p.slug, 'me/entries'), {
    method: 'DELETE',
    headers: projectHeaders(p.api_key, ORIGIN, 'token-a'),
  })
  expect(mine.status).toBe(200)
  expect(await mine.json()).toEqual({ deleted: 1 })
})

test('any_osm_user project: every logged-in user can write, the list is ignored', async () => {
  const p = await createTestProject()
  await allowUser(p.slug, { osm_uid: 101 })
  expect((await put(p.slug, p.api_key, 'token-b', 'n/1')).status).toBe(201)
  expect((await put(p.slug, p.api_key, 'token-a', 'n/1')).status).toBe(200)
  expect((await batch(p.slug, p.api_key, 'token-b', { delete: ['n/1'] })).status).toBe(200)
  expect((await me(p.slug, p.api_key, 'token-b')).can_write).toBe(true)
})

test('allow_user resolves a display name via OSM and returns uid and name', async () => {
  const p = await createTestProject()
  const response = await allowUser(p.slug, { display_name: 'alice' })
  expect(response.status).toBe(200)
  const body = (await response.json()) as AllowedUsersResult
  expect(body.user).toEqual({ osm_uid: 101, display_name: 'alice' })
  expect(body.allowed_users).toEqual([
    expect.objectContaining({ osm_uid: 101, display_name: 'alice' }),
  ])
  expect(body.note).toContain('not enforced')
  expect(osmCalls).toEqual([
    '/api/0.6/changesets.json?display_name=alice&limit=1',
    '/api/0.6/user/101.json',
  ])

  // Adding again is idempotent.
  const again = (await (await allowUser(p.slug, { osm_uid: 101 })).json()) as AllowedUsersResult
  expect(again.allowed_users).toHaveLength(1)
})

test('allow_user rejects unknown users, users without changesets by name, and bad input', async () => {
  const p = await createTestProject()
  const unknownName = await allowUser(p.slug, { display_name: 'nobody' })
  expect(unknownName.status).toBe(404)
  const unknownUid = await allowUser(p.slug, { osm_uid: 999 })
  expect(unknownUid.status).toBe(404)
  const noChangesets = await allowUser(p.slug, { display_name: 'nochangesets' })
  expect(noChangesets.status).toBe(404)
  expect(((await noChangesets.json()) as { error: { message: string } }).error.message).toContain(
    'osm_uid',
  )
  expect((await allowUser(p.slug, {})).status).toBe(422)
  expect((await allowUser(p.slug, { osm_uid: 101, display_name: 'alice' })).status).toBe(422)
})

test('switching write_access to allowlist with an empty list warns', async () => {
  const p = await createTestProject()
  const response = await SELF.fetch(`http://x/admin/projects/${p.slug}`, {
    method: 'PATCH',
    headers: adminHeaders(),
    body: JSON.stringify({ write_access: 'allowlist' }),
  })
  const body = (await response.json()) as { warnings?: string[] }
  expect(body.warnings?.some((w) => w.includes('nobody can write'))).toBe(true)
})
