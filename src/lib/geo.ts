/**
 * GPS location + distance calculation helpers.
 *
 * Tries the Even Hub bridge's native getAppLocation() first — it talks
 * directly to the host app over the same channel used for storage/display
 * calls, so it isn't subject to the WebView geolocation-permission-forwarding
 * gap that blocks navigator.geolocation on sideloaded/QR-installed Android
 * builds. Falls back to navigator.geolocation when no bridge is connected
 * (plain browser / simulator preview).
 */

import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { AppLocationAccuracy } from '@evenrealities/even_hub_sdk'
import type { Station } from './types'

export interface LatLng {
  lat: number
  lng: number
}

let bridge: EvenAppBridge | null = null

export function initGeo(b: EvenAppBridge): void {
  bridge = b
}

/**
 * Haversine distance between two points, in miles.
 */
export function distanceMiles(a: LatLng, b: LatLng): number {
  const R = 3958.8 // Earth radius in miles
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng
  return 2 * R * Math.asin(Math.sqrt(h))
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/**
 * Find stations within a given radius (miles) of a location.
 * Returns stations sorted by distance (nearest first).
 */
export function nearbyStations(
  location: LatLng,
  allStations: Station[],
  radiusMiles: number
): Array<{ station: Station; distance: number }> {
  const results: Array<{ station: Station; distance: number }> = []
  for (const s of allStations) {
    const d = distanceMiles(location, { lat: s.lat, lng: s.lng })
    if (d <= radiusMiles) {
      results.push({ station: s, distance: d })
    }
  }
  results.sort((a, b) => a.distance - b.distance)
  return results
}

/**
 * Error codes from a failed geolocation request.
 * 'permission-denied': user denied OR (on Android) the EvenHub WebView didn't
 *   forward the host app's location permission. Prompting the user to
 *   force-quit and reopen often resolves it on sideloaded builds.
 * 'unavailable': GPS hardware or network location unavailable.
 * 'timeout': device didn't return a fix within the timeout window.
 */
export type GeoError = 'permission-denied' | 'unavailable' | 'timeout'

/**
 * Ask the bridge for a fix. Returns null (rather than throwing) on any
 * failure so callers fall through to the navigator.geolocation path.
 */
async function getPositionFromBridge(): Promise<LatLng | null> {
  if (!bridge) return null
  try {
    const fix = await bridge.getAppLocation({
      accuracy: AppLocationAccuracy.Medium,
      timeoutMs: 10000,
    })
    if (!fix) return null
    return { lat: fix.latitude, lng: fix.longitude }
  } catch {
    return null
  }
}

/**
 * navigator.geolocation fallback, used when no bridge is connected.
 * maximumAge:60000 allows the device to return a cached fix rather than
 * waiting for a fresh GPS lock — critical on Android where a cold GPS can
 * take 10+ seconds.
 */
function getPositionFromBrowser(): Promise<LatLng | GeoError> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve('unavailable')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      (err) => {
        if (err.code === 1 /* PERMISSION_DENIED */) resolve('permission-denied')
        else if (err.code === 2 /* POSITION_UNAVAILABLE */) resolve('unavailable')
        else resolve('timeout')
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    )
  })
}

/**
 * Get current GPS position with typed error. Tries the bridge first; only
 * falls back to the browser API (and its permission-denied/timeout detail)
 * when the bridge is unavailable or returns no fix.
 */
export async function getCurrentPositionDetailed(): Promise<LatLng | GeoError> {
  const viaBridge = await getPositionFromBridge()
  if (viaBridge) return viaBridge
  return getPositionFromBrowser()
}

/**
 * Get current GPS position. Returns null if unavailable or denied.
 * Used by the glasses-side loader where errors are silently ignored.
 */
export function getCurrentPosition(): Promise<LatLng | null> {
  return getCurrentPositionDetailed().then((r) =>
    typeof r === 'string' ? null : r
  )
}
