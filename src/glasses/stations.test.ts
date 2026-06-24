import { describe, it, expect, vi, afterEach } from 'vitest'
import { dispatchGetArrivals } from './stations'
import { stationById } from '../data/stations'

describe('dispatchGetArrivals — routes by station.system', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubEmptyFeed() {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
    })) as unknown as typeof fetch)
  }

  it('routes a subway station (no system field) through the stop-suffix path', async () => {
    stubEmptyFeed()
    const station = stationById.get('119')!
    expect(station.system).toBeUndefined()

    const arrivals = await dispatchGetArrivals(station)
    expect(arrivals.stationId).toBe('119')
    expect(arrivals.north).toEqual([])
    expect(arrivals.south).toEqual([])
  })

  it('routes a LIRR station through the commuter direction-id path', async () => {
    stubEmptyFeed()
    const station = stationById.get('lirr:237')!
    expect(station.system).toBe('lirr')

    const arrivals = await dispatchGetArrivals(station)
    expect(arrivals.stationId).toBe('lirr:237')
    expect(arrivals.north).toEqual([])
    expect(arrivals.south).toEqual([]) // commuter path always leaves south empty
  })

  it('routes an MNR station through the commuter direction-id path', async () => {
    stubEmptyFeed()
    const station = stationById.get('mnr:1')!
    expect(station.system).toBe('mnr')

    const arrivals = await dispatchGetArrivals(station)
    expect(arrivals.stationId).toBe('mnr:1')
    expect(arrivals.north).toEqual([])
    expect(arrivals.south).toEqual([])
  })

  it('a subway station with zero matching routes returns empty arrivals without touching fetch', async () => {
    // Subway path short-circuits to an empty result when feedUrlsForRoutes()
    // finds no feeds for the station's routes — confirms dispatch reaches
    // mta-feeds.ts's own early-return rather than the commuter path.
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch)
    const station = { ...stationById.get('119')!, routes: [] }

    const arrivals = await dispatchGetArrivals(station)
    expect(arrivals.north).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
