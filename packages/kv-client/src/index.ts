import { kvErrorFromResponse, KvError } from './errors'
import type { KvClient, KvClientOptions, KvEntry, KvListResult, KvUser } from './types'

export type { KvClient, KvClientOptions, KvEntry, KvErrorCode, KvListResult, KvUser } from './types'
export { KvError }

function trimTrailingSlashes(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

function projectUrl(baseUrl: string, project: string, ...segments: string[]): string {
  const parts = [
    trimTrailingSlashes(baseUrl),
    'v1',
    'projects',
    encodeURIComponent(project),
    ...segments,
  ]
  return parts.join('/')
}

async function requestHeaders(
  apiKey: string,
  getOsmToken: KvClientOptions['getOsmToken'],
  extra?: HeadersInit,
): Promise<Headers> {
  const headers = new Headers(extra)
  headers.set('X-Api-Key', apiKey)
  const token = await getOsmToken()
  if (token != null) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  return headers
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw await kvErrorFromResponse(response)
  }
  return (await response.json()) as T
}

async function parseEmpty(response: Response): Promise<void> {
  if (!response.ok) {
    throw await kvErrorFromResponse(response)
  }
}

export function createKvClient<T = unknown>(options: KvClientOptions): KvClient<T> {
  const { apiKey, getOsmToken, project } = options
  const baseUrl = options.baseUrl

  const entriesCollection = () => projectUrl(baseUrl, project, 'entries')
  const entryUrl = (id: string) => projectUrl(baseUrl, project, 'entries', encodeURIComponent(id))
  const tagsUrl = () => projectUrl(baseUrl, project, 'tags')
  const meUrl = () => projectUrl(baseUrl, project, 'me')

  return {
    async list(params) {
      const query = new URLSearchParams()
      for (const tag of params?.tags ?? []) {
        query.append('tag', tag)
      }
      if (params?.match !== undefined) {
        query.set('match', params.match)
      }
      if (params?.updatedSince !== undefined) {
        query.set('updated_since', params.updatedSince)
      }
      if (params?.limit !== undefined) {
        query.set('limit', String(params.limit))
      }
      if (params?.cursor !== undefined) {
        query.set('cursor', params.cursor)
      }
      const qs = query.toString()
      const url = qs ? `${entriesCollection()}?${qs}` : entriesCollection()
      const response = await fetch(url, {
        method: 'GET',
        headers: await requestHeaders(apiKey, getOsmToken),
      })
      return parseJson<KvListResult<T>>(response)
    },

    async get(id) {
      const response = await fetch(entryUrl(id), {
        method: 'GET',
        headers: await requestHeaders(apiKey, getOsmToken),
      })
      return parseJson<KvEntry<T>>(response)
    },

    async put(id, data, tags = [], opts) {
      const headers = await requestHeaders(apiKey, getOsmToken, {
        'Content-Type': 'application/json',
      })
      if (opts?.ifMatch !== undefined) {
        headers.set('If-Match', opts.ifMatch)
      }
      const response = await fetch(entryUrl(id), {
        method: 'PUT',
        headers,
        body: JSON.stringify({ data, tags }),
      })
      return parseJson<KvEntry<T>>(response)
    },

    async remove(id) {
      const response = await fetch(entryUrl(id), {
        method: 'DELETE',
        headers: await requestHeaders(apiKey, getOsmToken),
      })
      await parseEmpty(response)
    },

    async tags() {
      const response = await fetch(tagsUrl(), {
        method: 'GET',
        headers: await requestHeaders(apiKey, getOsmToken),
      })
      return parseJson<{ tags: Array<{ tag: string; count: number }> }>(response)
    },

    async me() {
      const response = await fetch(meUrl(), {
        method: 'GET',
        headers: await requestHeaders(apiKey, getOsmToken),
      })
      return parseJson<{ user: KvUser; can_write: boolean }>(response)
    },

    async forget() {
      const response = await fetch(meUrl(), {
        method: 'DELETE',
        headers: await requestHeaders(apiKey, getOsmToken),
      })
      await parseEmpty(response)
    },
  }
}
