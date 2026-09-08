import { authReady, getAuthToken, isLoggedIn, login, logout } from 'osm-api'

export const OSM_AUTH_RETURN_URL_KEY = '__osmAuthReturnUrl'
export const OSM_OAUTH_LAND_FILENAME = 'osm-oauth-land.html'
const PLACEHOLDER = 'REPLACE_ME'

export function getOsmOAuthRedirectUrl(
  origin = globalThis.location?.origin ?? '',
  baseUrl = import.meta.env.BASE_URL,
): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return new URL(OSM_OAUTH_LAND_FILENAME, new URL(base, origin)).href
}

export function isOsmOAuthConfigured(clientId = import.meta.env.VITE_OSM_OAUTH_CLIENT_ID): boolean {
  return Boolean(clientId) && clientId !== PLACEHOLDER
}

export async function waitForOsmAuth(): Promise<boolean> {
  await authReady
  return isLoggedIn()
}

export function rememberOsmReturnUrl(): void {
  const { pathname, search, hash } = globalThis.location
  localStorage.setItem(OSM_AUTH_RETURN_URL_KEY, `${pathname}${search}${hash}`)
}

export function loginWithOsm(): void {
  const clientId = import.meta.env.VITE_OSM_OAUTH_CLIENT_ID
  if (!isOsmOAuthConfigured(clientId)) {
    throw new Error('OSM OAuth client id is not configured')
  }
  rememberOsmReturnUrl()
  void login({
    mode: 'redirect',
    clientId,
    redirectUrl: getOsmOAuthRedirectUrl(),
    scopes: ['read_prefs'],
  })
}

export function osmAccessToken(): string | null {
  return getAuthToken() ?? null
}

export { logout as logoutOsm }
