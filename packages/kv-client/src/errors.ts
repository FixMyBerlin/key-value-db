import type { KvErrorCode } from './types'

const KV_ERROR_CODES = new Set<KvErrorCode>([
  'invalid_project_key',
  'origin_not_allowed',
  'unauthenticated',
  'forbidden_user',
  'not_found',
  'validation_failed',
  'payload_too_large',
  'version_conflict',
  'rate_limited',
  'osm_unavailable',
  'internal',
])

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

function asKvErrorCode(code: unknown): KvErrorCode {
  if (typeof code === 'string' && KV_ERROR_CODES.has(code as KvErrorCode)) {
    return code as KvErrorCode
  }
  return 'internal'
}

export async function kvErrorFromResponse(response: Response): Promise<KvError> {
  let code: KvErrorCode = 'internal'
  let message = response.statusText || 'Request failed'
  let details: unknown
  try {
    const body: unknown = await response.json()
    if (body !== null && typeof body === 'object' && 'error' in body) {
      const err = (body as { error: unknown }).error
      if (err !== null && typeof err === 'object') {
        const envelope = err as { code?: unknown; message?: unknown; details?: unknown }
        code = asKvErrorCode(envelope.code)
        if (typeof envelope.message === 'string') message = envelope.message
        details = envelope.details
      }
    }
  } catch {
    // Non-JSON error bodies still become a KvError with status.
  }
  return new KvError(response.status, code, message, details)
}
