import { kvErrorFromResponse, KvError } from './errors.js'
import type { KvClient, KvClientOptions } from './types.js'
import {
  assertBatch,
  assertDeleted,
  assertEntry,
  assertList,
  assertMe,
  assertTags,
} from './validate.js'

export type {
  KvBatchResult,
  KvClient,
  KvClientOptions,
  KvEntry,
  KvErrorCode,
  KvListResult,
  KvUser,
} from './types.js'
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

async function parseJson<T>(response: Response, check: (v: unknown) => asserts v is T): Promise<T> {
  if (!response.ok) {
    throw await kvErrorFromResponse(response)
  }
  const body: unknown = await response.json()
  check(body)
  return body
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
  const batchUrl = () => projectUrl(baseUrl, project, 'batch')

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
      return parseJson(response, assertList<T>)
    },

    async get(id) {
      const response = await fetch(entryUrl(id), {
        method: 'GET',
        headers: await requestHeaders(apiKey, getOsmToken),
      })
      return parseJson(response, assertEntry<T>)
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
      return parseJson(response, assertEntry<T>)
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
      return parseJson(response, assertTags)
    },

    async batch(ops) {
      const response = await fetch(batchUrl(), {
        method: 'POST',
        headers: await requestHeaders(apiKey, getOsmToken, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ put: ops.put ?? [], delete: ops.delete ?? [] }),
      })
      return parseJson(response, assertBatch<T>)
    },

    async removeMine() {
      const response = await fetch(`${meUrl()}/entries`, {
        method: 'DELETE',
        headers: await requestHeaders(apiKey, getOsmToken),
      })
      return parseJson(response, assertDeleted)
    },

    async me() {
      const response = await fetch(meUrl(), {
        method: 'GET',
        headers: await requestHeaders(apiKey, getOsmToken),
      })
      return parseJson(response, assertMe)
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
