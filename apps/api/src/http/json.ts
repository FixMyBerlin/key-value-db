import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { ApiError } from './errors'

export const MAX_BODY_BYTES = 128 * 1024

export function json(c: Context, data: unknown, status: ContentfulStatusCode = 200) {
  return c.json(data, status, { 'Content-Type': 'application/json; charset=utf-8' })
}

export async function readJsonBody(c: Context): Promise<unknown> {
  const lengthHeader = c.req.header('Content-Length')
  if (lengthHeader !== undefined) {
    const length = Number(lengthHeader)
    if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
      throw new ApiError(413, 'payload_too_large', 'Request body exceeds 128 KiB')
    }
  }

  const buffer = await c.req.raw.arrayBuffer()
  if (buffer.byteLength > MAX_BODY_BYTES) {
    throw new ApiError(413, 'payload_too_large', 'Request body exceeds 128 KiB')
  }
  if (buffer.byteLength === 0) {
    throw new ApiError(422, 'validation_failed', 'JSON body required', { field: '' })
  }

  try {
    return JSON.parse(new TextDecoder().decode(buffer)) as unknown
  } catch {
    throw new ApiError(422, 'validation_failed', 'Invalid JSON', { field: '' })
  }
}
