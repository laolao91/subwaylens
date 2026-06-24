import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { extractTrackMap } from './railroad-track'

const FIXTURES = join(__dirname, '__fixtures__')
const lirrRaw = new Uint8Array(readFileSync(join(FIXTURES, 'lirr.pb')))

describe('extractTrackMap (LIRR fixture)', () => {
  it('finds track assignments keyed by tripId|stopId', () => {
    const tracks = extractTrackMap(lirrRaw)
    expect(tracks.size).toBeGreaterThan(0)
    for (const [key, track] of tracks) {
      expect(key).toMatch(/^.+\|.+$/)
      expect(track.length).toBeGreaterThan(0)
      break
    }
  })

  it('returns empty map on garbage bytes without throwing', () => {
    const tracks = extractTrackMap(new Uint8Array([1, 2, 3, 4, 5]))
    expect(tracks.size).toBe(0)
  })

  it('returns empty map on empty input without throwing', () => {
    const tracks = extractTrackMap(new Uint8Array([]))
    expect(tracks.size).toBe(0)
  })
})
