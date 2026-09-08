import { McpServer } from '@modelcontextprotocol/server'
import { createMcpHandler } from 'agents/mcp/server'
import { z } from 'zod'
import {
  toolCreateProject,
  toolDbStatus,
  toolDeleteProject,
  toolGetProject,
  toolListProjects,
  toolRotateProjectKey,
  toolUpdateProject,
} from '../admin/tools'
import { BUILD_SHA } from '../build-info'
import { ApiError } from '../http/errors'
import { originSchema, readAccessSchema, slugSchema, writeAccessSchema } from '../schemas/project'

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
        write_access: writeAccessSchema.optional(),
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
      description: 'Update project settings',
      inputSchema: z.object({
        slug: slugSchema,
        name: z.string().min(1).optional(),
        origins: z.array(originSchema).min(1).optional(),
        read_access: readAccessSchema.optional(),
        write_access: writeAccessSchema.optional(),
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
