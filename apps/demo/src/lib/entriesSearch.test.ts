import { describe, expect, it } from 'vitest'
import { hourAgoIso, parseEntriesSearch } from './entriesSearch'

describe('parseEntriesSearch', () => {
  it('omits empty defaults so Links do not need search', () => {
    expect(parseEntriesSearch({})).toEqual({})
    expect(parseEntriesSearch({ tag: 'a', match: 'any' })).toEqual({
      tag: ['a'],
      match: 'any',
    })
    expect(parseEntriesSearch({ tag: ['a', 'b'], recent: true })).toEqual({
      tag: ['a', 'b'],
      recent: true,
    })
  })
})

describe('hourAgoIso', () => {
  it('is one hour before the given instant', () => {
    expect(hourAgoIso(Date.parse('2026-09-08T12:00:00.000Z'))).toBe('2026-09-08T11:00:00.000Z')
  })
})
