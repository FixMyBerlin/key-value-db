import { z } from 'zod'

export const entryIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:/-]+$/, 'id must match [A-Za-z0-9._:/-]{1,128}')

export const tagSchema = z.string().trim().min(1).max(64)

export const tagsSchema = z
  .array(tagSchema)
  .max(32)
  .refine((tags) => new Set(tags).size === tags.length, 'tags must be unique')

const jsonObjectOrArray = z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())])

export const putEntrySchema = z
  .object({
    data: jsonObjectOrArray,
    tags: tagsSchema.default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    const bytes = new TextEncoder().encode(JSON.stringify(value.data)).length
    if (bytes > 65536) {
      ctx.addIssue({
        code: 'custom',
        path: ['data'],
        message: 'data must be at most 65536 bytes when re-encoded',
      })
    }
  })

const batchPutSchema = z
  .object({
    id: entryIdSchema,
    data: jsonObjectOrArray,
    tags: tagsSchema.default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    const bytes = new TextEncoder().encode(JSON.stringify(value.data)).length
    if (bytes > 65536) {
      ctx.addIssue({
        code: 'custom',
        path: ['data'],
        message: 'data must be at most 65536 bytes when re-encoded',
      })
    }
  })

/** Max 25 puts (3 statements each) and 50 deletes per batch; ids must be unique. */
export const batchSchema = z
  .object({
    put: z.array(batchPutSchema).max(25).default([]),
    delete: z.array(entryIdSchema).max(50).default([]),
  })
  .strict()
  .refine(
    (value) => {
      const ids = [...value.put.map((p) => p.id), ...value.delete]
      return new Set(ids).size === ids.length
    },
    { message: 'ids must be unique across put and delete' },
  )

export const listEntriesQuerySchema = z.object({
  match: z.enum(['all', 'any']).default('all'),
  updated_since: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  cursor: z.string().min(1).optional(),
})
