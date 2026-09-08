import type { Context } from 'hono'

export function originAllowed(origin: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (pattern.endsWith(':*')) {
      const base = pattern.slice(0, -2)
      if (origin === base) return true
      if (origin.startsWith(`${base}:`)) {
        const port = origin.slice(base.length + 1)
        if (/^\d+$/.test(port)) return true
      }
    } else if (origin === pattern) {
      return true
    }
  }
  return false
}

export function setProjectCorsHeaders(c: Context, origin: string) {
  c.header('Access-Control-Allow-Origin', origin)
  c.header('Vary', 'Origin')
  c.header('Access-Control-Allow-Methods', 'GET, PUT, DELETE, POST, OPTIONS')
  c.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Api-Key, If-Match')
  c.header('Access-Control-Expose-Headers', 'ETag')
  c.header('Access-Control-Max-Age', '86400')
}
