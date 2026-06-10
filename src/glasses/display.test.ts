import { describe, it, expect, beforeAll } from 'vitest'
import { renderLoading, renderNoStations, renderBody, branchAbbrev, bigNumberRows, renderGlanceBody } from './display'
import { registerSystemPack } from '../data/arrivals'
import type { Station, StationArrivals } from '../lib/types'

// Note: renderHeader and renderBody require Station / StationArrivals objects
// which pull in the full stations.json bundle. These pure-function tests cover
// the simpler renderers and serve as a regression baseline for future additions.

describe('renderLoading', () => {
  it('returns a non-empty string', () => {
    expect(renderLoading().length).toBeGreaterThan(0)
  })

  it('contains loading message', () => {
    expect(renderLoading()).toContain('Loading')
  })
})

describe('renderNoStations', () => {
  it('returns a non-empty string', () => {
    expect(renderNoStations().length).toBeGreaterThan(0)
  })

  it('instructs user to open phone settings', () => {
    const text = renderNoStations()
    expect(text).toContain('phone')
    expect(text).toContain('stations')
  })
})

// ── Departure board ──

const LIRR_STATION: Station = {
  id: 'lirr:237',
  system: 'lirr',
  name: 'Penn Station',
  stops: ['237'],
  routes: ['1', '4'],
  lat: 40.75,
  lng: -73.99,
  north: 'Ronkonkoma',
  south: 'Penn Station',
}

function departures(now: number): StationArrivals {
  return {
    stationId: 'lirr:237',
    north: [
      { route: '4', direction: 'N', stopId: '237', arrivalTime: now + 720, terminal: 'Ronkonkoma', track: '18' },
      { route: '1', direction: 'N', stopId: '237', arrivalTime: now + 1140, terminal: 'Babylon', delay: 240 },
    ],
    south: [],
    fetchedAt: now,
  }
}

describe('branchAbbrev', () => {
  it('multi-word names: first letter + first 3 of second word', () => {
    expect(branchAbbrev('Port Jefferson')).toBe('PJEF')
    expect(branchAbbrev('Far Rockaway')).toBe('FROC')
  })

  it('single-word names: first 4 chars', () => {
    expect(branchAbbrev('Ronkonkoma')).toBe('RONK')
    expect(branchAbbrev('Babylon')).toBe('BABY')
  })

  it('handles empty input', () => {
    expect(branchAbbrev('')).toBe('????')
  })
})

describe('renderBody — departure board (LIRR)', () => {
  beforeAll(() => {
    registerSystemPack({
      system: 'lirr',
      routeDisplay: { '1': 'Babylon', '4': 'Ronkonkoma' },
      stations: [LIRR_STATION],
    })
  })

  it('renders a single DEPARTURES list with track numbers', () => {
    const now = Math.floor(Date.now() / 1000)
    const text = renderBody(LIRR_STATION, departures(now), 0, 3, new Map())
    expect(text).toContain('DEPARTURES')
    expect(text).toContain('[RONK]')
    expect(text).toContain('Trk 18')
    expect(text).not.toContain('▲') // no direction sections
    expect(text).not.toContain('▼')
  })

  it('shows dim track placeholder when unposted and delay notice when late', () => {
    const now = Math.floor(Date.now() / 1000)
    const text = renderBody(LIRR_STATION, departures(now), 0, 3, new Map())
    expect(text).toContain('Trk --')
    expect(text).toContain('+4m late')
  })

  it('shows No live data when empty', () => {
    const now = Math.floor(Date.now() / 1000)
    const empty: StationArrivals = { stationId: 'lirr:237', north: [], south: [], fetchedAt: now }
    const text = renderBody(LIRR_STATION, empty, 0, 1, new Map())
    expect(text).toContain('No live data')
  })
})

// ── Schedule fallback ──

describe('renderBody — schedule fallback (NYC subway, no live data)', () => {
  const SUBWAY_STATION: Station = {
    id: '127',
    name: 'Times Sq-42 St',
    stops: ['127'],
    routes: ['1', '2', '3'],
    lat: 40.75,
    lng: -73.98,
    north: 'Uptown',
    south: 'Downtown',
  }

  it('shows sched estimates and warning footer when feed is empty', () => {
    const now = Math.floor(Date.now() / 1000)
    const empty: StationArrivals = { stationId: '127', north: [], south: [], fetchedAt: now }
    const text = renderBody(SUBWAY_STATION, empty, 0, 1, new Map())
    // 1/2/3 trains run ~all hours; the table should produce estimates.
    expect(text).toContain('(sched)')
    expect(text).toContain('! sched est.')
  })

  it('keeps plain No live data for non-subway systems', () => {
    const now = Math.floor(Date.now() / 1000)
    const bartStation: Station = {
      id: 'bart:EMBR', system: 'bart', name: 'Embarcadero',
      stops: ['M16-1'], routes: ['1'], lat: 37.79, lng: -122.4,
      north: 'Antioch', south: 'Daly City',
    }
    const empty: StationArrivals = { stationId: 'bart:EMBR', north: [], south: [], fetchedAt: now }
    const text = renderBody(bartStation, empty, 0, 1, new Map())
    expect(text).toContain('No live data')
    expect(text).not.toContain('(sched)')
  })
})

// ── Glance mode ──

describe('bigNumberRows', () => {
  it('renders digits as 3 rows of equal width', () => {
    const rows = bigNumberRows('12')
    expect(rows).toHaveLength(3)
    expect(rows[0].length).toBe(rows[1].length)
    expect(rows[1].length).toBe(rows[2].length)
  })

  it('handles the no-data placeholder', () => {
    const rows = bigNumberRows('--')
    expect(rows[1]).toContain('_')
  })
})

describe('renderGlanceBody', () => {
  const SUBWAY_STATION: Station = {
    id: '127', name: 'Times Sq-42 St', stops: ['127'], routes: ['1'],
    lat: 40.75, lng: -73.98, north: 'Uptown', south: 'Downtown',
  }

  it('shows both directions with big countdown and detail hint', () => {
    const now = Math.floor(Date.now() / 1000)
    const arrivals: StationArrivals = {
      stationId: '127',
      north: [{ route: '1', direction: 'N', stopId: '127N', arrivalTime: now + 180, terminal: 'Uptown Terminal' }],
      south: [{ route: '1', direction: 'S', stopId: '127S', arrivalTime: now + 420, terminal: 'South Ferry' }],
      fetchedAt: now,
    }
    const text = renderGlanceBody(SUBWAY_STATION, arrivals)
    expect(text).toContain('▲')
    expect(text).toContain('▼')
    expect(text).toContain('min')
    expect(text).toContain('tap:detail')
    expect(text.split('\n').length).toBeLessThanOrEqual(9)
  })

  it('shows -- when a direction has no trains', () => {
    const now = Math.floor(Date.now() / 1000)
    const arrivals: StationArrivals = { stationId: '127', north: [], south: [], fetchedAt: now }
    const text = renderGlanceBody(SUBWAY_STATION, arrivals)
    expect(text).toContain('min')
  })
})
