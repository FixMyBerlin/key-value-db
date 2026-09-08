import { SELF } from 'cloudflare:test'
import { expect, test } from 'vitest'
import { createTestProject, projectHeaders } from './helpers'

test('missing Origin is 403 origin_not_allowed', async () => {
  const project = await createTestProject()
  const response = await SELF.fetch(`http://x/v1/projects/${project.slug}/entries`, {
    headers: { 'X-Api-Key': project.api_key },
  })
  expect(response.status).toBe(403)
  expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
  const body = (await response.json()) as { error: { code: string } }
  expect(body.error.code).toBe('origin_not_allowed')
})

test('wrong API key is 401 after origin match', async () => {
  const project = await createTestProject()
  const response = await SELF.fetch(`http://x/v1/projects/${project.slug}/entries`, {
    headers: projectHeaders('kv_deadbeef', 'https://app.example'),
  })
  expect(response.status).toBe(401)
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example')
  const body = (await response.json()) as { error: { code: string } }
  expect(body.error.code).toBe('invalid_project_key')
})

test('localhost:* allows any port', async () => {
  const project = await createTestProject()
  const response = await SELF.fetch(`http://x/v1/projects/${project.slug}/entries`, {
    headers: projectHeaders(project.api_key, 'http://localhost:5173'),
  })
  expect(response.status).toBe(200)
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173')
})

test('127.0.0.1:33477 exact origin matches', async () => {
  const project = await createTestProject()
  const response = await SELF.fetch(`http://x/v1/projects/${project.slug}/entries`, {
    headers: projectHeaders(project.api_key, 'http://127.0.0.1:33477'),
  })
  expect(response.status).toBe(200)
})

test('CORS preflight succeeds on allowed origin', async () => {
  const project = await createTestProject()
  const response = await SELF.fetch(`http://x/v1/projects/${project.slug}/entries`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://app.example',
      'Access-Control-Request-Method': 'PUT',
      'Access-Control-Request-Headers': 'authorization,content-type,x-api-key,if-match',
    },
  })
  expect(response.status).toBe(204)
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example')
  expect(response.headers.get('Access-Control-Allow-Methods')).toContain('PUT')
  expect(response.headers.get('Access-Control-Allow-Headers')).toContain('X-Api-Key')
  expect(response.headers.get('Access-Control-Expose-Headers')).toBe('ETag')
  expect(response.headers.get('Vary')).toBe('Origin')
})

test('CORS preflight fails without CORS headers on mismatch', async () => {
  const project = await createTestProject()
  const response = await SELF.fetch(`http://x/v1/projects/${project.slug}/entries`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://evil.example' },
  })
  expect(response.status).toBe(403)
  expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
})
