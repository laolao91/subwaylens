/**
 * GPS location + distance calculation helpers.
 * Uses WebView's navigator.geolocation API.
 */

import type { Station } from './types'

export interface LatLng {
  lat: number
  lng: number
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
 * Get current GPS position. Returns null if unavailable or denied.
 */
export function getCurrentPosition(): Promise<LatLng | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      () => {
        resolve(null)
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    )
  })
}
