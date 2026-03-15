/**
 * Station search — filters all MTA stations by name.
 * Includes search aliases for common names that differ from official MTA names.
 */

import stationsData from '../data/stations.json'
import type { Station } from '../lib/types'

const allStations = stationsData as Station[]

/**
 * Search aliases — common names that differ from official MTA station names.
 * Maps alias substrings to station IDs.
 */
const SEARCH_ALIASES: Array<{ keywords: string[]; stationId: string }> = [
  { keywords: ['world trade', 'wtc', 'oculus'], stationId: '624' },  // Chambers St (A,C,E,R,W,2,3)
  { keywords: ['penn station', 'penn sta'], stationId: '318' },       // 34 St-Penn Station (1,2,3)
  { keywords: ['grand central', 'gct'], stationId: '610' },          // Grand Central-42 St
  { keywords: ['barclays', 'barclay'], stationId: '617' },           // Atlantic Av-Barclays Ctr
  { keywords: ['hudson yards'], stationId: '471' },                   // 34 St-Hudson Yards
  { keywords: ['jackson heights', 'jackson hts'], stationId: '616' }, // 74 St-Broadway
  { keywords: ['rockefeller', 'rock center'], stationId: '225' },    // 47-50 Sts-Rockefeller Ctr
]

/**
 * Search stations by name (case-insensitive substring match).
 * Also checks search aliases for common alternate names.
 * Returns up to `limit` results.
 */
export function searchStations(
  query: string,
  limit = 20
): Station[] {
  if (!query.trim()) return []
  const q = query.toLowerCase().trim()
  const results: Station[] = []
  const addedIds = new Set<string>()

  // Check aliases first
  for (const alias of SEARCH_ALIASES) {
    if (alias.keywords.some((kw) => kw.includes(q) || q.includes(kw))) {
      const s = allStations.find((st) => st.id === alias.stationId)
      if (s && !addedIds.has(s.id)) {
        results.push(s)
        addedIds.add(s.id)
      }
    }
  }

  // Then search by station name
  for (const s of allStations) {
    if (addedIds.has(s.id)) continue
    if (s.name.toLowerCase().includes(q)) {
      results.push(s)
      addedIds.add(s.id)
      if (results.length >= limit) break
    }
  }
  return results
}

/**
 * Get a station by ID.
 */
export function getStation(id: string): Station | undefined {
  return allStations.find((s) => s.id === id)
}
