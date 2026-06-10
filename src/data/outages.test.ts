import { describe, it, expect } from 'vitest'
import { normalizeStationName, outagesForStation, type EquipmentOutage } from './outages'
import type { Station } from '../lib/types'

function outage(overrides: Partial<EquipmentOutage> = {}): EquipmentOutage {
  return {
    station: 'Jackson Hts-Roosevelt Av',
    routes: ['E', 'F', 'M', 'R', '7'],
    equipmentType: 'EL',
    serving: 'street to mezzanine',
    estimatedReturn: '06/30/2026 11:59:00 PM',
    ...overrides,
  }
}

function station(overrides: Partial<Station> = {}): Station {
  return {
    id: '616',
    name: 'Jackson Heights-Roosevelt Avenue',
    stops: ['G14'],
    routes: ['E', 'F', 'M', 'R', '7'],
    lat: 40.74,
    lng: -73.89,
    north: 'Queens',
    south: 'Manhattan',
    ...overrides,
  }
}

describe('normalizeStationName', () => {
  it('equates abbreviated and spelled-out forms', () => {
    expect(normalizeStationName('Jackson Hts-Roosevelt Av')).toBe(
      normalizeStationName('Jackson Heights-Roosevelt Avenue')
    )
  })

  it('strips ordinals and punctuation', () => {
    expect(normalizeStationName('42nd St/Port Authority')).toBe(
      normalizeStationName('42 St-Port Authority')
    )
  })
})

describe('outagesForStation', () => {
  it('matches by normalized name + route overlap', () => {
    const result = outagesForStation(station(), [outage()])
    expect(result).toHaveLength(1)
  })

  it('rejects same name with disjoint routes (different 125 St stations)', () => {
    const o = outage({ station: '125 St', routes: ['A', 'B', 'C', 'D'] })
    const s = station({ name: '125 St', routes: ['4', '5', '6'] })
    expect(outagesForStation(s, [o])).toHaveLength(0)
  })

  it('rejects different names with same routes', () => {
    const o = outage({ station: '74 St-Broadway' })
    expect(outagesForStation(station(), [o])).toHaveLength(0)
  })

  it('returns nothing for non-subway stations', () => {
    const s = station({ system: 'lirr', name: 'Jackson Hts-Roosevelt Av' })
    expect(outagesForStation(s, [outage()])).toHaveLength(0)
  })

  it('name match alone suffices when outage has no routes', () => {
    const o = outage({ routes: [] })
    expect(outagesForStation(station(), [o])).toHaveLength(1)
  })
})
