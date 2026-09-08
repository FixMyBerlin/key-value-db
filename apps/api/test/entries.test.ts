import { SELF } from 'cloudflare:test'
import { afterEach, expect, test } from 'vitest'
import { createTestProject, osmOk, projectHeaders } from './helpers'

let restoreFetch: (() => void) | undefined

afterEach(() => {
  restoreFetch?.()
  restoreFetch = undefined
})

async function setup() {
  restoreFetch = osmOk()
  const project = await createTestProject()
  const headers = projectHeaders(project.api_key, 'https://app.example', 'osm-token')
  return { project, headers }
}

test('PUT create, GET one with ETag, DELETE', async () => {
  const { project, headers } = await setup()
  const put = await SELF.fetch(`http://x/v1/projects/${project.slug}/entries/way%2F1`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ data: { title: 'a' }, tags: ['sidewalk'] }),
  })
  expect(put.status).toBe(201)
  const created = (await put.json()) as {
    version: number
    id: string
    created_by: { osm_uid: number }
  }
  expect(created.id).toBe('way/1')
  expect(created.version).toBe(1)
  expect(created.created_by.osm_uid).toBe(12345)

  const get = await SELF.fetch(`http://x/v1/projects/${project.slug}/entries/way%2F1`, {
    headers,
  })
  expect(get.status).toBe(200)
  expect(get.headers.get('ETag')).toBe('"1"')

  const del = await SELF.fetch(`http://x/v1/projects/${project.slug}/entries/way%2F1`, {
    method: 'DELETE',
    headers,
  })
  expect(del.status).toBe(204)

  const missing = await SELF.fetch(`http://x/v1/projects/${project.slug}/entries/way%2F1`, {
    headers,
  })
  expect(missing.status).toBe(404)
})

test('If-Match mismatch is 409', async () => {
  const { project, headers } = await setup()
  await SELF.fetch(`http://x/v1/projects/${project.slug}/entries/e1`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ data: { n: 1 }, tags: [] }),
  })
  const conflictHeaders = new Headers(headers)
  conflictHeaders.set('If-Match', '"99"')
  const conflict = await SELF.fetch(`http://x/v1/projects/${project.slug}/entries/e1`, {
    method: 'PUT',
    headers: conflictHeaders,
    body: JSON.stringify({ data: { n: 2 }, tags: [] }),
  })
  expect(conflict.status).toBe(409)
  const body = (await conflict.json()) as { error: { code: string } }
  expect(body.error.code).toBe('version_conflict')
})

test('tag match all vs any, cursor, updated_since, tags endpoint', async () => {
  const { project, headers } = await setup()
  await SELF.fetch(`http://x/v1/projects/${project.slug}/entries/a`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ data: { i: 1 }, tags: ['alpha', 'beta'] }),
  })
  await SELF.fetch(`http://x/v1/projects/${project.slug}/entries/b`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ data: { i: 2 }, tags: ['beta'] }),
  })
  await SELF.fetch(`http://x/v1/projects/${project.slug}/entries/c`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ data: { i: 3 }, tags: ['gamma'] }),
  })

  const all = await SELF.fetch(
    `http://x/v1/projects/${project.slug}/entries?tag=alpha&tag=beta&match=all`,
    { headers },
  )
  const allBody = (await all.json()) as { items: { id: string }[] }
  expect(allBody.items.map((i) => i.id)).toEqual(['a'])

  const any = await SELF.fetch(
    `http://x/v1/projects/${project.slug}/entries?tag=alpha&tag=gamma&match=any`,
    { headers },
  )
  const anyBody = (await any.json()) as { items: { id: string }[] }
  expect(anyBody.items.map((i) => i.id).sort()).toEqual(['a', 'c'])

  const page1 = await SELF.fetch(`http://x/v1/projects/${project.slug}/entries?limit=1`, {
    headers,
  })
  const p1 = (await page1.json()) as { items: { id: string }[]; next_cursor: string | null }
  expect(p1.items).toHaveLength(1)
  expect(p1.next_cursor).toBeTruthy()

  const page2 = await SELF.fetch(
    `http://x/v1/projects/${project.slug}/entries?limit=10&cursor=${p1.next_cursor}`,
    { headers },
  )
  const p2 = (await page2.json()) as { items: { id: string }[] }
  expect(p2.items.length).toBeGreaterThan(0)
  expect(p2.items[0]?.id).not.toBe(p1.items[0]?.id)

  const future = new Date(Date.now() + 60_000).toISOString()
  const since = await SELF.fetch(
    `http://x/v1/projects/${project.slug}/entries?updated_since=${encodeURIComponent(future)}`,
    { headers },
  )
  const sinceBody = (await since.json()) as { items: unknown[] }
  expect(sinceBody.items).toHaveLength(0)

  const tags = await SELF.fetch(`http://x/v1/projects/${project.slug}/tags`, { headers })
  const tagBody = (await tags.json()) as { tags: { tag: string; count: number }[] }
  expect(tagBody.tags.find((t) => t.tag === 'beta')?.count).toBe(2)
})
