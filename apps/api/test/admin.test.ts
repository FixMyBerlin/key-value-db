import { SELF } from 'cloudflare:test'
import { expect, test } from 'vitest'
import { adminHeaders, projectHeaders } from './helpers'

test('admin REST create project then use that key', async () => {
  const slug = `admin-${crypto.randomUUID()}`
  const created = await SELF.fetch('http://x/admin/projects', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({
      slug,
      name: 'Admin created',
      origins: ['https://admin.example'],
    }),
  })
  expect(created.status).toBe(201)
  const project = (await created.json()) as { api_key: string; slug: string }
  expect(project.api_key.startsWith('kv_')).toBe(true)

  const listed = await SELF.fetch('http://x/admin/projects', { headers: adminHeaders() })
  expect(listed.status).toBe(200)

  const got = await SELF.fetch(`http://x/admin/projects/${slug}`, { headers: adminHeaders() })
  expect(got.status).toBe(200)

  const use = await SELF.fetch(`http://x/v1/projects/${slug}/entries`, {
    headers: projectHeaders(project.api_key, 'https://admin.example'),
  })
  expect(use.status).toBe(200)

  const rotated = await SELF.fetch(`http://x/admin/projects/${slug}/rotate-key`, {
    method: 'POST',
    headers: adminHeaders(),
  })
  expect(rotated.status).toBe(200)
  const rotatedBody = (await rotated.json()) as { api_key: string }
  expect(rotatedBody.api_key).not.toBe(project.api_key)

  const status = await SELF.fetch('http://x/admin/db-status', { headers: adminHeaders() })
  expect(status.status).toBe(200)
})

test('admin without bearer is 401', async () => {
  const response = await SELF.fetch('http://x/admin/projects')
  expect(response.status).toBe(401)
})
