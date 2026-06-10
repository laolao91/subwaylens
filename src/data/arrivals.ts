/**
 * System-aware arrival collection.
 *
 * Dispatches on the station's system:
 *   - 'stop-suffix' (NYC subway): delegates to mta-feeds.ts, which encodes
 *     direction in the stop ID suffix (A03N/A03S). Unchanged behavior.
 *   - 'direction-id' (everything else): standard GTFS-RT — match
 *     stu.stopId against station.stops directly; direction from
 *     trip.directionId (0→N, 1→S). Departure-board systems collapse to a
 *     single 'N' list. LIRR/MNR get track numbers from the raw-bytes
 *     extension walk (railroad-track.ts).
 *
 * Station packs register their stop→name and route-display tables via
 * registerSystemPack() so terminals and route badges resolve without the
 * full pack being threaded through every call.
 */

import { fetchFeedWithRawCached, type FeedEntity } from './feed-cache'
import { extractTrackMap } from './railroad-track'
import { getSystem } from './systems'
import { systemStopNames } from './pack-registry'
import { getStationArrivals as getSubwayArrivals } from './mta-feeds'
import type { Station, TrainArrival, StationArrivals } from '../lib/types'

// Pack registration and display lookups live in pack-registry.ts (leaf
// module — avoids the stations→arrivals→mta-feeds→stations cycle).
// Re-exported here for compatibility with existing imports.
export { registerSystemPack, routeDisplayName, type StationPack } from './pack-registry'

// ── Dispatcher ──

export async function getStationArrivals(station: Station): Promise<StationArrivals> {
  const system = getSystem(station.system)
  if (system.directionStrategy === 'stop-suffix') {
    return getSubwayArrivals(station)
  }
  return getStandardArrivals(station, system.id)
}

// ── Standard GTFS-RT path ──

async function getStandardArrivals(
  station: Station,
  systemId: string
): Promise<StationArrivals> {
  const system = getSystem(systemId)
  const now = Math.floor(Date.now() / 1000)
  const result: StationArrivals = {
    stationId: station.id,
    north: [],
    south: [],
    fetchedAt: now,
  }

  const stationStopIds = new Set(station.stops)
  const stopNames = systemStopNames(systemId)

  try {
    const feeds = await Promise.all(
      system.feedUrls.map((url) =>
        fetchFeedWithRawCached(url).catch(() => {
          console.warn(`Feed failed: ${url}`)
          return null
        })
      )
    )

    for (const feed of feeds) {
      if (!feed) continue
      const trackMap = system.hasTrackData
        ? extractTrackMap(feed.raw)
        : null
      collectFromEntities(feed.entities, station, system.layout, {
        now,
        stationStopIds,
        stopNames,
        routeFilter: system.routeFilter ? new Set(system.routeFilter) : null,
        trackMap,
        result,
      })
    }

    result.north.sort((a, b) => a.arrivalTime - b.arrivalTime)
    result.south.sort((a, b) => a.arrivalTime - b.arrivalTime)
  } catch (err) {
    console.error('Failed to fetch arrivals:', err)
  }

  return result
}

interface CollectCtx {
  now: number
  stationStopIds: Set<string>
  stopNames: Map<string, string> | undefined
  routeFilter: Set<string> | null
  trackMap: Map<string, string> | null
  result: StationArrivals
}

function collectFromEntities(
  entities: FeedEntity[],
  station: Station,
  layout: 'directional' | 'departure-board',
  ctx: CollectCtx
): void {
  for (const entity of entities) {
    const tu = entity.tripUpdate
    if (!tu?.trip || !tu.stopTimeUpdate) continue

    const routeId = (tu.trip.routeId as string) || ''
    if (ctx.routeFilter && !ctx.routeFilter.has(routeId)) continue

    const tripId = (tu.trip.tripId as string) || ''
    const dirId = tu.trip.directionId ?? 0
    const stopTimeUpdates = tu.stopTimeUpdate

    // Terminal = last stop in the trip's remaining sequence
    const lastStop = stopTimeUpdates[stopTimeUpdates.length - 1]
    const lastStopId = (lastStop?.stopId as string) || ''
    const terminalName = ctx.stopNames?.get(lastStopId) ?? lastStopId ?? routeId

    for (const stu of stopTimeUpdates) {
      const stopId = stu.stopId as string
      if (!stopId || !ctx.stationStopIds.has(stopId)) continue

      const arrTime = Number(stu.arrival?.time || stu.departure?.time || 0)
      if (arrTime === 0 || arrTime < ctx.now - 30) continue

      const stopDelay = Number(stu.arrival?.delay ?? stu.departure?.delay ?? 0)
      const delaySecs = stopDelay

      const arrival: TrainArrival = {
        route: routeId,
        direction: layout === 'departure-board' ? 'N' : dirId === 1 ? 'S' : 'N',
        stopId,
        arrivalTime: arrTime,
        terminal: terminalName,
        delay: delaySecs > 0 ? delaySecs : undefined,
        track: ctx.trackMap?.get(`${tripId}|${stopId}`),
      }

      if (arrival.direction === 'N') {
        ctx.result.north.push(arrival)
      } else {
        ctx.result.south.push(arrival)
      }
    }
  }
}
