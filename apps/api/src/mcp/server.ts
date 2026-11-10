import { McpServer } from '@modelcontextprotocol/server'
import { createMcpHandler } from 'agents/mcp/server'
import { z } from 'zod'
import {
  toolAllowUser,
  toolCreateProject,
  toolDbStatus,
  toolDeleteProject,
  toolDisallowUser,
  toolGetProject,
  toolListAllowedUsers,
  toolListProjects,
  toolRotateProjectKey,
  toolUpdateProject,
} from '../admin/tools'
import { BUILD_SHA } from '../build-info'
import { ApiError } from '../http/errors'
import {
  entryTtlSchema,
  osmUidSchema,
  originSchema,
  readAccessSchema,
  slugSchema,
  writeAccessSchema,
  writeScopeSchema,
} from '../schemas/project'

function asToolResult(result: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    structuredContent: result as Record<string, unknown>,
  }
}

function asToolError(err: unknown) {
  const text = err instanceof ApiError ? `${err.code}: ${err.message}` : 'Internal error'
  if (!(err instanceof ApiError)) console.error(err)
  return { isError: true as const, content: [{ type: 'text' as const, text }] }
}

async function runTool(fn: () => Promise<unknown>) {
  try {
    return asToolResult(await fn())
  } catch (err) {
    return asToolError(err)
  }
}

export function createKvAdminServer(env: Env) {
  const server = new McpServer({ name: 'kv-admin', version: BUILD_SHA })

  server.registerTool(
    'list_projects',
    { description: 'List all projects', inputSchema: z.object({}) },
    async () => runTool(() => toolListProjects(env)),
  )

  server.registerTool(
    'create_project',
    {
      description: 'Create a project and return its api_key',
      inputSchema: z.object({
        slug: slugSchema,
        name: z.string().min(1),
        origins: z.array(originSchema).min(1),
        read_access: readAccessSchema.optional(),
        write_access: writeAccessSchema
          .optional()
          .describe(
            "'allowlist': only users added with allow_user may write (create, update, delete, batch)",
          ),
        write_scope: writeScopeSchema
          .optional()
          .describe(
            "'owner': entry ids must start with '<osm_uid>/'; only the creator may change or delete",
          ),
        entry_ttl_s: entryTtlSchema
          .optional()
          .describe('Hard TTL in seconds for new entries; null = never expire'),
      }),
    },
    async (input) => runTool(() => toolCreateProject(env, input)),
  )

  server.registerTool(
    'get_project',
    {
      description: 'Get a project including api_key and stats',
      inputSchema: z.object({ slug: slugSchema }),
    },
    async (input) => runTool(() => toolGetProject(env, input)),
  )

  server.registerTool(
    'update_project',
    {
      description:
        'Update project settings. The result lists warnings when a change affects existing entries',
      inputSchema: z.object({
        slug: slugSchema,
        name: z.string().min(1).optional(),
        origins: z.array(originSchema).min(1).optional(),
        read_access: readAccessSchema.optional(),
        write_access: writeAccessSchema
          .optional()
          .describe(
            "'allowlist': only users added with allow_user may write (create, update, delete, batch)",
          ),
        write_scope: writeScopeSchema
          .optional()
          .describe(
            "'owner': entry ids must start with '<osm_uid>/'; only the creator may change or delete",
          ),
        entry_ttl_s: entryTtlSchema
          .optional()
          .describe(
            'Hard TTL in seconds for new entries; null = never expire. Applies to new entries only',
          ),
        disabled: z.boolean().optional(),
      }),
    },
    async (input) => runTool(() => toolUpdateProject(env, input)),
  )

  server.registerTool(
    'rotate_project_key',
    {
      description: 'Rotate a project api_key',
      inputSchema: z.object({ slug: slugSchema }),
    },
    async (input) => runTool(() => toolRotateProjectKey(env, input)),
  )

  server.registerTool(
    'delete_project',
    {
      description: 'Delete a project; confirm_slug must equal slug',
      inputSchema: z.object({ slug: slugSchema, confirm_slug: z.string() }),
    },
    async (input) => runTool(() => toolDeleteProject(env, input)),
  )

  const userInputShape = {
    slug: slugSchema,
    osm_uid: osmUidSchema.optional().describe('OSM user id (stable). Give this or display_name'),
    display_name: z
      .string()
      .min(1)
      .optional()
      .describe('Current OSM display name, resolved to the uid via the OSM API'),
  }

  server.registerTool(
    'list_allowed_users',
    {
      description:
        "List the OSM users allowed to write to a project. Only enforced when write_access = 'allowlist'",
      inputSchema: z.object({ slug: slugSchema }),
    },
    async (input) => runTool(() => toolListAllowedUsers(env, input)),
  )

  server.registerTool(
    'allow_user',
    {
      description:
        'Allow an OSM user to write to a project (by osm_uid or display_name). Looks the user up on OSM and returns both uid and display name. The check uses the uid only',
      inputSchema: z.object(userInputShape),
    },
    async (input) => runTool(() => toolAllowUser(env, input)),
  )

  server.registerTool(
    'disallow_user',
    {
      description:
        "Remove an OSM user from a project's allowed users (by osm_uid or display_name). Their entries stay",
      inputSchema: z.object(userInputShape),
    },
    async (input) => runTool(() => toolDisallowUser(env, input)),
  )

  server.registerTool(
    'db_status',
    { description: 'Applied D1 migrations and table row counts', inputSchema: z.object({}) },
    async () => runTool(() => toolDbStatus(env)),
  )

  return server
}

export function mcpFetch(request: Request, env: Env, ctx: ExecutionContext) {
  const handler = createMcpHandler(() => createKvAdminServer(env))
  return handler(request, env, ctx as never)
}
