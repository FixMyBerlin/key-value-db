import { env, SELF } from 'cloudflare:test'
import { afterEach, expect, test } from 'vitest'
import { sha256Hex } from '../src/auth/timingSafe'
import { createTestProject, osmOk, projectHeaders, stubOsmFetch } from './helpers'

let restoreFetch: (() => void) | undefined

afterEach(() => {
  restoreFetch?.()
  restoreFetch = undefined
})

test('OSM cache hit does not call OSM', async () => {
  const project = await createTestProject()
  const token = 'cached-token'
  const hash = await sha256Hex(token)
  const now = new Date().toISOString()
  await env.DB.prepare(
    `INSERT INTO osm_users (osm_uid, display_name, first_seen_at, last_seen_at) VALUES (99, 'cached', ?, ?)`,
  )
    .bind(now, now)
    .run()
  await env.DB.prepare(
    `INSERT INTO verified_tokens (token_hash, osm_uid, verified_at) VALUES (?, 99, ?)`,
  )
    .bind(hash, now)
    .run()

  let called = false
  restoreFetch = stubOsmFetch(() => {
    called = true
    return new Response('no', { status: 500 })
  })

  const response = await SELF.fetch(`http://x/v1/projects/${project.slug}/me`, {
    headers: projectHeaders(project.api_key, 'https://app.example', token),
  })
  expect(response.status).toBe(200)
  expect(called).toBe(false)
  const body = (await response.json()) as { user: { osm_uid: number; display_name: string } }
  expect(body.user.osm_uid).toBe(99)
  expect(body.user.display_name).toBe('cached')
})

test('OSM cache miss fetches user details', async () => {
  const project = await createTestProject()
  restoreFetch = osmOk(12345, 'tester')
  const response = await SELF.fetch(`http://x/v1/projects/${project.slug}/me`, {
    headers: projectHeaders(project.api_key, 'https://app.example', 'fresh-token'),
  })
  expect(response.status).toBe(200)
  const body = (await response.json()) as { user: { osm_uid: number; display_name: string } }
  expect(body.user).toEqual({ osm_uid: 12345, display_name: 'tester' })
})

test('stale cache younger than 24h is accepted when OSM is down', async () => {
  const project = await createTestProject()
  const token = 'stale-token'
  const hash = await sha256Hex(token)
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  await env.DB.prepare(
    `INSERT INTO osm_users (osm_uid, display_name, first_seen_at, last_seen_at) VALUES (7, 'stale', ?, ?)`,
  )
    .bind(twoHoursAgo, twoHoursAgo)
    .run()
  await env.DB.prepare(
    `INSERT INTO verified_tokens (token_hash, osm_uid, verified_at) VALUES (?, 7, ?)`,
  )
    .bind(hash, twoHoursAgo)
    .run()

  restoreFetch = stubOsmFetch(() => new Response('down', { status: 503 }))
  const response = await SELF.fetch(`http://x/v1/projects/${project.slug}/me`, {
    headers: projectHeaders(project.api_key, 'https://app.example', token),
  })
  expect(response.status).toBe(200)
  const body = (await response.json()) as { user: { osm_uid: number } }
  expect(body.user.osm_uid).toBe(7)
})

test('OSM 401 is unauthenticated', async () => {
  const project = await createTestProject()
  restoreFetch = stubOsmFetch(() => new Response('no', { status: 401 }))
  const response = await SELF.fetch(`http://x/v1/projects/${project.slug}/me`, {
    headers: projectHeaders(project.api_key, 'https://app.example', 'bad-token'),
  })
  expect(response.status).toBe(401)
  const body = (await response.json()) as { error: { code: string } }
  expect(body.error.code).toBe('unauthenticated')
})
