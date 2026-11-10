import { lookupOsmUserByDisplayName, lookupOsmUserById } from '../auth/osmClient'
import { isoNow } from '../env'
import { ApiError } from '../http/errors'
import { zodApiError } from '../http/zod'
import {
  allowedUserInputSchema,
  createProjectSchema,
  deleteProjectSchema,
  slugSchema,
  updateProjectSchema,
} from '../schemas/project'
import { addAllowedUser, listAllowedUsers, removeAllowedUser } from '../store/allowedUsers'
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
    write_scope: project.write_scope,
    entry_ttl_s: project.entry_ttl_s,
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
    write_scope: record.write_scope,
    entry_ttl_s: record.entry_ttl_s,
    disabled: record.disabled,
  })
  if (!parsed.success) throw zodApiError(parsed.error)
  const before = await getProjectBySlug(env.DB, slugParsed.data)
  if (!before) throw new ApiError(404, 'not_found', 'Project not found')
  const project = await updateProject(env.DB, slugParsed.data, parsed.data)
  if (!project) throw new ApiError(404, 'not_found', 'Project not found')
  const warnings: string[] = []
  const stats = await getProjectStats(env.DB, project.id)
  if (before.write_scope !== 'owner' && project.write_scope === 'owner' && stats.entries > 0) {
    warnings.push(
      `write_scope is now 'owner' but the project has ${stats.entries} entries. Entries whose id does not start with '<osm_uid>/' can no longer be changed or deleted through the API.`,
    )
  }
  if (before.write_access !== 'allowlist' && project.write_access === 'allowlist') {
    const allowed = await listAllowedUsers(env.DB, project.id)
    if (allowed.length === 0) {
      warnings.push(
        "write_access is now 'allowlist' but no user is allowed yet, so nobody can write. Add users with allow_user.",
      )
    }
  }
  if (before.entry_ttl_s !== project.entry_ttl_s) {
    warnings.push(
      'entry_ttl_s applies to new entries only. Existing entries keep their expires_at (or never expire).',
    )
  }
  return publicProject(project, warnings.length > 0 ? { warnings } : undefined)
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

async function requireProject(env: Env, slug: unknown): Promise<Project> {
  const parsed = slugSchema.safeParse(slug)
  if (!parsed.success) throw zodApiError(parsed.error)
  const project = await getProjectBySlug(env.DB, parsed.data)
  if (!project) throw new ApiError(404, 'not_found', 'Project not found')
  return project
}

function allowlistNote(project: Project) {
  return project.write_access === 'allowlist'
    ? undefined
    : `write_access is '${project.write_access}', so this list is not enforced. Set write_access = 'allowlist' to enforce it.`
}

async function allowedUsersResult(env: Env, project: Project, extra?: Record<string, unknown>) {
  const note = allowlistNote(project)
  return {
    slug: project.slug,
    write_access: project.write_access,
    allowed_users: await listAllowedUsers(env.DB, project.id),
    ...extra,
    ...(note ? { note } : {}),
  }
}

function parseAllowedUserInput(record: Record<string, unknown>) {
  const parsed = allowedUserInputSchema.safeParse({
    osm_uid: record.osm_uid,
    display_name: record.display_name,
  })
  if (!parsed.success) throw zodApiError(parsed.error)
  return parsed.data
}

/** Looks the user up on OSM so the uid and the current display name are both confirmed. */
async function resolveOsmUser(env: Env, input: { osm_uid?: number; display_name?: string }) {
  const result =
    input.osm_uid === undefined
      ? await lookupOsmUserByDisplayName(env, input.display_name ?? '')
      : await lookupOsmUserById(env, input.osm_uid)
  if (result.kind === 'not_found') {
    throw new ApiError(404, 'not_found', result.reason)
  }
  if (result.kind === 'unavailable') {
    throw new ApiError(502, 'osm_unavailable', 'OSM user lookup is unavailable, try again later')
  }
  return { osm_uid: result.user.id, display_name: result.user.display_name }
}

export async function toolListAllowedUsers(env: Env, input: unknown) {
  const record = typeof input === 'object' && input ? (input as Record<string, unknown>) : {}
  const project = await requireProject(env, record.slug)
  return allowedUsersResult(env, project)
}

export async function toolAllowUser(env: Env, input: unknown) {
  const record = typeof input === 'object' && input ? (input as Record<string, unknown>) : {}
  const project = await requireProject(env, record.slug)
  const user = await resolveOsmUser(env, parseAllowedUserInput(record))
  const added = await addAllowedUser(env.DB, project.id, user, isoNow())
  return allowedUsersResult(env, project, { user, added })
}

export async function toolDisallowUser(env: Env, input: unknown) {
  const record = typeof input === 'object' && input ? (input as Record<string, unknown>) : {}
  const project = await requireProject(env, record.slug)
  const userInput = parseAllowedUserInput(record)
  // Match the stored name note first, so removing works without OSM and after a rename.
  const allowed = await listAllowedUsers(env.DB, project.id)
  const match =
    userInput.osm_uid === undefined
      ? allowed.find((u) => u.display_name.toLowerCase() === userInput.display_name?.toLowerCase())
      : allowed.find((u) => u.osm_uid === userInput.osm_uid)
  const osmUid = match?.osm_uid ?? (await resolveOsmUser(env, userInput)).osm_uid
  const removed = await removeAllowedUser(env.DB, project.id, osmUid)
  if (!removed) throw new ApiError(404, 'not_found', 'User is not on the allowlist')
  return allowedUsersResult(env, project, {
    user: { osm_uid: osmUid, display_name: match?.display_name ?? null },
    removed,
  })
}
