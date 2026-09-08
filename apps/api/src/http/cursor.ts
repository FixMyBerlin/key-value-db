import { ApiError } from './errors'

export function encodeCursor(updatedAt: string, pk: number): string {
  const bytes = new TextEncoder().encode(`${updatedAt}|${pk}`)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export function decodeCursor(cursor: string): { updatedAt: string; pk: number } {
  try {
    const padded = cursor.replaceAll('-', '+').replaceAll('_', '/')
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
    const binary = atob(padded + pad)
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
    const text = new TextDecoder().decode(bytes)
    const sep = text.lastIndexOf('|')
    if (sep <= 0) throw new Error('bad cursor')
    const updatedAt = text.slice(0, sep)
    const pk = Number(text.slice(sep + 1))
    if (!updatedAt || !Number.isInteger(pk) || pk < 0) throw new Error('bad cursor')
    return { updatedAt, pk }
  } catch {
    throw new ApiError(422, 'validation_failed', 'Invalid cursor', { field: 'cursor' })
  }
}
