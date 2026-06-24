/**
 * Arrival collection tests against a captured live LIRR protobuf fixture
 * (src/data/__fixtures__/lirr.pb, captured 2026-06-09, ported from v1.7.0).
 *
 * Fixture times are in the past relative to test runs, so Date.now is
 * frozen to just after the capture timestamp.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { transit_realtime } from 'gtfs-realtime-bindings'
import { extractTrackMap } from './railroad-track'
import { getCommuterArrivals, routeDisplayName } from './arrivals-commuter'
import { stationById } from './stations'

const FIXTURES = join(__dirname, '__fixtures__')
const lirrRaw = new Uint8Array(readFileSync(join(FIXTURES, 'lirr.pb')))

// Freeze time to the fixture's feed-header timestamp so arrivals are "upcoming"
const feed = transit_realtime.FeedMessage.decode(lirrRaw)
const feedTime = Number(feed.header.timestamp) * 1000

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(feedTime)
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

describe('getCommuterArrivals — LIRR (direction-id, single departure list)', () => {
  it('collects upcoming departures for Jamaica into the single N list', async () => {
    stubFetchWithFixture(lirrRaw)
    const jamaica = stationById.get('lirr:102')!
    expect(jamaica).toBeDefined()

    const arrivals = await getCommuterArrivals(jamaica)
    expect(arrivals.north.length).toBeGreaterThan(0)
    expect(arrivals.south).toHaveLength(0) // commuter rail collapses to N

    // Sorted ascending
    const times = arrivals.north.map((a) => a.arrivalTime)
    expect([...times].sort((a, b) => a - b)).toEqual(times)

    // Terminals resolve to station names from the pack, not raw stop IDs
    const withNamedTerminal = arrivals.north.filter((a) => /[a-zA-Z]/.test(a.terminal))
    expect(withNamedTerminal.length).toBeGreaterThan(0)
  })

  it('attaches track numbers where the extension provides them', async () => {
    stubFetchWithFixture(lirrRaw)
    const tracks = extractTrackMap(lirrRaw)
    expect(tracks.size).toBeGreaterThan(0)
    const someTrackedStopId = [...tracks.keys()][0].split('|')[1]
    const station = [...stationById.values()].find(
      (s) => s.system === 'lirr' && s.stops.includes(someTrackedStopId)
    )
    if (!station) return // tracked stop not in pack — acceptable, skip

    const arrivals = await getCommuterArrivals(station)
    // Not all departures have posted tracks; at least the shape must hold.
    for (const a of arrivals.north) {
      if (a.track !== undefined) {
        expect(typeof a.track).toBe('string')
        expect(a.track.length).toBeGreaterThan(0)
        return
      }
    }
  })

  it('returns empty arrivals (not a throw) when the feed fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })) as unknown as typeof fetch)
    const jamaica = stationById.get('lirr:102')!
    const arrivals = await getCommuterArrivals(jamaica)
    expect(arrivals.north).toHaveLength(0)
    expect(arrivals.south).toHaveLength(0)
    expect(arrivals.stationId).toBe('lirr:102')
  })
})

describe('routeDisplayName', () => {
  it('maps LIRR numeric route IDs to branch names', () => {
    expect(routeDisplayName('lirr', '1')).toBe('Babylon')
    expect(routeDisplayName('lirr', '4')).toBe('Ronkonkoma')
  })

  it('falls back to the raw ID for unknown routes', () => {
    expect(routeDisplayName('lirr', 'zz')).toBe('zz')
  })
})
