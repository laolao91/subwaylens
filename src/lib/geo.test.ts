import { describe, it, expect, afterEach } from 'vitest'
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import {
  distanceMiles,
  nearbyStations,
  initGeo,
  getCurrentPositionDetailed,
  getCurrentPosition,
} from './geo'
import type { Station } from './types'

const TIMES_SQ: { lat: number; lng: number } = { lat: 40.7580, lng: -73.9855 }
const UNION_SQ: { lat: number; lng: number } = { lat: 40.7359, lng: -73.9906 }

describe('distanceMiles', () => {
  it('returns 0 for identical points', () => {
    expect(distanceMiles(TIMES_SQ, TIMES_SQ)).toBe(0)
  })

  it('returns symmetric distance', () => {
    const ab = distanceMiles(TIMES_SQ, UNION_SQ)
    const ba = distanceMiles(UNION_SQ, TIMES_SQ)
    expect(Math.abs(ab - ba)).toBeLessThan(0.0001)
  })

  it('Times Sq to Union Sq is ~1.5 miles', () => {
    const d = distanceMiles(TIMES_SQ, UNION_SQ)
    expect(d).toBeGreaterThan(1.0)
    expect(d).toBeLessThan(2.0)
  })

  it('returns positive distance for different points', () => {
    expect(distanceMiles(TIMES_SQ, UNION_SQ)).toBeGreaterThan(0)
  })
})

function makeStation(id: string, lat: number, lng: number): Station {
  return { id, name: id, stops: [], routes: [], lat, lng, north: '', south: '' }
}

describe('nearbyStations', () => {
  const stations = [
    makeStation('near', 40.7560, -73.9865),  // ~0.2 mi from TIMES_SQ
    makeStation('far',  40.6501, -73.9496),  // ~7 mi away
  ]

  it('returns only stations within radius', () => {
    const results = nearbyStations(TIMES_SQ, stations, 0.5)
    expect(results.map(r => r.station.id)).toContain('near')
    expect(results.map(r => r.station.id)).not.toContain('far')
  })

  it('sorts by distance ascending', () => {
    const results = nearbyStations(TIMES_SQ, stations, 10)
    expect(results[0].distance).toBeLessThanOrEqual(results[1].distance)
  })

  it('returns empty array when no stations in radius', () => {
    const results = nearbyStations(TIMES_SQ, stations, 0.01)
    expect(results).toHaveLength(0)
  })
})

function fakeBridge(getAppLocation: EvenAppBridge['getAppLocation']): EvenAppBridge {
  return { getAppLocation } as unknown as EvenAppBridge
}

describe('getCurrentPositionDetailed (bridge-first)', () => {
  afterEach(() => {
    // Reset the module-level bridge singleton between tests.
    initGeo(null as unknown as EvenAppBridge)
  })

  it('uses the bridge fix when getAppLocation resolves', async () => {
    initGeo(fakeBridge(async () => ({ latitude: 40.758, longitude: -73.9855 })))
    const pos = await getCurrentPositionDetailed()
    expect(pos).toEqual({ lat: 40.758, lng: -73.9855 })
  })

  it('falls back to navigator.geolocation when the bridge returns null', async () => {
    initGeo(fakeBridge(async () => null))
    const original = navigator.geolocation
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) => {
          success({
            coords: { latitude: 40.7359, longitude: -73.9906 },
          } as GeolocationPosition)
        },
      },
    })
    const pos = await getCurrentPositionDetailed()
    expect(pos).toEqual({ lat: 40.7359, lng: -73.9906 })
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: original })
  })

  it('falls back to navigator.geolocation when the bridge throws', async () => {
    initGeo(fakeBridge(async () => { throw new Error('bridge unavailable') }))
    const original = navigator.geolocation
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: undefined,
    })
    const pos = await getCurrentPositionDetailed()
    expect(pos).toBe('unavailable')
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: original })
  })

  it('getCurrentPosition resolves null (not an error string) when nothing is available', async () => {
    initGeo(fakeBridge(async () => null))
    const original = navigator.geolocation
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined })
    const pos = await getCurrentPosition()
    expect(pos).toBeNull()
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: original })
  })
})
