/**
 * Centralised station data.
 *
 * Single import point for the bundled MTA station list plus the LIRR and
 * Metro-North station packs. All consumers should import from here instead
 * of requiring stations.json/packs directly so the lookup maps are built
 * once and shared.
 *
 * LIRR/MNR stations are loaded unconditionally — no settings toggle, no
 * region concept. They're just more entries in allStations/stationById,
 * distinguished by the optional Station.system field.
 */

import stationsData from './stations.json'
import lirrPack from './packs/lirr.json'
import mnrPack from './packs/mnr.json'
import type { Station } from '../lib/types'

/** Every subway station complex in the MTA system. */
const subwayStations: Station[] = stationsData as Station[]

/** Every LIRR station, tagged with system: 'lirr'. */
const lirrStations: Station[] = lirrPack.stations as Station[]

/** Every Metro-North station, tagged with system: 'mnr'. */
const mnrStations: Station[] = mnrPack.stations as Station[]

/** Every station complex across subway, LIRR, and Metro-North. */
export const allStations: Station[] = [
  ...subwayStations,
  ...lirrStations,
  ...mnrStations,
]

/** O(1) lookup by station complex ID (e.g. "119", "lirr:237", "mnr:1"). */
export const stationById = new Map<string, Station>()
for (const s of allStations) {
  stationById.set(s.id, s)
}

/** O(1) lookup by base GTFS stop ID (e.g. "A03" → station). */
export const stopIdToStation = new Map<string, Station>()
for (const s of allStations) {
  for (const sid of s.stops) {
    stopIdToStation.set(sid, s)
  }
}
