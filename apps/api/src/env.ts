export function osmApiBase(env: Env): string {
  return env.OSM_API_BASE.replace(/\/$/, '')
}

export function osmVerifyTtlS(env: Env): number {
  const n = Number(env.OSM_VERIFY_TTL_S)
  return Number.isFinite(n) && n > 0 ? n : 3600
}

export function isoNow(): string {
  return new Date().toISOString()
}
