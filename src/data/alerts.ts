/**
 * MTA service alerts fetcher and parser.
 *
 * Fetches the GTFS-RT subway alerts feed, decodes the protobuf,
 * and returns active alerts keyed by affected route ID.
 *
 * Uses the same gtfs-realtime-bindings library as mta-feeds.ts.
 * HEAD requests are rejected by MTA (403) — uses GET + AbortController.
 */

import { transit_realtime } from 'gtfs-realtime-bindings'
import { ALERTS_FEED_URL } from './feed-urls'

export interface RouteAlert {
  /** Route ID this alert applies to, e.g. "E", "F" */
  routeId: string
  /** Short header text, already truncated for display */
  headerText: string
  /** GTFS-RT effect enum value — lower = more severe (NO_SERVICE=1, REDUCED_SERVICE=2, ...) */
  effect: number
}

// GTFS-RT Alert.Effect enum values for severity sorting
const EFFECT_NO_SERVICE = 1
const EFFECT_UNKNOWN = 8

/** Cache: last fetched alerts per route */
let cachedAlerts: Map<string, RouteAlert[]> = new Map()
let lastFetchedAt = 0
const CACHE_TTL_MS = 60_000 // 1 minute

/**
 * Fetch and parse active MTA service alerts.
 * Returns a Map of routeId -> RouteAlert[].
 * Results are cached for CACHE_TTL_MS to avoid redundant fetches.
 */
export async function fetchAlerts(): Promise<Map<string, RouteAlert[]>> {
  const now = Date.now()
  if (now - lastFetchedAt < CACHE_TTL_MS) {
    return cachedAlerts
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const response = await fetch(ALERTS_FEED_URL, {
      signal: controller.signal,
      headers: { 'Cache-Control': 'no-cache' },
    })
    clearTimeout(timeout)

    if (!response.ok) {
      console.warn('Alerts feed returned', response.status)
      return cachedAlerts
    }

    const buffer = await response.arrayBuffer()
    const feed = transit_realtime.FeedMessage.decode(new Uint8Array(buffer))

    const nowSecs = Math.floor(now / 1000)
    const result = new Map<string, RouteAlert[]>()

    for (const entity of feed.entity) {
      const alert = entity.alert
      if (!alert) continue

      // Check if alert is currently active
      const periods = alert.activePeriod ?? []
      const isActive =
        periods.length === 0 ||
        periods.some(p => {
          const start = p.start ? Number(p.start) : 0
          const end = p.end ? Number(p.end) : Infinity
          return nowSecs >= start && nowSecs <= end
        })
      if (!isActive) continue

      // Extract header text
      const translations = alert.headerText?.translation ?? []
      const english = translations.find(t => t.language === 'en') ?? translations[0]
      const rawHeader = english?.text ?? ''
      if (!rawHeader) continue

      // Truncate header for G2 display (~60 chars max per alert line)
      const headerText =
        rawHeader.length > 60 ? rawHeader.slice(0, 59) + '.' : rawHeader

      const effect = Number(alert.effect ?? EFFECT_UNKNOWN)

      // Map to affected routes — collect all alerts per route, sort by severity later
      const entities = alert.informedEntity ?? []
      for (const e of entities) {
        const routeId = e.routeId
        if (!routeId) continue
        const existing = result.get(routeId) ?? []
        existing.push({ routeId, headerText, effect })
        result.set(routeId, existing)
      }
    }

    // Sort each route's alerts: NO_SERVICE first, then by ascending effect value
    for (const [routeId, list] of result) {
      list.sort((a, b) => {
        if (a.effect === EFFECT_NO_SERVICE && b.effect !== EFFECT_NO_SERVICE) return -1
        if (b.effect === EFFECT_NO_SERVICE && a.effect !== EFFECT_NO_SERVICE) return 1
        return a.effect - b.effect
      })
      result.set(routeId, list)
    }

    cachedAlerts = result
    lastFetchedAt = now
    return result
  } catch (err) {
    console.warn('Failed to fetch alerts:', err)
    return cachedAlerts
  }
}

/**
 * Check if a given route has an active alert.
 */
export function routeHasAlert(
  alerts: Map<string, RouteAlert[]>,
  routeId: string
): boolean {
  return (alerts.get(routeId)?.length ?? 0) > 0
}

/**
 * Get alerts that affect any of the given routes.
 * Returns deduplicated list ordered by routeId.
 */
export function alertsForRoutes(
  alerts: Map<string, RouteAlert[]>,
  routeIds: string[]
): RouteAlert[] {
  const seen = new Set<string>()
  const result: RouteAlert[] = []
  for (const id of routeIds) {
    const list = alerts.get(id) ?? []
    for (const a of list) {
      if (!seen.has(a.routeId)) {
        seen.add(a.routeId)
        result.push(a)
      }
    }
  }
  return result
}
