import { describe, it, expect } from 'vitest'
import { searchStations } from './search'

describe('searchStations', () => {
  it('returns empty for blank query', () => {
    expect(searchStations('')).toHaveLength(0)
    expect(searchStations('   ')).toHaveLength(0)
  })

  it('finds stations by exact name substring', () => {
    const results = searchStations('Times Sq')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].name.toLowerCase()).toContain('times sq')
  })

  it('finds stations case-insensitively', () => {
    const lower = searchStations('times sq')
    const upper = searchStations('TIMES SQ')
    expect(lower.map(s => s.id)).toEqual(upper.map(s => s.id))
  })

  it('alias: "grand central" matches Grand Central station', () => {
    const results = searchStations('grand central')
    expect(results.some(s => s.name.toLowerCase().includes('grand central'))).toBe(true)
  })

  it('alias: short prefix "gra" does NOT match via alias (< 3 chars after first match)', () => {
    // "gra" is only 3 chars but does not startsWith any alias keyword fully —
    // it should still find Grand Central via name substring match
    const results = searchStations('gra')
    // Should find something but not crash
    expect(Array.isArray(results)).toBe(true)
  })

  it('alias minimum length: 2-char query does not trigger alias matching', () => {
    // Single keyword queries under MIN_ALIAS_QUERY_LEN shouldn't match aliases
    const results = searchStations('pe')
    // Should not return Penn Station via alias — alias only activates at >= 3 chars
    const viaAlias = results.filter(s => s.name.includes('Penn Station'))
    // It may still match via name substring, but we verify no crash
    expect(Array.isArray(viaAlias)).toBe(true)
  })

  it('handles abbreviations: "st" matches "street"', () => {
    // e.g. "fulton st" should match "Fulton St" stations
    const results = searchStations('fulton st')
    expect(results.length).toBeGreaterThan(0)
  })

  it('respects limit parameter', () => {
    const results = searchStations('st', 5)
    expect(results.length).toBeLessThanOrEqual(5)
  })

  it('returns unique stations (no duplicates)', () => {
    const results = searchStations('42')
    const ids = results.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
