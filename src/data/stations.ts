/**
 * Centralised station data.
 *
 * Single import point for the bundled MTA station list.
 * All consumers should import from here instead of requiring stations.json
 * directly so the lookup maps are built once and shared.
 */

import stationsData from './stations.json'
import type { Station } from '../lib/types'

/** Every station complex in the MTA system. */
export const allStations: Station[] = stationsData as Station[]

/** O(1) lookup by station complex ID. */
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
