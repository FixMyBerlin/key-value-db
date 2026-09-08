import { env, SELF } from 'cloudflare:test'
import { expect, test } from 'vitest'

test('GET /v1/health is ok with applied schema', async () => {
  const response = await SELF.fetch('http://x/v1/health')
  expect(response.status).toBe(200)
  const body = (await response.json()) as {
    ok: boolean
    schema: string | null
    commit: string
  }
  expect(body.ok).toBe(true)
  expect(body.schema).toBe('0001_init.sql')
  expect(body.commit).toBe('dev')
})

test('migrations created the projects table', async () => {
  const row = await env.DB.prepare('SELECT count(*) AS n FROM projects').first<{ n: number }>()
  expect(row?.n).toBe(0)
})
