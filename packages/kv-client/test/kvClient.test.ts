import { afterEach, expect, test, vi } from 'vitest'
import { createKvClient, KvError } from '../src/index'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function jsonResponse(status: number, body: unknown, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders)
  headers.set('Content-Type', 'application/json')
  return new Response(JSON.stringify(body), { status, headers })
}

function emptyResponse(status: number): Response {
  return new Response(null, { status })
}

function readInit(call: unknown): RequestInit {
  const init = (call as [string, RequestInit])[1]
  expect(init).toBeDefined()
  return init
}

function readUrl(call: unknown): string {
  const url = (call as [string, RequestInit])[0]
  expect(typeof url).toBe('string')
  return url
}

function headersOf(init: RequestInit): Headers {
  return new Headers(init.headers)
}

const sampleEntry = {
  id: 'way/1',
  data: { title: 'hello' },
  tags: ['a'],
  version: 1,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  created_by: { osm_uid: 1, display_name: 'alice' },
  updated_by: { osm_uid: 1, display_name: 'alice' },
}

test('sends X-Api-Key on every request and Bearer only when OSM token is present', async () => {
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)

  fetchMock.mockResolvedValueOnce(jsonResponse(200, { items: [], next_cursor: null }))
  const withoutToken = createKvClient({
    baseUrl: 'https://kv.example',
    project: 'demo',
    apiKey: 'key-1',
    getOsmToken: () => null,
  })
  await withoutToken.list()

  const noAuthHeaders = headersOf(readInit(fetchMock.mock.calls[0]))
  expect(noAuthHeaders.get('X-Api-Key')).toBe('key-1')
  expect(noAuthHeaders.has('Authorization')).toBe(false)

  fetchMock.mockResolvedValueOnce(jsonResponse(200, sampleEntry))
  const withToken = createKvClient({
    baseUrl: 'https://kv.example/',
    project: 'demo',
    apiKey: 'key-1',
    getOsmToken: async () => 'osm-token',
  })
  await withToken.get('way/1')

  const authHeaders = headersOf(readInit(fetchMock.mock.calls[1]))
  expect(authHeaders.get('X-Api-Key')).toBe('key-1')
  expect(authHeaders.get('Authorization')).toBe('Bearer osm-token')
})

test('list serializes tags, match, updated_since, limit, and cursor', async () => {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { items: [], next_cursor: null }))
  vi.stubGlobal('fetch', fetchMock)

  const client = createKvClient({
    baseUrl: 'https://kv.example/',
    project: 'demo',
    apiKey: 'key-1',
    getOsmToken: () => null,
  })
  await client.list({
    tags: ['sidewalk', 'kerb'],
    match: 'any',
    updatedSince: '2026-01-01T00:00:00.000Z',
    limit: 50,
    cursor: 'abc+def',
  })

  const url = new URL(readUrl(fetchMock.mock.calls[0]))
  expect(url.origin + url.pathname).toBe('https://kv.example/v1/projects/demo/entries')
  expect(url.searchParams.getAll('tag')).toEqual(['sidewalk', 'kerb'])
  expect(url.searchParams.get('match')).toBe('any')
  expect(url.searchParams.get('updated_since')).toBe('2026-01-01T00:00:00.000Z')
  expect(url.searchParams.get('limit')).toBe('50')
  expect(url.searchParams.get('cursor')).toBe('abc+def')
})

test('throws KvError from the API envelope on 401 unauthenticated', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    jsonResponse(401, {
      error: {
        code: 'unauthenticated',
        message: 'OSM token required',
        details: { reason: 'missing' },
      },
    }),
  )
  vi.stubGlobal('fetch', fetchMock)

  const client = createKvClient({
    baseUrl: 'https://kv.example',
    project: 'demo',
    apiKey: 'key-1',
    getOsmToken: () => null,
  })

  const err = await client.me().catch((e: unknown) => e)
  expect(err).toBeInstanceOf(KvError)
  expect(err).toMatchObject({
    status: 401,
    code: 'unauthenticated',
    message: 'OSM token required',
    details: { reason: 'missing' },
  })
})

test('put sends If-Match and returns the entry for 201 and 200', async () => {
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)

  const client = createKvClient<{ title: string }>({
    baseUrl: 'https://kv.example',
    project: 'demo',
    apiKey: 'key-1',
    getOsmToken: () => 'osm-token',
  })

  fetchMock.mockResolvedValueOnce(jsonResponse(201, sampleEntry))
  const created = await client.put('way/1', { title: 'hello' }, ['a'], { ifMatch: '"1"' })
  expect(created).toEqual(sampleEntry)

  const createdInit = readInit(fetchMock.mock.calls[0])
  expect(createdInit.method).toBe('PUT')
  expect(headersOf(createdInit).get('If-Match')).toBe('"1"')
  expect(headersOf(createdInit).get('Content-Type')).toBe('application/json')
  expect(JSON.parse(createdInit.body as string)).toEqual({ data: { title: 'hello' }, tags: ['a'] })
  expect(readUrl(fetchMock.mock.calls[0])).toBe(
    'https://kv.example/v1/projects/demo/entries/way%2F1',
  )

  fetchMock.mockResolvedValueOnce(jsonResponse(200, { ...sampleEntry, version: 2 }))
  const updated = await client.put('way/1', { title: 'hello' }, ['a'])
  expect(updated.version).toBe(2)
  expect(headersOf(readInit(fetchMock.mock.calls[1])).has('If-Match')).toBe(false)
})

test('forget sends DELETE /me', async () => {
  const fetchMock = vi.fn().mockResolvedValue(emptyResponse(204))
  vi.stubGlobal('fetch', fetchMock)

  const client = createKvClient({
    baseUrl: 'https://kv.example/',
    project: 'demo',
    apiKey: 'key-1',
    getOsmToken: () => 'osm-token',
  })
  await client.forget()

  expect(readUrl(fetchMock.mock.calls[0])).toBe('https://kv.example/v1/projects/demo/me')
  expect(readInit(fetchMock.mock.calls[0]).method).toBe('DELETE')
  expect(headersOf(readInit(fetchMock.mock.calls[0])).get('X-Api-Key')).toBe('key-1')
})

test('remove sends DELETE on the encoded entry id and accepts 204', async () => {
  const fetchMock = vi.fn().mockResolvedValue(emptyResponse(204))
  vi.stubGlobal('fetch', fetchMock)

  const client = createKvClient({
    baseUrl: 'https://kv.example',
    project: 'demo',
    apiKey: 'key-1',
    getOsmToken: () => 'osm-token',
  })
  await client.remove('way/1')

  expect(readUrl(fetchMock.mock.calls[0])).toBe(
    'https://kv.example/v1/projects/demo/entries/way%2F1',
  )
  expect(readInit(fetchMock.mock.calls[0]).method).toBe('DELETE')
})
