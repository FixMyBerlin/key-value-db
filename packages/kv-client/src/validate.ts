import { KvError } from './errors.js'
import type { KvBatchResult, KvEntry, KvListResult, KvUser } from './types.js'

// Small hand-written checks for the response envelopes, so the client stays
// dependency-free. `data` is not checked: each app validates its own payload.

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

function invalid(what: string): KvError {
  return new KvError(200, 'internal', `Unexpected response from the KV API: ${what}`)
}

function assertUser(v: unknown, what: string): asserts v is KvUser {
  if (!isObject(v) || typeof v.osm_uid !== 'number' || typeof v.display_name !== 'string') {
    throw invalid(what)
  }
}

export function assertEntry<T>(v: unknown): asserts v is KvEntry<T> {
  if (
    !isObject(v) ||
    typeof v.id !== 'string' ||
    !('data' in v) ||
    !Array.isArray(v.tags) ||
    !v.tags.every((t) => typeof t === 'string') ||
    typeof v.version !== 'number' ||
    typeof v.created_at !== 'string' ||
    typeof v.updated_at !== 'string' ||
    (v.expires_at !== undefined && v.expires_at !== null && typeof v.expires_at !== 'string')
  ) {
    throw invalid('entry')
  }
  assertUser(v.created_by, 'entry.created_by')
  assertUser(v.updated_by, 'entry.updated_by')
}

export function assertList<T>(v: unknown): asserts v is KvListResult<T> {
  if (!isObject(v) || !Array.isArray(v.items)) throw invalid('list')
  if (v.next_cursor !== null && typeof v.next_cursor !== 'string') throw invalid('list.next_cursor')
  for (const item of v.items) assertEntry(item)
}

export function assertBatch<T>(v: unknown): asserts v is KvBatchResult<T> {
  if (!isObject(v) || !Array.isArray(v.put) || typeof v.deleted !== 'number') throw invalid('batch')
  for (const item of v.put) assertEntry(item)
}

export function assertTags(
  v: unknown,
): asserts v is { tags: Array<{ tag: string; count: number }> } {
  if (
    !isObject(v) ||
    !Array.isArray(v.tags) ||
    !v.tags.every((t) => isObject(t) && typeof t.tag === 'string' && typeof t.count === 'number')
  ) {
    throw invalid('tags')
  }
}

export function assertMe(v: unknown): asserts v is { user: KvUser; can_write: boolean } {
  if (!isObject(v) || typeof v.can_write !== 'boolean') throw invalid('me')
  assertUser(v.user, 'me.user')
}

export function assertDeleted(v: unknown): asserts v is { deleted: number } {
  if (!isObject(v) || typeof v.deleted !== 'number') throw invalid('deleted')
}
