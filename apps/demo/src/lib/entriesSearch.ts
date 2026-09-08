import { z } from 'zod'

function asStringArray(value: unknown): string[] {
  if (value === undefined || value === null || value === '') return []
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
  }
  return typeof value === 'string' && value.length > 0 ? [value] : []
}

const entriesSearchInputSchema = z.object({
  tag: z.union([z.string(), z.array(z.string())]).optional(),
  match: z.enum(['all', 'any']).optional(),
  recent: z.union([z.boolean(), z.literal('true'), z.literal('false')]).optional(),
})

export type EntriesSearch = {
  tag?: string[]
  match?: 'all' | 'any'
  recent?: boolean
}

export function parseEntriesSearch(search: unknown): EntriesSearch {
  const parsed = entriesSearchInputSchema.parse(search)
  const tag = asStringArray(parsed.tag)
  return {
    ...(tag.length > 0 ? { tag } : {}),
    ...(parsed.match ? { match: parsed.match } : {}),
    ...(parsed.recent === true || parsed.recent === 'true' ? { recent: true } : {}),
  }
}

export function hourAgoIso(now = Date.now()): string {
  return new Date(now - 60 * 60 * 1000).toISOString()
}
