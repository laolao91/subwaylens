import { describe, it, expect } from 'vitest'
import { renderLoading, renderNoStations, formatDirectionLine, renderDepartureBoard, renderMenu, renderDelays } from './display'
import type { Station, StationArrivals, TrainArrival } from '../lib/types'
import type { RouteAlert } from '../data/alerts'

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

describe('formatDirectionLine', () => {
  it('returns just the label when there is no borough code', () => {
    expect(formatDirectionLine('▲', 'Forest Hills-71 Av', '')).toBe(
      '▲ Forest Hills-71 Av'
    )
  })

  it('appends the borough code when it fits on the line', () => {
    expect(formatDirectionLine('▲', 'Forest Hills-71 Av', 'QNS')).toBe(
      '▲ Forest Hills-71 Av - QNS'
    )
    expect(formatDirectionLine('▼', 'Bay Ridge-95 St', 'BK')).toBe(
      '▼ Bay Ridge-95 St - BK'
    )
  })

  it('keeps the borough code when the combined line exactly hits the line limit', () => {
    // '▲ ' (2) + 30-char label + ' - QNS' (6) = 38, exactly CHARS_PER_LINE.
    const label = 'A'.repeat(30)
    const result = formatDirectionLine('▲', label, 'QNS')
    expect(result).toBe(`▲ ${label} - QNS`)
    expect(result.length).toBe(38)
  })

  it('drops the borough code rather than truncate a long station name', () => {
    // One char longer than the previous case overflows CHARS_PER_LINE (38)
    // by exactly 1 — the name wins, borough is omitted entirely.
    const label = 'A'.repeat(31)
    const result = formatDirectionLine('▲', label, 'QNS')
    expect(result).toBe(`▲ ${label}`)
    expect(result).not.toContain('QNS')
  })
})

function makeLirrStation(overrides: Partial<Station> = {}): Station {
  return {
    id: 'lirr:237',
    name: 'Penn Station',
    stops: ['237'],
    routes: ['1', '4'],
    lat: 40.75058844,
    lng: -73.99358408,
    north: 'Ronkonkoma',
    south: 'Penn Station',
    system: 'lirr',
    ...overrides,
  }
}

function makeArrival(overrides: Partial<TrainArrival> = {}): TrainArrival {
  return {
    route: '4',
    direction: 'N',
    stopId: '237',
    arrivalTime: 1750000000,
    terminal: 'Ronkonkoma',
    ...overrides,
  }
}

function makeArrivals(north: TrainArrival[], fetchedAt = 1750000000 - 60): StationArrivals {
  return { stationId: 'lirr:237', north, south: [], fetchedAt }
}

describe('renderDepartureBoard', () => {
  it('renders DEPARTURES header and a normal list of entries with tracks', () => {
    const station = makeLirrStation()
    const now = 1750000000
    const arrivals = makeArrivals([
      makeArrival({ route: '4', terminal: 'Ronkonkoma', arrivalTime: now + 12 * 60, track: '18' }),
      makeArrival({ route: '5', terminal: 'Babylon', arrivalTime: now + 19 * 60, track: '15' }),
    ])
    const text = renderDepartureBoard(station, arrivals)
    expect(text).toContain('DEPARTURES')
    expect(text).toContain('Trk 18')
    expect(text).toContain('Trk 15')
    expect(text).toContain('tap:refresh')
    expect(text).toContain('dbl:exit')
  })

  it('shows "Trk --" when a departure has no posted track yet', () => {
    const station = makeLirrStation()
    const arrivals = makeArrivals([
      makeArrival({ route: '2', terminal: 'Hempstead', arrivalTime: 1750000000 + 24 * 60, track: undefined }),
    ])
    const text = renderDepartureBoard(station, arrivals)
    expect(text).toContain('Trk --')
  })

  it('shows the empty/no-live-data state when there are no departures', () => {
    const station = makeLirrStation()
    const arrivals = makeArrivals([])
    const text = renderDepartureBoard(station, arrivals)
    expect(text).toContain('No live data')
  })

  it('limits to a maximum of 6 entries', () => {
    const station = makeLirrStation()
    const now = 1750000000
    const many = Array.from({ length: 10 }, (_, i) =>
      makeArrival({ route: '4', terminal: 'Ronkonkoma', arrivalTime: now + (i + 1) * 60, track: String(i + 1) })
    )
    const arrivals = makeArrivals(many)
    const text = renderDepartureBoard(station, arrivals)
    const trkLines = text.split('\n').filter((l) => l.includes('Trk'))
    expect(trkLines.length).toBeLessThanOrEqual(6)
  })

  it('sorts entries by arrival time ascending', () => {
    const station = makeLirrStation()
    const now = 1750000000
    const arrivals = makeArrivals([
      makeArrival({ route: '5', terminal: 'Babylon', arrivalTime: now + 30 * 60, track: '15' }),
      makeArrival({ route: '4', terminal: 'Ronkonkoma', arrivalTime: now + 5 * 60, track: '18' }),
    ])
    const text = renderDepartureBoard(station, arrivals)
    const trkLineIndexes = text.split('\n')
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => line.includes('Trk'))
    expect(trkLineIndexes[0].line).toContain('Trk 18') // 5min entry first
    expect(trkLineIndexes[1].line).toContain('Trk 15')
  })
})

describe('renderMenu', () => {
  it('highlights the cursor option with ▶', () => {
    const out = renderMenu(1, true)
    const lines = out.split('\n')
    expect(lines.some(l => l.startsWith('▶') && l.includes('Favorites'))).toBe(true)
    expect(lines.some(l => l.startsWith(' ') && l.includes('Nearest Station'))).toBe(true)
    expect(lines.some(l => l.startsWith(' ') && l.includes('Delays'))).toBe(true)
  })

  it('dims Nearest Station when nearbyEnabled is false', () => {
    const out = renderMenu(1, false)
    expect(out).toContain('Nearest Station  (GPS off)')
  })

  it('footer says tap:enter dbl:exit', () => {
    expect(renderMenu(0, true)).toContain('tap:enter')
    expect(renderMenu(0, true)).toContain('dbl:exit')
  })
})

describe('renderDelays', () => {
  const now = 1700000000

  it('shows No active alerts when alerts map is empty', () => {
    const out = renderDelays(new Map(), [], now)
    expect(out).toContain('No active alerts')
  })

  it('renders a service alert with route badge and header text', () => {
    const alerts: Map<string, RouteAlert[]> = new Map([
      ['R', [{ routeId: 'R', headerText: 'Minor delays systemwide', effect: 8 }]],
    ])
    const out = renderDelays(alerts, [], now)
    expect(out).toContain('[R]')
    expect(out).toContain('Minor delays systemwide')
  })

  it('shows delayed trains at stations above the 5-minute threshold', () => {
    const station: Station = {
      id: 'st1', name: 'DeKalb Av', stops: ['D24'], routes: ['B', 'Q'],
      lat: 40.6, lng: -73.97, north: 'Manhattan', south: 'Brighton Beach',
    }
    const arrivals: StationArrivals = {
      stationId: 'st1',
      north: [{ route: 'B', direction: 'N', stopId: 'D24N', arrivalTime: now + 120, terminal: 'Bay Ridge', delay: 420 }],
      south: [],
      fetchedAt: now,
    }
    const out = renderDelays(new Map(), [{ station, arrivals, isNearby: false }], now)
    expect(out).toContain('[B]')
    expect(out).toContain('DeKalb Av')
    expect(out).toContain('+7m late')
  })

  it('labels nearby stations with (nearby)', () => {
    const station: Station = {
      id: 'st2', name: 'Jackson Hts', stops: ['F12'], routes: ['F'],
      lat: 40.74, lng: -73.89, north: 'Manhattan', south: 'Jamaica',
    }
    const arrivals: StationArrivals = {
      stationId: 'st2',
      north: [{ route: 'F', direction: 'N', stopId: 'F12N', arrivalTime: now + 60, terminal: 'Jamaica', delay: 360 }],
      south: [],
      fetchedAt: now,
    }
    const out = renderDelays(new Map(), [{ station, arrivals, isNearby: true }], now)
    expect(out).toContain('(nearby)')
  })

  it('hides At your stations section when no train exceeds threshold', () => {
    const station: Station = {
      id: 'st3', name: 'Atlantic Av', stops: ['D24'], routes: ['R'],
      lat: 40.68, lng: -73.97, north: 'Manhattan', south: 'Bay Ridge',
    }
    const arrivals: StationArrivals = {
      stationId: 'st3',
      north: [{ route: 'R', direction: 'N', stopId: 'D24N', arrivalTime: now + 300, terminal: 'Whitehall', delay: 60 }],
      south: [],
      fetchedAt: now,
    }
    const out = renderDelays(new Map(), [{ station, arrivals, isNearby: false }], now)
    expect(out).not.toContain('At your stations')
  })

  it('footer says tap:refresh dbl:menu', () => {
    const out = renderDelays(new Map(), [], now)
    expect(out).toContain('tap:refresh')
    expect(out).toContain('dbl:menu')
  })
})
