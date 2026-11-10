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

export type OsmLookupResult =
  | { kind: 'ok'; user: OsmUserDetails }
  | { kind: 'not_found'; reason: string }
  | { kind: 'unavailable' }

async function fetchOsmJson(
  env: Env,
  path: string,
): Promise<{ kind: 'ok'; body: unknown } | { kind: 'not_found' } | { kind: 'unavailable' }> {
  let response: Response
  try {
    response = await fetch(`${osmApiBase(env)}${path}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
  } catch {
    return { kind: 'unavailable' }
  }
  if (response.status === 404 || response.status === 410) return { kind: 'not_found' }
  if (response.status !== 200) return { kind: 'unavailable' }
  try {
    return { kind: 'ok', body: await response.json() }
  } catch {
    return { kind: 'unavailable' }
  }
}

/** Public OSM user profile by uid (`/api/0.6/user/{uid}.json`). No token needed. */
export async function lookupOsmUserById(env: Env, osmUid: number): Promise<OsmLookupResult> {
  const result = await fetchOsmJson(env, `/api/0.6/user/${osmUid}.json`)
  if (result.kind === 'not_found') {
    return { kind: 'not_found', reason: `OSM user id ${osmUid} does not exist` }
  }
  if (result.kind !== 'ok') return result
  const body = result.body as { user?: { id?: unknown; display_name?: unknown } }
  const id = Number(body.user?.id)
  const displayName = body.user?.display_name
  if (id !== osmUid || typeof displayName !== 'string') return { kind: 'unavailable' }
  return { kind: 'ok', user: { id, display_name: displayName } }
}

/**
 * Resolves an OSM display name to a uid. The OSM API has no user search, so this reads the
 * user's latest changeset (`/api/0.6/changesets.json?display_name=…`) and then confirms the
 * uid via the user profile. Users without changesets must be added by uid.
 */
export async function lookupOsmUserByDisplayName(
  env: Env,
  displayName: string,
): Promise<OsmLookupResult> {
  const query = new URLSearchParams({ display_name: displayName, limit: '1' })
  const result = await fetchOsmJson(env, `/api/0.6/changesets.json?${query.toString()}`)
  if (result.kind === 'not_found') {
    return { kind: 'not_found', reason: `OSM user '${displayName}' does not exist` }
  }
  if (result.kind !== 'ok') return result
  const changesets = (result.body as { changesets?: { uid?: unknown }[] }).changesets
  const uid = Number(changesets?.[0]?.uid)
  if (!Number.isInteger(uid)) {
    return {
      kind: 'not_found',
      reason: `OSM user '${displayName}' has no changesets, so the uid cannot be looked up. Add the user by osm_uid instead`,
    }
  }
  return lookupOsmUserById(env, uid)
}
