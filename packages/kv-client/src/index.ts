export type KvErrorCode =
  | 'invalid_project_key'
  | 'origin_not_allowed'
  | 'unauthenticated'
  | 'forbidden_user'
  | 'not_found'
  | 'validation_failed'
  | 'payload_too_large'
  | 'version_conflict'
  | 'rate_limited'
  | 'osm_unavailable'
  | 'internal'

export type KvUser = {
  osm_uid: number
  display_name: string
}

export type KvEntry<T> = {
  id: string
  data: T
  tags: string[]
  version: number
  created_at: string
  updated_at: string
  created_by: KvUser
  updated_by: KvUser
}

export type KvListResult<T> = {
  items: Array<KvEntry<T>>
  next_cursor: string | null
}

export type KvClientOptions = {
  baseUrl: string
  project: string
  apiKey: string
  getOsmToken: () => string | null | Promise<string | null>
}

export class KvError extends Error {
  constructor(
    readonly status: number,
    readonly code: KvErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'KvError'
  }
}

export type KvClient<T> = {
  list(params?: {
    tags?: string[]
    match?: 'all' | 'any'
    updatedSince?: string
    limit?: number
    cursor?: string
  }): Promise<KvListResult<T>>
  get(id: string): Promise<KvEntry<T>>
  put(id: string, data: T, tags?: string[], opts?: { ifMatch?: string }): Promise<KvEntry<T>>
  remove(id: string): Promise<void>
  tags(): Promise<{ tags: Array<{ tag: string; count: number }> }>
  me(): Promise<{ user: KvUser; can_write: boolean }>
  forget(): Promise<void>
}

export function createKvClient<T = unknown>(_options: KvClientOptions): KvClient<T> {
  const notImplemented = (): never => {
    throw new Error('not implemented')
  }
  return {
    list: notImplemented,
    get: notImplemented,
    put: notImplemented,
    remove: notImplemented,
    tags: notImplemented,
    me: notImplemented,
    forget: notImplemented,
  }
}
