import { osmApiBase } from '../env'

export type OsmUserDetails = { id: number; display_name: string }

export type OsmFetchResult =
  | { kind: 'ok'; user: OsmUserDetails }
  | { kind: 'unauthorized' }
  | { kind: 'unavailable' }

export async function fetchOsmUserDetails(
  env: Env,
  authorization: string,
): Promise<OsmFetchResult> {
  let response: Response
  try {
    response = await fetch(`${osmApiBase(env)}/api/0.6/user/details.json`, {
      headers: { Authorization: authorization },
      signal: AbortSignal.timeout(8000),
    })
  } catch {
    return { kind: 'unavailable' }
  }

  if (response.status === 401 || response.status === 403) return { kind: 'unauthorized' }
  if (response.status === 429 || response.status >= 500) return { kind: 'unavailable' }
  if (response.status !== 200) return { kind: 'unavailable' }

  try {
    const body = (await response.json()) as { user?: { id?: unknown; display_name?: unknown } }
    const id = Number(body.user?.id)
    const displayName = body.user?.display_name
    if (!Number.isInteger(id) || typeof displayName !== 'string') return { kind: 'unavailable' }
    return { kind: 'ok', user: { id, display_name: displayName } }
  } catch {
    return { kind: 'unavailable' }
  }
}
