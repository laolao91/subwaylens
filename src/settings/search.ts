/**
 * Station search — filters all MTA stations by name.
 * Includes search aliases for common names that differ from official MTA names.
 * Now with fuzzy matching: abbreviation normalization, ordinal handling, and word-order tolerance.
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
 * Abbreviation normalization map — bidirectional equivalences for common street/location terms.
 * All keys and values are lowercase.
 */
const ABBREV_MAP: Record<string, string[]> = {
  'st': ['street'],
  'street': ['st'],
  'av': ['ave', 'avenue'],
  'ave': ['av', 'avenue'],
  'avenue': ['av', 'ave'],
  'sq': ['square'],
  'square': ['sq'],
  'blvd': ['boulevard'],
  'boulevard': ['blvd'],
  'pkwy': ['parkway'],
  'parkway': ['pkwy'],
  'ctr': ['center', 'centre'],
  'center': ['ctr', 'centre'],
  'centre': ['ctr', 'center'],
  'hts': ['heights'],
  'heights': ['hts'],
  'jct': ['junction'],
  'junction': ['jct'],
}

/**
 * Strip ordinal suffixes from numbers (e.g., "42nd" → "42", "1st" → "1").
 */
function stripOrdinals(text: string): string {
  return text.replace(/\b(\d+)(st|nd|rd|th)\b/gi, '$1')
}

/**
 * Normalize a string for fuzzy matching:
 * - Lowercase
 * - Strip ordinal suffixes (42nd → 42)
 * - Replace hyphens with spaces
 */
function normalize(text: string): string {
  return stripOrdinals(text.toLowerCase()).replace(/-/g, ' ')
}

/**
 * Expand a word with its abbreviation equivalents.
 * Returns an array containing the original word plus all its variants.
 */
function expandAbbreviations(word: string): string[] {
  const variants = ABBREV_MAP[word]
  return variants ? [word, ...variants] : [word]
}

/**
 * Check if all query words match the station name (order-independent, with abbreviation expansion).
 * Each query word must have at least one match in the station name.
 */
function fuzzyMatch(queryWords: string[], stationName: string): boolean {
  const normalizedStation = normalize(stationName)
  
  return queryWords.every((queryWord) => {
    // Expand query word to include abbreviation variants
    const variants = expandAbbreviations(queryWord)
    
    // Check if any variant appears in the station name
    return variants.some((variant) => normalizedStation.includes(variant))
  })
}

/**
 * Search stations by name (fuzzy matching with abbreviation normalization).
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

  // Check aliases first (exact substring matching for aliases)
  for (const alias of SEARCH_ALIASES) {
    if (alias.keywords.some((kw) => kw.includes(q) || q.includes(kw))) {
      const s = allStations.find((st) => st.id === alias.stationId)
      if (s && !addedIds.has(s.id)) {
        results.push(s)
        addedIds.add(s.id)
      }
    }
  }

  // Normalize and split query into words
  const normalizedQuery = normalize(q)
  const queryWords = normalizedQuery.split(/\s+/).filter(Boolean)

  // Fuzzy search by station name
  for (const s of allStations) {
    if (addedIds.has(s.id)) continue
    
    // Try exact substring match first (fast path)
    if (s.name.toLowerCase().includes(q)) {
      results.push(s)
      addedIds.add(s.id)
      if (results.length >= limit) break
      continue
    }
    
    // Fall back to fuzzy match with abbreviation expansion and word-order tolerance
    if (fuzzyMatch(queryWords, s.name)) {
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
