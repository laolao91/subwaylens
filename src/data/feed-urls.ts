/**
 * MTA GTFS-RT feed URLs per line group.
 * Each feed covers a set of subway routes.
 * No API key required (public since 2023).
 */

const MTA_BASE = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs'

export interface FeedInfo {
  url: string
  routes: string[]
}

export const FEEDS: FeedInfo[] = [
  { url: `${MTA_BASE}-ace`, routes: ['A', 'C', 'E'] },
  { url: `${MTA_BASE}-bdfm`, routes: ['B', 'D', 'F', 'M'] },
  { url: `${MTA_BASE}-g`, routes: ['G'] },
  { url: `${MTA_BASE}-jz`, routes: ['J', 'Z'] },
  { url: `${MTA_BASE}-nqrw`, routes: ['N', 'Q', 'R', 'W'] },
  { url: `${MTA_BASE}-l`, routes: ['L'] },
  { url: `${MTA_BASE}`, routes: ['1', '2', '3', '4', '5', '6', '7'] },
  { url: `${MTA_BASE}-si`, routes: ['SIR'] },
]

/** Map route letter -> feed URL for quick lookup */
export const ROUTE_TO_FEED = new Map<string, string>()
for (const feed of FEEDS) {
  for (const route of feed.routes) {
    ROUTE_TO_FEED.set(route, feed.url)
  }
}

/**
 * Given a set of route letters, return the unique feed URLs needed.
 */
export function feedUrlsForRoutes(routes: string[]): string[] {
  const urls = new Set<string>()
  for (const r of routes) {
    const url = ROUTE_TO_FEED.get(r)
    if (url) urls.add(url)
  }
  return Array.from(urls)
}
