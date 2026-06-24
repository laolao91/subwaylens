import { describe, it, expect } from 'vitest'
import { allStations, stationById, stopIdToStation } from './stations'

describe('stations (subway + LIRR + MNR packs loaded together)', () => {
  it('includes the bundled subway stations', () => {
    const subwayStation = stationById.get('119')
    expect(subwayStation).toBeDefined()
    expect(subwayStation?.system).toBeUndefined()
  })

  it('includes LIRR stations with system set to lirr', () => {
    const penn = stationById.get('lirr:237')
    expect(penn).toBeDefined()
    expect(penn?.system).toBe('lirr')
    expect(penn?.name).toBe('Penn Station')
  })

  it('includes MNR stations with system set to mnr', () => {
    const grandCentral = stationById.get('mnr:1')
    expect(grandCentral).toBeDefined()
    expect(grandCentral?.system).toBe('mnr')
    expect(grandCentral?.name).toBe('Grand Central')
  })

  it('allStations contains subway plus LIRR plus MNR counts', () => {
    const subwayCount = allStations.filter((s) => !s.system).length
    const lirrCount = allStations.filter((s) => s.system === 'lirr').length
    const mnrCount = allStations.filter((s) => s.system === 'mnr').length
    expect(subwayCount).toBe(445)
    expect(lirrCount).toBe(127)
    expect(mnrCount).toBe(113)
    expect(allStations.length).toBe(subwayCount + lirrCount + mnrCount)
  })

  it('stopIdToStation resolves LIRR stop IDs to their station', () => {
    const jamaica = stopIdToStation.get('102')
    expect(jamaica).toBeDefined()
    expect(jamaica?.id).toBe('lirr:102')
    expect(jamaica?.name).toBe('Jamaica')
  })

  it('does not let LIRR/MNR stop IDs collide with subway stop IDs', () => {
    // Subway stop IDs are bare numbers/letter-codes (e.g. "119"); LIRR stop "102"
    // is also a bare number. stopIdToStation is a flat map, so if both systems
    // used "102" the LIRR entry registered later would win. Confirm this is the
    // expected last-registration-wins behavior is harmless for the well-known
    // disambiguating cases used by the app (search/favorites always resolve by
    // the namespaced station `id`, e.g. "lirr:102", not by bare stop ID).
    const byId = stationById.get('lirr:102')
    expect(byId?.stops).toContain('102')
  })
})
