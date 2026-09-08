import { z } from 'zod'

export const slugSchema = z
  .string()
  .regex(/^[a-z0-9-]{3,64}$/, 'slug must be 3-64 chars of [a-z0-9-]')

export const originSchema = z
  .string()
  .regex(/^https?:\/\/[a-z0-9.-]+(:(\d+|\*))?$/, 'origin must be scheme://host[:port|*]')

export const readAccessSchema = z.enum(['public', 'osm_user'])
export const writeAccessSchema = z.enum(['any_osm_user', 'allowlist'])

export const createProjectSchema = z
  .object({
    slug: slugSchema,
    name: z.string().trim().min(1).max(200),
    origins: z.array(originSchema).min(1),
    read_access: readAccessSchema.optional(),
    write_access: writeAccessSchema.optional(),
  })
  .strict()

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    origins: z.array(originSchema).min(1).optional(),
    read_access: readAccessSchema.optional(),
    write_access: writeAccessSchema.optional(),
    disabled: z.boolean().optional(),
  })
  .strict()

export const deleteProjectSchema = z
  .object({
    confirm_slug: z.string().min(1),
  })
  .strict()
