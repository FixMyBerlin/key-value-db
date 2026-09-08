import type { ZodError } from 'zod'
import { ApiError } from './errors'

export function zodApiError(error: ZodError): ApiError {
  const issue = error.issues[0]
  const field = issue?.path.map(String).join('.') ?? ''
  return new ApiError(422, 'validation_failed', issue?.message ?? 'Invalid input', { field })
}
