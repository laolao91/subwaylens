import { describe, it, expect, beforeAll } from 'vitest'
import { renderLoading, renderNoStations, renderBody, renderBodyColumns, branchAbbrev, renderGlanceBody } from './display'
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

  it('drops trains terminating at this station (arrivals, not departures)', () => {
    const now = Math.floor(Date.now() / 1000)
    const withArrival: StationArrivals = {
      stationId: 'lirr:237',
      north: [
        { route: '4', direction: 'N', stopId: '237', arrivalTime: now + 300, terminal: 'Penn Station', track: '21' },
        { route: '1', direction: 'N', stopId: '237', arrivalTime: now + 600, terminal: 'Babylon' },
      ],
      south: [],
      fetchedAt: now,
    }
    const text = renderBody(LIRR_STATION, withArrival, 0, 1, new Map())
    expect(text).toContain('Babylon')
    expect(text).not.toContain('Trk 21')
  })
})

// ── No live data (feature #6 schedule fallback removed by request —
//    plain message preferred over headway estimates) ──

describe('renderBody — no live data', () => {
  it('shows plain No live data for an empty subway feed', () => {
    const now = Math.floor(Date.now() / 1000)
    const subwayStation: Station = {
      id: '127', name: 'Times Sq-42 St', stops: ['127'], routes: ['1', '2', '3'],
      lat: 40.75, lng: -73.98, north: 'Uptown', south: 'Downtown',
    }
    const empty: StationArrivals = { stationId: '127', north: [], south: [], fetchedAt: now }
    const text = renderBody(subwayStation, empty, 0, 1, new Map())
    expect(text).toContain('No live data')
    expect(text).not.toContain('(sched)')
  })
})

// ── Glance mode ──

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
    expect(text).toContain('3 min')
    expect(text).toContain('7 min')
    expect(text).toContain('tap:detail')
    expect(text.split('\n').length).toBeLessThanOrEqual(9)
  })

  it('shows -- when a direction has no trains', () => {
    const now = Math.floor(Date.now() / 1000)
    const arrivals: StationArrivals = { stationId: '127', north: [], south: [], fetchedAt: now }
    const text = renderGlanceBody(SUBWAY_STATION, arrivals)
    expect(text).toContain('-- min')
  })
})

// ── Columnar body (Option B) ──

describe('renderBodyColumns', () => {
  const JACKSON_HTS: Station = {
    id: '616', name: 'Jackson Hts-Roosevelt Av', stops: ['G14', '710', 'R09'],
    routes: ['E', 'F', 'M', 'R', '7'], lat: 40.74, lng: -73.89,
    north: 'Queens', south: 'Manhattan',
  }

  function mixedArrivals(now: number): StationArrivals {
    return {
      stationId: '616',
      north: [
        { route: 'F', direction: 'N', stopId: 'G14N', arrivalTime: now + 180, terminal: 'Jamaica-179 St' },
        { route: 'E', direction: 'N', stopId: 'G14N', arrivalTime: now + 360, terminal: 'Jamaica Center-Parsons/Archer' },
      ],
      south: [
        { route: 'E', direction: 'S', stopId: 'G14S', arrivalTime: now + 120, terminal: 'World Trade Center' },
        { route: 'F', direction: 'S', stopId: 'G14S', arrivalTime: now + 300, terminal: 'Coney Island-Stillwell Av' },
      ],
      fetchedAt: now,
    }
  }

  it('keeps all three columns line-aligned (same line count)', () => {
    const now = Math.floor(Date.now() / 1000)
    const cols = renderBodyColumns(JACKSON_HTS, mixedArrivals(now), 0, 2, new Map())
    const bodyLines = cols.body.split('\n')
    expect(cols.borough.split('\n')).toHaveLength(bodyLines.length)
    expect(cols.time.split('\n')).toHaveLength(bodyLines.length)
  })

  it('tags each train with its own borough — mixed directions stay accurate', () => {
    const now = Math.floor(Date.now() / 1000)
    const cols = renderBodyColumns(JACKSON_HTS, mixedArrivals(now), 0, 2, new Map())
    const body = cols.body.split('\n')
    const borough = cols.borough.split('\n')
    // Southbound: E→World Trade Center is MAN, F→Coney Island is BK
    const eIdx = body.findIndex((l) => l.includes('[E]') && l.includes('WTC'))
    const fIdx = body.findIndex((l) => l.includes('[F]') && l.includes('Coney'))
    expect(eIdx).toBeGreaterThan(-1)
    expect(fIdx).toBeGreaterThan(-1)
    expect(borough[eIdx]).toBe('MAN')
    expect(borough[fIdx]).toBe('BK')
  })

  it('full-width rows (labels, dividers, footer) have blank column lines', () => {
    const now = Math.floor(Date.now() / 1000)
    const cols = renderBodyColumns(JACKSON_HTS, mixedArrivals(now), 0, 2, new Map())
    const body = cols.body.split('\n')
    const borough = cols.borough.split('\n')
    const time = cols.time.split('\n')
    const labelIdx = body.findIndex((l) => l.startsWith('▲'))
    expect(borough[labelIdx]).toBe('')
    expect(time[labelIdx]).toBe('')
  })

  it('departure-board systems return empty columns', () => {
    const now = Math.floor(Date.now() / 1000)
    const empty: StationArrivals = { stationId: 'lirr:237', north: [], south: [], fetchedAt: now }
    const cols = renderBodyColumns(LIRR_STATION, empty, 0, 1, new Map())
    expect(cols.borough).toBe('')
    expect(cols.time).toBe('')
    expect(cols.body).toContain('DEPARTURES')
  })

  it('body train lines stay clear of the column overlay region (≤21 chars)', () => {
    const now = Math.floor(Date.now() / 1000)
    const cols = renderBodyColumns(JACKSON_HTS, mixedArrivals(now), 0, 2, new Map())
    const borough = cols.borough.split('\n')
    cols.body.split('\n').forEach((line, i) => {
      if (borough[i] !== '' || cols.time.split('\n')[i] !== '') {
        expect(line.length).toBeLessThanOrEqual(21)
      }
    })
  })
})
