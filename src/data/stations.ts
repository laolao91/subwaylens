/**
 * Centralised station data — region-aware as of v1.7.0.
 *
 * `allStations` / `stationById` / `stopIdToStation` are live collections
 * holding the ACTIVE REGION's stations. They boot with the bundled NYC
 * subway list (back-compat: every consumer that predates regions sees the
 * same data they always did) and are rebuilt in place by
 * loadRegionStations() — in place, because consumers hold module-binding
 * references taken at import time.
 *
 * Non-NYC packs are dynamic imports so a Boston user never downloads the
 * Denver pack (Vite code-splits each pack into its own chunk).
 */

import nycSubwayData from './stations.json'
import type { Station } from '../lib/types'
import { getRegion } from './systems'
import { registerSystemPack, type StationPack } from './pack-registry'

const NYC_SUBWAY: Station[] = nycSubwayData as Station[]

/** Every station in the active region. Boots with NYC subway. */
export const allStations: Station[] = [...NYC_SUBWAY]

/** O(1) lookup by station ID (active region). */
export const stationById = new Map<string, Station>()

/**
 * O(1) lookup by base GTFS stop ID — NYC SUBWAY ONLY (consumed by
 * mta-feeds.ts for terminal name resolution; other systems resolve
 * names through their pack registration in arrivals.ts).
 */
export const stopIdToStation = new Map<string, Station>()
for (const s of NYC_SUBWAY) {
  for (const sid of s.stops) stopIdToStation.set(sid, s)
}

function rebuildIndexes(): void {
  stationById.clear()
  for (const s of allStations) stationById.set(s.id, s)
}
rebuildIndexes()

// Dynamic pack loaders, one per non-subway system.
const packLoaders: Record<string, () => Promise<StationPack>> = {
  lirr: () => import('./packs/lirr.json').then((m) => m.default as unknown as StationPack),
  mnr: () => import('./packs/mnr.json').then((m) => m.default as unknown as StationPack),
  bart: () => import('./packs/bart.json').then((m) => m.default as unknown as StationPack),
  'septa-rail': () => import('./packs/septa-rail.json').then((m) => m.default as unknown as StationPack),
  rtd: () => import('./packs/rtd.json').then((m) => m.default as unknown as StationPack),
  mbta: () => import('./packs/mbta.json').then((m) => m.default as unknown as StationPack),
  msp: () => import('./packs/msp.json').then((m) => m.default as unknown as StationPack),
  marta: () => import('./packs/marta.json').then((m) => m.default as unknown as StationPack),
}

let activeRegionId = 'nyc'

export function getActiveRegionId(): string {
  return activeRegionId
}

/**
 * Load a region's station packs and swap them into the live collections.
 * Pack failures are non-fatal (that system's stations just don't appear).
 * Idempotent — safe to call with the already-active region.
 */
export async function loadRegionStations(regionId: string): Promise<void> {
  const region = getRegion(regionId)
  const next: Station[] = []

  for (const sysId of region.systems) {
    if (sysId === 'nyc-subway') {
      next.push(...NYC_SUBWAY)
      continue
    }
    const loader = packLoaders[sysId]
    if (!loader) continue
    try {
      const pack = await loader()
      registerSystemPack(pack)
      next.push(...pack.stations)
    } catch (err) {
      console.warn(`[subwaylens] station pack failed to load: ${sysId}`, err)
    }
  }

  allStations.length = 0
  allStations.push(...next)
  activeRegionId = region.id
  rebuildIndexes()
  console.log(`[subwaylens] region ${region.id}: ${allStations.length} stations, lirr:237=${stationById.has('lirr:237')}`)
}
