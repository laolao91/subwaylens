/**
 * Station manager.
 *
 * Manages the active station list (favorites + nearby GPS stations),
 * cycling between them, and fetching arrivals.
 */

import stationsData from '../data/stations.json'
import { getStationArrivals } from '../data/mta-feeds'
import { getFavorites, getSettings } from '../lib/storage'
import { getCurrentPosition, nearbyStations } from '../lib/geo'
import type { Station, StationArrivals, AppSettings } from '../lib/types'

const allStations = stationsData as Station[]

// Build lookup map by station complex ID
const stationById = new Map<string, Station>()
for (const s of allStations) {
  stationById.set(s.id, s)
}

export interface StationManagerState {
  /** Ordered list of active stations (favorites + nearby) */
  stations: Station[]
  /** Which stations are favorites (vs GPS-nearby) */
  favoriteIds: Set<string>
  /** Current station index */
  currentIndex: number
  /** Cached arrivals per station ID */
  arrivals: Map<string, StationArrivals>
}

let state: StationManagerState = {
  stations: [],
  favoriteIds: new Set(),
  currentIndex: 0,
  arrivals: new Map(),
}

export function getState(): StationManagerState {
  return state
}

/**
 * Load favorites and nearby stations, rebuilding the station list.
 */
export async function loadStations(): Promise<void> {
  const favIds = await getFavorites()
  const settings = await getSettings()

  state.favoriteIds = new Set(favIds)

  // Start with favorites in saved order
  const stationList: Station[] = []
  for (const id of favIds) {
    const s = stationById.get(id)
    if (s) stationList.push(s)
  }

  // Add nearby stations if enabled
  if (settings.nearbyEnabled) {
    const pos = await getCurrentPosition()
    if (pos) {
      const nearby = nearbyStations(pos, allStations, settings.nearbyRadius)
      for (const { station } of nearby) {
        // Don't duplicate favorites
        if (!state.favoriteIds.has(station.id)) {
          stationList.push(station)
        }
      }
    }
  }

  state.stations = stationList

  // Clamp current index
  if (state.currentIndex >= stationList.length) {
    state.currentIndex = Math.max(0, stationList.length - 1)
  }
}

/**
 * Get the current station (or null if no stations).
 */
export function currentStation(): Station | null {
  if (state.stations.length === 0) return null
  return state.stations[state.currentIndex]
}

/**
 * Move to the next station. Wraps around.
 */
export function nextStation(): Station | null {
  if (state.stations.length === 0) return null
  state.currentIndex = (state.currentIndex + 1) % state.stations.length
  return state.stations[state.currentIndex]
}

/**
 * Move to the previous station. Wraps around.
 */
export function prevStation(): Station | null {
  if (state.stations.length === 0) return null
  state.currentIndex =
    (state.currentIndex - 1 + state.stations.length) % state.stations.length
  return state.stations[state.currentIndex]
}

/**
 * Fetch arrivals for the current station.
 * Caches results.
 */
export async function refreshCurrentArrivals(): Promise<StationArrivals | null> {
  const station = currentStation()
  if (!station) return null

  const arrivals = await getStationArrivals(station)
  state.arrivals.set(station.id, arrivals)
  return arrivals
}

/**
 * Get cached arrivals for a station (or null if not fetched yet).
 */
export function getCachedArrivals(
  stationId: string
): StationArrivals | null {
  return state.arrivals.get(stationId) || null
}

/**
 * Check if a station is a favorite.
 */
export function isFavorite(stationId: string): boolean {
  return state.favoriteIds.has(stationId)
}

/**
 * Get all stations for search/settings.
 */
export function getAllStations(): Station[] {
  return allStations
}

/**
 * Get a station by ID.
 */
export function getStationById(id: string): Station | undefined {
  return stationById.get(id)
}
