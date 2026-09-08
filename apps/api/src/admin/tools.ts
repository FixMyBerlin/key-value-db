import { ApiError } from '../http/errors'
import { zodApiError } from '../http/zod'
import {
  createProjectSchema,
  deleteProjectSchema,
  slugSchema,
  updateProjectSchema,
} from '../schemas/project'
import { dbStatus } from '../store/dbStatus'
import {
  createProject,
  deleteProject,
  getProjectBySlug,
  getProjectStats,
  listProjects,
  rotateProjectKey,
  updateProject,
  type Project,
} from '../store/projects'

function publicProject(project: Project, extra?: Record<string, unknown>) {
  return {
    slug: project.slug,
    name: project.name,
    api_key: project.api_key,
    origins: project.origins,
    read_access: project.read_access,
    write_access: project.write_access,
    created_at: project.created_at,
    updated_at: project.updated_at,
    disabled_at: project.disabled_at,
    ...extra,
  }
}

export async function toolListProjects(env: Env) {
  const projects = await listProjects(env.DB)
  return { projects: projects.map((p) => publicProject(p, { entry_count: p.entry_count })) }
}

export async function toolCreateProject(env: Env, input: unknown) {
  const parsed = createProjectSchema.safeParse(input)
  if (!parsed.success) throw zodApiError(parsed.error)
  try {
    const project = await createProject(env.DB, parsed.data)
    return publicProject(project)
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    if (message.includes('UNIQUE')) {
      throw new ApiError(422, 'validation_failed', 'slug already exists', { field: 'slug' })
    }
    throw err
  }
}

export async function toolGetProject(env: Env, input: unknown) {
  const parsed = slugSchema.safeParse(
    typeof input === 'object' && input && 'slug' in input
      ? (input as { slug: unknown }).slug
      : input,
  )
  if (!parsed.success) throw zodApiError(parsed.error)
  const project = await getProjectBySlug(env.DB, parsed.data)
  if (!project) throw new ApiError(404, 'not_found', 'Project not found')
  const stats = await getProjectStats(env.DB, project.id)
  return publicProject(project, { stats })
}

export async function toolUpdateProject(env: Env, input: unknown) {
  const record = typeof input === 'object' && input ? (input as Record<string, unknown>) : {}
  const slugParsed = slugSchema.safeParse(record.slug)
  if (!slugParsed.success) throw zodApiError(slugParsed.error)
  const parsed = updateProjectSchema.safeParse({
    name: record.name,
    origins: record.origins,
    read_access: record.read_access,
    write_access: record.write_access,
    disabled: record.disabled,
  })
  if (!parsed.success) throw zodApiError(parsed.error)
  const project = await updateProject(env.DB, slugParsed.data, parsed.data)
  if (!project) throw new ApiError(404, 'not_found', 'Project not found')
  return publicProject(project)
}

export async function toolRotateProjectKey(env: Env, input: unknown) {
  const parsed = slugSchema.safeParse(
    typeof input === 'object' && input && 'slug' in input
      ? (input as { slug: unknown }).slug
      : input,
  )
  if (!parsed.success) throw zodApiError(parsed.error)
  const project = await rotateProjectKey(env.DB, parsed.data)
  if (!project) throw new ApiError(404, 'not_found', 'Project not found')
  return publicProject(project)
}

export async function toolDeleteProject(env: Env, input: unknown) {
  const record = typeof input === 'object' && input ? (input as Record<string, unknown>) : {}
  const parsed = deleteProjectSchema.safeParse({ confirm_slug: record.confirm_slug })
  if (!parsed.success) throw zodApiError(parsed.error)
  const slugParsed = slugSchema.safeParse(record.slug)
  if (!slugParsed.success) throw zodApiError(slugParsed.error)
  if (parsed.data.confirm_slug !== slugParsed.data) {
    throw new ApiError(422, 'validation_failed', 'confirm_slug must match slug', {
      field: 'confirm_slug',
    })
  }
  const deleted = await deleteProject(env.DB, slugParsed.data)
  if (!deleted) throw new ApiError(404, 'not_found', 'Project not found')
  return { deleted: true, slug: slugParsed.data }
}

export async function toolDbStatus(env: Env) {
  return dbStatus(env.DB)
}
