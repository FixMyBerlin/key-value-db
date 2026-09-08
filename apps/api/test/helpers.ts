import { SELF } from 'cloudflare:test'

export const ADMIN_KEY = '0'.repeat(64)

export function adminHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra)
  headers.set('Authorization', `Bearer ${ADMIN_KEY}`)
  headers.set('Content-Type', 'application/json')
  return headers
}

export async function createTestProject(
  overrides: {
    slug?: string
    name?: string
    origins?: string[]
    read_access?: 'public' | 'osm_user'
    write_access?: 'any_osm_user' | 'allowlist'
  } = {},
) {
  const slug = overrides.slug ?? `p-${crypto.randomUUID()}`
  const response = await SELF.fetch('http://x/admin/projects', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({
      slug,
      name: overrides.name ?? slug,
      origins: overrides.origins ?? [
        'https://app.example',
        'http://localhost:*',
        'http://127.0.0.1:33477',
      ],
      read_access: overrides.read_access,
      write_access: overrides.write_access,
    }),
  })
  const body = (await response.json()) as { api_key: string; slug: string; origins: string[] }
  if (response.status !== 201) {
    throw new Error(`create project failed ${response.status} ${JSON.stringify(body)}`)
  }
  return { ...body, slug }
}

export function projectHeaders(apiKey: string, origin: string, osmToken?: string): Headers {
  const headers = new Headers()
  headers.set('X-Api-Key', apiKey)
  headers.set('Origin', origin)
  headers.set('Content-Type', 'application/json')
  if (osmToken) headers.set('Authorization', `Bearer ${osmToken}`)
  return headers
}

export function stubOsmFetch(handler: (request: Request) => Promise<Response> | Response) {
  const original = globalThis.fetch
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init)
    if (request.url.includes('/api/0.6/user/details.json')) {
      return Promise.resolve(handler(request))
    }
    return original(input, init)
  }
  return () => {
    globalThis.fetch = original
  }
}

export function osmOk(id = 12345, displayName = 'tester') {
  return stubOsmFetch(
    () =>
      new Response(JSON.stringify({ user: { id, display_name: displayName } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  )
}
