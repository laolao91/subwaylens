/**
 * Station-pack lookup registry.
 *
 * Lives in its own leaf module (imported by both stations.ts and
 * arrivals.ts) specifically to avoid an import cycle:
 *   stations.ts → arrivals.ts → mta-feeds.ts → stations.ts
 *
 * Packs register their stop→name and route-display tables here when the
 * region loads; arrival collection and the renderer read them back.
 */

import type { Station } from '../lib/types'
import { registerSystemRouteFilter } from './systems'

export interface StationPack {
  system: string
  routeDisplay: Record<string, string>
  stations: Station[]
}

const stopNameBySystem = new Map<string, Map<string, string>>()
const routeDisplayBySystem = new Map<string, Record<string, string>>()

/** Register a loaded pack's lookup tables. Idempotent. */
export function registerSystemPack(pack: StationPack): void {
  const stopNames = new Map<string, string>()
  for (const st of pack.stations) {
    for (const sid of st.stops) stopNames.set(sid, st.name)
  }
  stopNameBySystem.set(pack.system, stopNames)
  routeDisplayBySystem.set(pack.system, pack.routeDisplay)
  // Mixed bus+rail feeds (MBTA, MSP): the pack's rail route set becomes
  // the runtime filter.
  registerSystemRouteFilter(pack.system, Object.keys(pack.routeDisplay))
}

/** Stop ID → station name within a system (terminal resolution). */
export function systemStopNames(systemId: string): Map<string, string> | undefined {
  return stopNameBySystem.get(systemId)
}

/** Display label for a route ID within a system (falls back to the raw ID). */
export function routeDisplayName(systemId: string, routeId: string): string {
  return routeDisplayBySystem.get(systemId)?.[routeId] ?? routeId
}
