import { z } from 'zod'

export type DemoNote = { title: string; note?: string }

export const demoNoteSchema = z.object({
  title: z.string().min(1),
  note: z.string().optional(),
})

export function parseDemoNoteJson(raw: string): DemoNote {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('JSON is not valid')
  }
  return demoNoteSchema.parse(parsed)
}

export function parseTagList(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
}
