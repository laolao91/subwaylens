/**
 * Feed-level fetch cache: in-flight dedupe + short TTL.
 *
 * Multiple stations frequently share a GTFS-RT feed (every 1-7 train
 * station hits the same MTA URL; an entire city shares one feed for
 * BART/MBTA/etc). Before this layer, prefetchAllStations() downloaded
 * and protobuf-decoded the same feed once per station. With heavy feeds
 * (MARTA ~794KB) that is untenable.
 *
 * Two mechanisms:
 *   - In-flight dedupe: concurrent requests for one URL share a Promise.
 *   - TTL cache (10s): a tap-refresh moments after an auto-refresh
 *     reuses the decoded entities instead of re-downloading.
 *
 * Failures are never cached — the next caller retries.
 */

import GtfsRealtimeBindings from 'gtfs-realtime-bindings'

export type FeedEntity = GtfsRealtimeBindings.transit_realtime.IFeedEntity

const FEED_TIMEOUT_MS = 8000
const TTL_MS = 10_000

export interface CachedFeed {
  entities: FeedEntity[]
  /** Raw wire bytes — needed for extension fields the bindings don't decode (LIRR/MNR track). */
  raw: Uint8Array
}

const cache = new Map<string, { at: number; feed: CachedFeed }>()
const inFlight = new Map<string, Promise<CachedFeed>>()

/**
 * Fetch and decode a single GTFS-RT feed.
 * Aborts after FEED_TIMEOUT_MS to prevent hung requests blocking refresh.
 */
async function fetchFeed(url: string): Promise<CachedFeed> {
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
 * Cached feed fetch returning decoded entities + raw bytes.
 * See module docs for semantics.
 */
export async function fetchFeedWithRawCached(url: string): Promise<CachedFeed> {
  const hit = cache.get(url)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.feed

  const pending = inFlight.get(url)
  if (pending) return pending

  const p = fetchFeed(url)
  inFlight.set(url, p)
  try {
    const feed = await p
    cache.set(url, { at: Date.now(), feed })
    return feed
  } finally {
    inFlight.delete(url)
  }
}

/**
 * Cached feed fetch (entities only) — the common path.
 */
export async function fetchFeedCached(url: string): Promise<FeedEntity[]> {
  return (await fetchFeedWithRawCached(url)).entities
}

/** Test hook: reset all cache state. */
export function clearFeedCache(): void {
  cache.clear()
  inFlight.clear()
}
