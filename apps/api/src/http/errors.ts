import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export type ErrorCode =
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

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function jsonError(c: Context, err: ApiError) {
  return c.json(
    {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details === undefined ? {} : { details: err.details }),
      },
    },
    err.status as ContentfulStatusCode,
  )
}
