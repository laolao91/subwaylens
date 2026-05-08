/**
 * MTA GTFS-RT feed fetcher and protobuf decoder.
 *
 * Uses gtfs-realtime-bindings to decode protobuf (handles NYCT wire type 6 extensions).
 * Each feed fetch has an 8-second AbortController timeout matching the alerts feed,
 * so a hung MTA endpoint cannot block the refresh indefinitely.
 */

import GtfsRealtimeBindings from 'gtfs-realtime-bindings'
import { feedUrlsForRoutes } from './feed-urls'
import { stopIdToStation } from './stations'
import type { Station, TrainArrival, StationArrivals } from '../lib/types'

const FEED_TIMEOUT_MS = 8000

// Build stop ID -> station name lookup from the centralised stations map
const stopIdToName = new Map<string, string>()
for (const [sid, station] of stopIdToStation) {
  stopIdToName.set(sid, station.name)
}

/**
 * Parse a GTFS-RT stop_id into base ID and direction.
 * MTA format: "A03N" -> base="A03", direction="N"
 */
function parseStopId(stopId: string): { base: string; direction: 'N' | 'S' } {
  const lastChar = stopId.slice(-1)
  const dir: 'N' | 'S' = lastChar === 'S' ? 'S' : 'N'
  const base = stopId.slice(0, -1)
  return { base, direction: dir }
}

/**
 * Resolve a stop ID to a human-readable station name.
 */
function resolveStopName(stopId: string): string {
  const { base } = parseStopId(stopId)
  return stopIdToName.get(base) || stopId
}

/**
 * Fetch and decode a single GTFS-RT feed.
 * Aborts after FEED_TIMEOUT_MS to prevent hung requests blocking the refresh cycle.
 */
async function fetchFeed(
  url: string
): Promise<GtfsRealtimeBindings.transit_realtime.IFeedEntity[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error(`Feed ${response.status}: ${url}`)
    const buffer = await response.arrayBuffer()
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
      new Uint8Array(buffer)
    )
    return feed.entity || []
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Fetch arrivals for a station.
 * Fetches only the feeds relevant to the station's routes.
 * Returns empty directions on any failure — no mock/fake data.
 */
export async function getStationArrivals(
  station: Station
): Promise<StationArrivals> {
  const now = Math.floor(Date.now() / 1000)
  const result: StationArrivals = {
    stationId: station.id,
    north: [],
    south: [],
    fetchedAt: now,
  }

  const urls = feedUrlsForRoutes(station.routes)
  if (urls.length === 0) return result

  const stationStopIds = new Set(station.stops)

  try {
    // Fetch all relevant feeds in parallel; individual failures return []
    const entityArrays = await Promise.all(
      urls.map((url) =>
        fetchFeed(url).catch(() => {
          console.warn(`Feed failed: ${url}`)
          return [] as GtfsRealtimeBindings.transit_realtime.IFeedEntity[]
        })
      )
    )

    for (const entities of entityArrays) {
      for (const entity of entities) {
        const tu = entity.tripUpdate
        if (!tu?.trip || !tu.stopTimeUpdate) continue

        const routeId = (tu.trip.routeId as string) || ''
        const stopTimeUpdates = tu.stopTimeUpdate

        // Terminal = last stop in trip sequence
        const lastStop = stopTimeUpdates[stopTimeUpdates.length - 1]
        const terminalName = lastStop?.stopId
          ? resolveStopName(lastStop.stopId as string)
          : routeId

        for (const stu of stopTimeUpdates) {
          const fullStopId = stu.stopId as string
          if (!fullStopId) continue

          const { base, direction } = parseStopId(fullStopId)
          if (!stationStopIds.has(base)) continue

          const arrTime = Number(stu.arrival?.time || stu.departure?.time || 0)
          if (arrTime === 0 || arrTime < now - 30) continue

          const arrival: TrainArrival = {
            route: routeId,
            direction,
            stopId: fullStopId,
            arrivalTime: arrTime,
            terminal: terminalName,
          }

          if (direction === 'N') {
            result.north.push(arrival)
          } else {
            result.south.push(arrival)
          }
        }
      }
    }

    result.north.sort((a: TrainArrival, b: TrainArrival) => a.arrivalTime - b.arrivalTime)
    result.south.sort((a: TrainArrival, b: TrainArrival) => a.arrivalTime - b.arrivalTime)
  } catch (err) {
    console.error('Failed to fetch arrivals:', err)
  }

  return result
}
