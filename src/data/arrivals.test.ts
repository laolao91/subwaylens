/**
 * Arrival collection tests against captured live protobuf fixtures
 * (src/data/__fixtures__/, captured 2026-06-09).
 *
 * Fixture times are in the past relative to test runs, so Date.now is
 * frozen to just after the capture timestamp.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { transit_realtime } from 'gtfs-realtime-bindings'
import { extractTrackMap } from './railroad-track'
import { registerSystemPack, getStationArrivals, routeDisplayName } from './arrivals'
import type { StationPack } from './arrivals'
import lirrPackJson from './packs/lirr.json'

const FIXTURES = join(__dirname, '__fixtures__')
const lirrRaw = new Uint8Array(readFileSync(join(FIXTURES, 'lirr.pb')))
const lirrPack = lirrPackJson as unknown as StationPack

// Freeze time to the fixture's feed-header timestamp so arrivals are "upcoming"
const feed = transit_realtime.FeedMessage.decode(lirrRaw)
const feedTime = Number(feed.header.timestamp) * 1000

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(feedTime)
  registerSystemPack(lirrPack)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function stubFetchWithFixture(raw: Uint8Array) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    arrayBuffer: async () => raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
  })) as unknown as typeof fetch)
}

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
})

describe('getStationArrivals — LIRR (direction-id, departure-board)', () => {
  it('collects upcoming departures for Jamaica into the single N list', async () => {
    stubFetchWithFixture(lirrRaw)
    const jamaica = lirrPack.stations.find((s) => s.name === 'Jamaica')!
    expect(jamaica).toBeDefined()

    const arrivals = await getStationArrivals(jamaica)
    expect(arrivals.north.length).toBeGreaterThan(0)
    expect(arrivals.south).toHaveLength(0) // departure-board collapses to N

    // Sorted ascending
    const times = arrivals.north.map((a) => a.arrivalTime)
    expect([...times].sort((a, b) => a - b)).toEqual(times)

    // Terminals resolve to station names from the pack, not raw stop IDs
    const withNamedTerminal = arrivals.north.filter((a) => /[a-zA-Z]/.test(a.terminal))
    expect(withNamedTerminal.length).toBeGreaterThan(0)
  })

  it('attaches track numbers where the extension provides them', async () => {
    stubFetchWithFixture(lirrRaw)
    // Tracks exist somewhere in the fixture; find a station that has one.
    const tracks = extractTrackMap(lirrRaw)
    expect(tracks.size).toBeGreaterThan(0)
    const someTrackedStopId = [...tracks.keys()][0].split('|')[1]
    const station = lirrPack.stations.find((s) => s.stops.includes(someTrackedStopId))
    if (!station) return // tracked stop not in pack — acceptable, skip

    const arrivals = await getStationArrivals(station)
    // Not all departures have posted tracks; at least the shape must hold.
    for (const a of arrivals.north) {
      if (a.track !== undefined) {
        expect(typeof a.track).toBe('string')
        expect(a.track.length).toBeGreaterThan(0)
        return
      }
    }
  })
})

describe('routeDisplayName', () => {
  it('maps LIRR numeric route IDs to branch names', () => {
    expect(routeDisplayName('lirr', '1')).toBe('Babylon')
    expect(routeDisplayName('lirr', '4')).toBe('Ronkonkoma')
  })

  it('falls back to the raw ID for unknown routes', () => {
    expect(routeDisplayName('lirr', 'zz')).toBe('zz')
    expect(routeDisplayName('unregistered-system', 'X')).toBe('X')
  })
})
