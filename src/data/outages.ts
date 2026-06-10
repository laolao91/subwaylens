/**
 * MTA elevator/escalator outage feed (NYC subway only).
 *
 * Endpoint: nyct_ene.json on the same keyless api-endpoint.mta.info host
 * as the GTFS-RT feeds (verified 2026-06-10, ~54KB, ~130 records).
 *
 * Records carry free-text station names ("Jackson Hts-Roosevelt Av") that
 * don't exactly match our pack names, so matching is two-factor:
 * normalized-name equality AND route overlap from the `trainno` field.
 * Either factor alone produces false positives (multiple "125 St"
 * stations on different lines); together they're reliable.
 *
 * Per design (docs/DESIGN-v1.7.0.md): outages NEVER add display rows —
 * they surface as a header `!` marker and as [ELEV]/[ESC] entries inside
 * the existing tap-to-view alert summary.
 */

import type { Station } from '../lib/types'

export interface EquipmentOutage {
  /** Free-text station name from the feed. */
  station: string
  /** Routes serving the equipment, parsed from trainno ("E/F/M/R/7"). */
  routes: string[]
  /** 'EL' elevator | 'ES' escalator */
  equipmentType: 'EL' | 'ES'
  /** What the equipment connects ("61 St & Roosevelt Ave to mezzanine"). */
  serving: string
  /** Estimated return to service, free text from feed. */
  estimatedReturn: string
}

const OUTAGES_URL =
  'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fnyct_ene.json'
const CACHE_TTL_MS = 5 * 60_000 // equipment status moves slowly
const FETCH_TIMEOUT_MS = 8000

let cachedOutages: EquipmentOutage[] = []
let lastFetchedAt = 0

interface RawOutageRecord {
  station?: string
  trainno?: string
  equipmenttype?: string
  serving?: string
  estimatedreturntoservice?: string
  isupcomingoutage?: string
}

/**
 * Fetch current outages (cached 5 min). Failures return the last good
 * list — equipment status is advisory, never worth blocking on.
 */
export async function fetchOutages(): Promise<EquipmentOutage[]> {
  const now = Date.now()
  if (now - lastFetchedAt < CACHE_TTL_MS) return cachedOutages

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    const response = await fetch(OUTAGES_URL, { signal: controller.signal })
    clearTimeout(timeout)
    if (!response.ok) return cachedOutages

    const raw = await response.json() as RawOutageRecord[]
    if (!Array.isArray(raw)) return cachedOutages

    cachedOutages = raw
      .filter((r) =>
        (r.equipmenttype === 'EL' || r.equipmenttype === 'ES') &&
        r.isupcomingoutage !== 'Y' &&
        r.station
      )
      .map((r) => ({
        station: r.station!,
        routes: (r.trainno ?? '')
          .split('/')
          .map((t) => t.trim())
          .filter((t) => t && t !== 'LIRR' && t !== 'MNR'), // subway routes only
        equipmentType: r.equipmenttype as 'EL' | 'ES',
        serving: r.serving ?? '',
        estimatedReturn: r.estimatedreturntoservice ?? '',
      }))
    lastFetchedAt = now
    return cachedOutages
  } catch (err) {
    console.warn('Failed to fetch outages:', err)
    return cachedOutages
  }
}

/** Test hook. */
export function clearOutageCache(): void {
  cachedOutages = []
  lastFetchedAt = 0
}

/**
 * Normalize a station name for matching: lowercase, expand common
 * abbreviations, strip ordinals/punctuation.
 * "Jackson Hts-Roosevelt Av" and "Jackson Heights-Roosevelt Avenue"
 * both normalize to "jackson heights roosevelt avenue".
 */
export function normalizeStationName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(\d+)(st|nd|rd|th)\b/g, '$1')
    .replace(/[-/()]/g, ' ')
    .replace(/\bsts\b/g, 'streets')
    .replace(/\bst\b/g, 'street')
    .replace(/\bav(e)?\b/g, 'avenue')
    .replace(/\bavs\b/g, 'avenues')
    .replace(/\bhts\b/g, 'heights')
    .replace(/\bsq\b/g, 'square')
    .replace(/\bctr\b/g, 'center')
    .replace(/\bpkwy\b/g, 'parkway')
    .replace(/\bblvd\b/g, 'boulevard')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Outages affecting a given station: normalized names must match AND at
 * least one route must overlap (when both sides have routes). NYC subway
 * stations only — the feed doesn't cover other systems.
 */
export function outagesForStation(
  station: Station,
  outages: EquipmentOutage[]
): EquipmentOutage[] {
  if (station.system && station.system !== 'nyc-subway') return []
  const target = normalizeStationName(station.name)
  const stationRoutes = new Set(station.routes)
  return outages.filter((o) => {
    if (normalizeStationName(o.station) !== target) return false
    if (o.routes.length === 0 || stationRoutes.size === 0) return true
    return o.routes.some((r) => stationRoutes.has(r))
  })
}
