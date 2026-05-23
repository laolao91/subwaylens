import { describe, it, expect } from 'vitest'
import { formatArrival, minutesUntil, isArrivingSoon } from './time'

const NOW = 1700000000 // fixed epoch for deterministic tests

describe('formatArrival', () => {
  it('returns NOW for trains arriving in < 30 seconds (rounds to 0 min)', () => {
    expect(formatArrival(NOW + 29, NOW)).toMatch(/^NOW /)
    expect(formatArrival(NOW, NOW)).toMatch(/^NOW /)
  })

  it('returns Nm - H:MM for trains arriving in >= 1 minute', () => {
    const result = formatArrival(NOW + 180, NOW) // 3 min away
    expect(result).toMatch(/^3m - \d{1,2}:\d{2}$/)
  })

  it('rounds minutes correctly', () => {
    expect(formatArrival(NOW + 90, NOW)).toMatch(/^2m - /)  // 90s → 2m
    expect(formatArrival(NOW + 60, NOW)).toMatch(/^1m - /)
  })

  it('handles near-midnight correctly (no negative minutes)', () => {
    const past = NOW - 60
    expect(formatArrival(past, NOW)).toMatch(/^NOW /)
  })

  it('formats double-digit minutes', () => {
    const result = formatArrival(NOW + 600, NOW) // 10 min
    expect(result).toMatch(/^10m - /)
  })

  it('uses 12-hour clock with no leading zero on hour', () => {
    // arrivalTime at a known hour — we test format shape, not exact value
    const result = formatArrival(NOW + 120, NOW)
    expect(result).toMatch(/\d{1,2}:\d{2}$/)
  })
})

describe('minutesUntil', () => {
  it('returns 0 for past arrivals', () => {
    expect(minutesUntil(NOW - 300, NOW)).toBe(0)
  })

  it('rounds to nearest minute', () => {
    expect(minutesUntil(NOW + 90, NOW)).toBe(2)
    expect(minutesUntil(NOW + 150, NOW)).toBe(3)
  })
})

describe('isArrivingSoon', () => {
  it('returns true when < 4 minutes away', () => {
    expect(isArrivingSoon(NOW + 180, NOW)).toBe(true)  // 3m
    expect(isArrivingSoon(NOW + 0, NOW)).toBe(true)    // NOW
  })

  it('returns false when >= 4 minutes away', () => {
    expect(isArrivingSoon(NOW + 240, NOW)).toBe(false) // 4m
    expect(isArrivingSoon(NOW + 600, NOW)).toBe(false) // 10m
  })
})
