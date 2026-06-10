/**
 * Station manager.
 *
 * Manages the active station list (favorites + nearby GPS stations),
 * cycling between them, and fetching arrivals.
 */
import { allStations, stationById } from '../data/stations'
import { getStationArrivals } from '../data/mta-feeds'
import { fetchAlerts } from '../data/alerts'
import { getFavorites, getSettings } from '../lib/storage'
import { getCurrentPosition, nearbyStations } from '../lib/geo'
import type { Station, StationArrivals, AppSettings } from '../lib/types'
import type { RouteAlert } from '../data/alerts'

export interface StationManagerState {
  /** Ordered list of active stations (favorites + nearby) */
  stations: Station[]
  /** Which stations are favorites (vs GPS-nearby) */
  favoriteIds: Set<string>
  /** Current station index */
  currentIndex: number
  /** Cached arrivals per station ID */
  arrivals: Map<string, StationArrivals>
  /** Cached service alerts per route ID */
  alerts: Map<string, RouteAlert[]>
}

let state: StationManagerState = {
  stations: [],
  favoriteIds: new Set(),
  currentIndex: 0,
  arrivals: new Map(),
  alerts: new Map(),
}

// Cached settings so route-filter lookups don't require async reads on every display call.
// Updated whenever loadStations() runs.
let cachedSettings: AppSettings | null = null

/**
 * Returns a shallow copy of state so callers cannot accidentally mutate
 * the top-level fields. Note: arrivals and alerts Maps are still shared
 * references — treat them as read-only.
 */
export function getState(): StationManagerState {
  return { ...state }
}

/**
 * Load favorites and rebuild the station list. Favorites are published
 * immediately — the display must never wait on GPS. Nearby stations
 * (when enabled) resolve in the background: a cold Android GPS fix can
 * take 10+ seconds, and blocking on it delayed redisplay of favorites
 * that don't need GPS at all. When nearby stations arrive, the
 * 'subwaylens:stations-updated' event fires so the display can re-render.
 */
export async function loadStations(): Promise<void> {
  const favIds = await getFavorites()
  const settings = await getSettings()
  cachedSettings = settings
  state.favoriteIds = new Set(favIds)

  // Start with favorites in saved order
  const stationList: Station[] = []
  for (const id of favIds) {
    const s = stationById.get(id)
    if (s) stationList.push(s)
  }

  state.stations = stationList
  clampIndex()

  // Nearby stations append in the background — never awaited here.
  if (settings.nearbyEnabled) {
    void appendNearbyStations(settings.nearbyRadius)
  }
}

/**
 * Resolve GPS and append in-radius stations to the active list.
 * Skips favorites and anything already present (guards against a second
 * loadStations() racing a still-in-flight append). Notifies listeners
 * via 'subwaylens:stations-updated' only when the list actually grew.
 */
async function appendNearbyStations(radiusMiles: number): Promise<void> {
  const pos = await getCurrentPosition()
  if (!pos) return
  const nearby = nearbyStations(pos, allStations, radiusMiles)
  const existing = new Set(state.stations.map((s) => s.id))
  const additions = nearby
    .map(({ station }) => station)
    .filter((s) => !state.favoriteIds.has(s.id) && !existing.has(s.id))
  if (additions.length === 0) return
  state.stations = [...state.stations, ...additions]
  window.dispatchEvent(new CustomEvent('subwaylens:stations-updated'))
}

function clampIndex(): void {
  if (state.currentIndex >= state.stations.length) {
    state.currentIndex = Math.max(0, state.stations.length - 1)
  }
}

/**
 * Fetch and cache service alerts for all routes.
 * Called alongside refreshCurrentArrivals().
 */
export async function refreshAlerts(): Promise<Map<string, RouteAlert[]>> {
  const alerts = await fetchAlerts()
  state.alerts = alerts
  return alerts
}

/**
 * Get the current cached alerts map.
 */
export function getCachedAlerts(): Map<string, RouteAlert[]> {
  return state.alerts
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
 * Prefetch arrivals for all active stations in parallel and populate the cache.
 * Called on startup and on foreground re-enter so scroll is instant (no Loading...).
 * Individual station failures are swallowed — they'll be retried on next refresh.
 */
export async function prefetchAllStations(): Promise<void> {
  if (state.stations.length === 0) return
  await Promise.all(
    state.stations.map(async (station) => {
      try {
        const arrivals = await getStationArrivals(station)
        state.arrivals.set(station.id, arrivals)
      } catch {
        // Silently skip — stale or empty cache is fine
      }
    })
  )
}

/**
 * Return a copy of arrivals with hidden routes filtered out for the given station.
 */
export function applyRouteFilter(
  arrivals: StationArrivals,
  stationId: string
): StationArrivals {
  const hidden = new Set(cachedSettings?.hiddenRoutes?.[stationId] ?? [])
  if (hidden.size === 0) return arrivals
  return {
    ...arrivals,
    north: arrivals.north.filter((t) => !hidden.has(t.route)),
    south: arrivals.south.filter((t) => !hidden.has(t.route)),
  }
}

/**
 * Get the set of hidden route IDs for a station (from cached settings).
 */
export function getHiddenRouteSet(stationId: string): Set<string> {
  return new Set(cachedSettings?.hiddenRoutes?.[stationId] ?? [])
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
