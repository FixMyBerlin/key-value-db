import { describe, expect, it } from 'vitest'
import { getOsmOAuthRedirectUrl, isOsmOAuthConfigured } from './osmAuth'

describe('getOsmOAuthRedirectUrl', () => {
  it('builds the land page under the Vite base', () => {
    expect(getOsmOAuthRedirectUrl('http://127.0.0.1:33477', '/')).toBe(
      'http://127.0.0.1:33477/osm-oauth-land.html',
    )
    expect(getOsmOAuthRedirectUrl('http://127.0.0.1:33477', '/key-value-db/')).toBe(
      'http://127.0.0.1:33477/key-value-db/osm-oauth-land.html',
    )
    expect(getOsmOAuthRedirectUrl('https://fixmyberlin.github.io', '/key-value-db')).toBe(
      'https://fixmyberlin.github.io/key-value-db/osm-oauth-land.html',
    )
  })
})

describe('isOsmOAuthConfigured', () => {
  it('rejects empty and REPLACE_ME client ids', () => {
    expect(isOsmOAuthConfigured('')).toBe(false)
    expect(isOsmOAuthConfigured('REPLACE_ME')).toBe(false)
    expect(isOsmOAuthConfigured('abc123')).toBe(true)
  })
})
