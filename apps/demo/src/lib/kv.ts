import { createKvClient } from '@kv/client'
import type { DemoNote } from './demoNote'
import { osmAccessToken } from './osmAuth'

const PLACEHOLDER = 'REPLACE_ME'

export function isKvConfigured(
  apiKey = import.meta.env.VITE_KV_API_KEY,
  baseUrl = import.meta.env.VITE_KV_BASE_URL,
): boolean {
  return (
    Boolean(apiKey) && apiKey !== PLACEHOLDER && Boolean(baseUrl) && !baseUrl.includes('KV_HOST')
  )
}

export const kv = createKvClient<DemoNote>({
  baseUrl: import.meta.env.VITE_KV_BASE_URL,
  project: import.meta.env.VITE_KV_PROJECT,
  apiKey: import.meta.env.VITE_KV_API_KEY,
  getOsmToken: () => osmAccessToken(),
})

export async function fetchHealth(baseUrl = import.meta.env.VITE_KV_BASE_URL): Promise<{
  ok: boolean
  time?: string
  schema?: string | null
  commit?: string
}> {
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/health`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Health check failed (${response.status})`)
  }
  return (await response.json()) as {
    ok: boolean
    time?: string
    schema?: string | null
    commit?: string
  }
}
