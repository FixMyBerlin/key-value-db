import { env, SELF } from 'cloudflare:test'
import { expect, test } from 'vitest'
import { adminHeaders } from './helpers'

async function mcp(method: string, params: Record<string, unknown> = {}, id = 1) {
  return SELF.fetch('http://x/mcp', {
    method: 'POST',
    headers: {
      ...Object.fromEntries(adminHeaders()),
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  })
}

async function mcpJson(method: string, params?: Record<string, unknown>) {
  const response = await mcp(method, params)
  expect(response.status).toBe(200)
  const text = await response.text()
  const dataLine = text
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .at(-1)
  if (!dataLine) throw new Error(`MCP response was not JSON/SSE: ${text.slice(0, 200)}`)
  return JSON.parse(dataLine.slice('data: '.length)) as {
    result?: {
      tools?: { name: string }[]
      structuredContent?: { api_key?: string }
      content?: { text?: string }[]
    }
    error?: unknown
  }
}

test('MCP tools/list requires admin auth', async () => {
  const response = await SELF.fetch('http://x/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  })
  expect(response.status).toBe(401)
})

test('MCP tools/list returns admin tools', async () => {
  const payload = await mcpJson('tools/list')
  const names = payload.result?.tools?.map((t) => t.name) ?? []
  expect(names).toContain('list_projects')
  expect(names).toContain('create_project')
  expect(names).toContain('db_status')
  expect(names).toContain('list_allowed_users')
  expect(names).toContain('allow_user')
  expect(names).toContain('disallow_user')
})

test('MCP tools/call create_project', async () => {
  const slug = `mcp-${crypto.randomUUID()}`
  const payload = await mcpJson('tools/call', {
    name: 'create_project',
    arguments: {
      slug,
      name: 'From MCP',
      origins: ['https://mcp.example'],
    },
  })
  const key = payload.result?.structuredContent?.api_key
  const text = payload.result?.content?.[0]?.text ?? ''
  expect(key?.startsWith('kv_') || text.includes('kv_')).toBe(true)
})

test('MCP disallow_user by display name uses the stored name note', async () => {
  const slug = `mcp-${crypto.randomUUID()}`
  await mcpJson('tools/call', {
    name: 'create_project',
    arguments: { slug, name: 'Allowlist', origins: ['https://mcp.example'] },
  })
  const project = (await (
    await SELF.fetch(`http://x/admin/projects/${slug}`, { headers: adminHeaders() })
  ).json()) as { slug: string }
  expect(project.slug).toBe(slug)
  await env.DB.prepare(
    `INSERT INTO project_allowed_users (project_id, osm_uid, display_name, added_at)
     SELECT id, 4711, 'Some-Mapper', '2026-01-01T00:00:00.000Z' FROM projects WHERE slug = ?`,
  )
    .bind(slug)
    .run()

  const listed = await mcpJson('tools/call', { name: 'list_allowed_users', arguments: { slug } })
  expect(listed.result?.content?.[0]?.text).toContain('4711')

  const removed = await mcpJson('tools/call', {
    name: 'disallow_user',
    arguments: { slug, display_name: 'some-mapper' },
  })
  expect(removed.result?.content?.[0]?.text).toContain('"removed": true')
})
