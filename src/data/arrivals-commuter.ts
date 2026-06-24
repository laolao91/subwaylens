/**
 * LIRR / Metro-North arrival fetcher and protobuf decoder.
 *
 * Separate module from mta-feeds.ts (subway) because the direction
 * strategy is fundamentally different:
 *   - Subway (mta-feeds.ts): direction encoded in the stop ID suffix
 *     (A03N/A03S), one feed shared by multiple routes.
 *   - Commuter rail (this module): standard GTFS-RT — match
 *     stopTimeUpdate.stopId directly against station.stops, one feed
 *     per system. Everything collapses into a single time-sorted list
 *     (the `north` array of StationArrivals) since departure boards
 *     don't have a north/south split — `south` is always empty here.
 *
 * Track numbers ride the MTA Railroad GTFS-RT extension and are decoded
 * via railroad-track.ts's raw-bytes walk (gtfs-realtime-bindings doesn't
 * know about this extension field).
 */

import GtfsRealtimeBindings from 'gtfs-realtime-bindings'
import { extractTrackMap } from './railroad-track'
import lirrPack from './packs/lirr.json'
import mnrPack from './packs/mnr.json'
import type { Station, TrainArrival, StationArrivals } from '../lib/types'

const FEED_TIMEOUT_MS = 8000

const LIRR_FEED_URL =
  'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr%2Fgtfs-lirr'
const MNR_FEED_URL =
  'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/mnr%2Fgtfs-mnr'

const FEED_URL_BY_SYSTEM: Record<'lirr' | 'mnr', string> = {
  lirr: LIRR_FEED_URL,
  mnr: MNR_FEED_URL,
}

const ROUTE_DISPLAY_BY_SYSTEM: Record<'lirr' | 'mnr', Record<string, string>> = {
  lirr: lirrPack.routeDisplay as Record<string, string>,
  mnr: mnrPack.routeDisplay as Record<string, string>,
}

// Stop ID -> station name lookup, built per system from the loaded packs.
// Built once at module load (packs are static, loaded unconditionally).
const STOP_NAMES_BY_SYSTEM: Record<'lirr' | 'mnr', Map<string, string>> = {
  lirr: buildStopNames(lirrPack.stations as Station[]),
  mnr: buildStopNames(mnrPack.stations as Station[]),
}

function buildStopNames(stations: Station[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const st of stations) {
    for (const sid of st.stops) map.set(sid, st.name)
  }
  return map
}

/**
 * Display label for a route ID within a commuter-rail system.
 * Falls back to the raw route ID for unknown routes.
 */
export function routeDisplayName(system: 'lirr' | 'mnr', routeId: string): string {
  return ROUTE_DISPLAY_BY_SYSTEM[system]?.[routeId] ?? routeId
}

interface RawFeed {
  entities: GtfsRealtimeBindings.transit_realtime.IFeedEntity[]
  raw: Uint8Array
}

/**
 * Fetch and decode a single GTFS-RT feed, keeping the raw bytes around
 * for extractTrackMap (which needs wire-level access mta-feeds.ts's
 * fetchFeed doesn't preserve).
 * Aborts after FEED_TIMEOUT_MS to prevent hung requests blocking refresh.
 */
async function fetchRawFeed(url: string): Promise<RawFeed> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error(`Feed ${response.status}: ${url}`)
    const buffer = await response.arrayBuffer()
    const raw = new Uint8Array(buffer)
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(raw)
    return { entities: feed.entity || [], raw }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Fetch arrivals for a LIRR/MNR station.
 * Returns empty arrivals on any failure — no mock/fake data, matching
 * mta-feeds.ts's error posture.
 */
export async function getCommuterArrivals(station: Station): Promise<StationArrivals> {
  const now = Math.floor(Date.now() / 1000)
  const result: StationArrivals = {
    stationId: station.id,
    north: [],
    south: [],
    fetchedAt: now,
  }

  const system = station.system
  if (system !== 'lirr' && system !== 'mnr') return result

  const url = FEED_URL_BY_SYSTEM[system]
  const stopNames = STOP_NAMES_BY_SYSTEM[system]
  const stationStopIds = new Set(station.stops)

  try {
    const feed = await fetchRawFeed(url).catch(() => {
      console.warn(`Feed failed: ${url}`)
      return null
    })
    if (!feed) return result

    const trackMap = extractTrackMap(feed.raw)

    for (const entity of feed.entities) {
      const tu = entity.tripUpdate
      if (!tu?.trip || !tu.stopTimeUpdate) continue

      const routeId = (tu.trip.routeId as string) || ''
      const tripId = (tu.trip.tripId as string) || ''
      const stopTimeUpdates = tu.stopTimeUpdate

      // Terminal = last stop in the trip's remaining sequence
      const lastStop = stopTimeUpdates[stopTimeUpdates.length - 1]
      const lastStopId = (lastStop?.stopId as string) || ''
      const terminalName = stopNames.get(lastStopId) ?? lastStopId ?? routeId

      for (const stu of stopTimeUpdates) {
        const stopId = stu.stopId as string
        if (!stopId || !stationStopIds.has(stopId)) continue

        const arrTime = Number(stu.arrival?.time || stu.departure?.time || 0)
        if (arrTime === 0 || arrTime < now - 30) continue

        const stopDelay = Number(stu.arrival?.delay ?? stu.departure?.delay ?? 0)

        const arrival: TrainArrival = {
          route: routeId,
          direction: 'N', // departure boards collapse to a single list
          stopId,
          arrivalTime: arrTime,
          terminal: terminalName,
          delay: stopDelay > 0 ? stopDelay : undefined,
          track: trackMap.get(`${tripId}|${stopId}`),
        }

        result.north.push(arrival)
      }
    }

    result.north.sort((a, b) => a.arrivalTime - b.arrivalTime)
  } catch (err) {
    console.error('Failed to fetch commuter-rail arrivals:', err)
  }

  return result
}
