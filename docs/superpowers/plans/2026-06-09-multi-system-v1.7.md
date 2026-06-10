# SubwayLens v1.7.0 — Cleanup + LIRR/MNR + Multi-City Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship features #8 (LIRR/Metro-North departure boards) and #9 (multi-city: BART, SEPTA, RTD, MBTA, MSP, MARTA — all keyless) on top of a cleanup pass; features #4/#6/#7 deferred to next session.

**Architecture:** A `TransitSystem` registry maps each system to its feeds, station pack, layout (`directional` vs `departure-board`), and direction strategy (`stop-suffix` for MTA subway vs `direction-id` for standard GTFS). One active *region* at a time (NYC = subway+LIRR+MNR). A new feed-cache layer dedupes in-flight fetches and applies a short TTL — mandatory before heavy feeds (MARTA 794KB). Station packs are generated from static GTFS by a build script, loaded per-region via dynamic import.

**Tech Stack:** TypeScript, Vite, vitest, gtfs-realtime-bindings, Node script for GTFS static processing.

**Workspace:** `/Users/stevenlao/Claude_Code_Sandbox/EvenHub_Developer_Submissions/SubwayLens/SubwayLens_v1.7.0` (git repo, continues from v1.6.2 commit `c17ee33`)

**Constraint:** Do NOT build an .ehpk this session (user request).

---

## Verified feed endpoints (tested live 2026-06-09, all keyless)

| System | Realtime feed | Static GTFS |
|---|---|---|
| LIRR | `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr%2Fgtfs-lirr` | `http://web.mta.info/developers/data/lirr/google_transit.zip` |
| Metro-North | `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/mnr%2Fgtfs-mnr` | `http://web.mta.info/developers/data/mnr/google_transit.zip` |
| BART | `https://api.bart.gov/gtfsrt/tripupdate.aspx` | `https://www.bart.gov/dev/schedules/google_transit.zip` |
| SEPTA Regional Rail | `https://www3.septa.org/gtfsrt/septarail-pa-us/Trip/rtTripUpdates.pb` | `https://www3.septa.org/developer/gtfs_public.zip` (nested zips — use google_rail.zip) |
| Denver RTD | `https://nodejs-prod.rtd-denver.com/api/download/gtfs-rt/TripUpdate.pb` | `https://www.rtd-denver.com/files/gtfs/google_transit.zip` |
| Boston MBTA | `https://cdn.mbta.com/realtime/TripUpdates.pb` | `https://cdn.mbta.com/MBTA_GTFS.zip` |
| Minneapolis Metro | `https://svc.metrotransit.org/mtgtfs/tripupdates.pb` | `https://svc.metrotransit.org/mtgtfs/gtfs.zip` |
| Atlanta MARTA | `https://gtfs-rt.itsmarta.com/TMGTFSRealTimeWebService/tripupdate/tripupdates.pb` | `https://itsmarta.com/google_transit_feed/google_transit.zip` |

Rail filter: GTFS `route_type` 0 (light rail), 1 (subway), 2 (commuter rail). Exclude 3 (bus).

Heavy feeds (≥500KB → 60s min refresh): MBTA, MSP, MARTA. Lean: everything else (15s min stands).

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `src/main.ts` | cleanup bugs #1/#2/#5, dead code, region-aware boot |
| Modify | `src/glasses/stations.ts` | region pack loading, namespaced IDs |
| Modify | `src/glasses/display.ts` | departure-board renderer |
| Modify | `src/lib/types.ts` | `Station.system`, `dir0Label/dir1Label`, `TrainArrival.track`, `AppSettings.regionId` |
| Modify | `src/settings/SettingsApp.tsx` + `SettingsPanel.tsx` | region picker, hiddenRoutes cleanup |
| Modify | `app.json` | whitelist: api.bart.gov, www3.septa.org, nodejs-prod.rtd-denver.com, cdn.mbta.com, svc.metrotransit.org, gtfs-rt.itsmarta.com |
| Create | `src/data/feed-cache.ts` | in-flight dedupe + 10s TTL over fetchFeed |
| Create | `src/data/systems.ts` | TransitSystem registry (feeds, layout, strategy, minRefresh) |
| Create | `src/data/arrivals.ts` | system-aware arrival collection (replaces station-specific logic in mta-feeds.ts; keeps mta-feeds.ts as the NYC stop-suffix strategy) |
| Create | `src/data/packs/*.json` | generated station packs per system |
| Create | `scripts/generate-stations.mjs` | static GTFS → station pack generator |
| Create | `src/data/__fixtures__/*.pb` | captured protobuf fixtures for tests |
| Test | `src/data/feed-cache.test.ts`, `src/data/arrivals.test.ts` | new layers |

Key types (referenced by all tasks):

```ts
// types.ts additions
export interface Station {
  id: string            // namespaced for non-subway: "lirr:237", legacy bare for NYC subway
  system: string        // 'nyc-subway' | 'lirr' | 'mnr' | 'bart' | ...
  name: string
  stops: string[]       // platform/stop IDs as they appear in the realtime feed
  routes: string[]
  lat: number
  lng: number
  north: string         // dir0 label (directional layout) — unused for departure-board
  south: string         // dir1 label
}

export interface TrainArrival {
  route: string
  direction: 'N' | 'S'  // departure-board systems: always 'N' (single list)
  stopId: string
  arrivalTime: number
  terminal: string
  delay?: number
  track?: string        // LIRR/MNR track assignment when posted
}

export interface AppSettings {
  refreshInterval: number
  nearbyEnabled: boolean
  nearbyRadius: number
  hiddenRoutes: Record<string, string[]>
  regionId: string      // 'nyc' | 'sf' | 'philly' | 'denver' | 'boston' | 'msp' | 'atlanta', default 'nyc'
}

// systems.ts
export interface TransitSystem {
  id: string
  regionId: string
  name: string
  layout: 'directional' | 'departure-board'
  directionStrategy: 'stop-suffix' | 'direction-id'
  feedUrls: string[]            // realtime GTFS-RT URLs
  routeFilter?: string[]        // route IDs to include (mixed feeds); undefined = all
  minRefreshSecs: number        // 60 for MBTA/MSP/MARTA, 15 otherwise
}
export const SYSTEMS: TransitSystem[]
export const REGIONS: Array<{ id: string; name: string; systems: string[] }>
```

---

## Task 1: Cleanup pass

**Files:** `src/main.ts`, `src/settings/SettingsApp.tsx`, `package.json`

- [ ] Fix bug #1: `subwaylens:sync` handler also calls `startAutoRefresh()` so interval changes apply immediately
- [ ] Fix bug #2: `refreshInPlace()` no longer increments `displaySeq`; it captures `const seq = displaySeq` and aborts if it changed after fetch (checks only)
- [ ] Fix #5: tap-toggle back from alert view re-renders from cache (same pattern as the `stations-updated` listener) instead of replaying `lastBodyText`
- [ ] Remove dead `restoreNormalDisplay()`
- [ ] `handleToggleRoute` in SettingsApp deletes the station key when the hidden array empties
- [ ] `npm i -D @evenrealities/evenhub-simulator@latest @evenrealities/evenhub-cli@latest`
- [ ] Run `npm test` (30 pass) + `npx tsc --noEmit`, commit "chore: v1.6.x review cleanup pass"

## Task 2: Feed cache (dedupe + TTL)

**Files:** Create `src/data/feed-cache.ts`, `src/data/feed-cache.test.ts`; modify `src/data/mta-feeds.ts`

- [ ] Write failing tests: same-URL concurrent calls share one fetch (mock fetch, assert 1 call); second call within TTL returns cached without fetch; post-TTL refetches; failed fetch is not cached
- [ ] Implement:

```ts
const TTL_MS = 10_000
const cache = new Map<string, { at: number; entities: FeedEntity[] }>()
const inFlight = new Map<string, Promise<FeedEntity[]>>()

export async function fetchFeedCached(url: string): Promise<FeedEntity[]> {
  const hit = cache.get(url)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.entities
  const pending = inFlight.get(url)
  if (pending) return pending
  const p = fetchFeed(url)   // moved from mta-feeds.ts (8s abort timeout)
  inFlight.set(url, p)
  try {
    const entities = await p
    cache.set(url, { at: Date.now(), entities })
    return entities
  } finally {
    inFlight.delete(url)
  }
}
```

- [ ] `mta-feeds.ts` uses `fetchFeedCached`; `prefetchAllStations` now dedupes for free
- [ ] Tests pass, commit "perf: feed-level fetch dedupe + 10s TTL cache"

## Task 3: Protobuf fixtures + arrivals tests

**Files:** Create `src/data/__fixtures__/` (capture via `curl <feed> -o fixture.pb`), `src/data/arrivals.test.ts`

- [ ] Capture one subway feed (1-7 lines) and the LIRR feed as binary fixtures
- [ ] Tests: decode fixture → assert arrivals extracted for a known station's stop IDs, sorted ascending, direction split correct (subway), track field present-or-undefined (LIRR)
- [ ] Commit "test: protobuf fixtures for arrival parsing"

## Task 4: System registry + arrivals refactor

**Files:** Create `src/data/systems.ts`, `src/data/arrivals.ts`; modify `src/lib/types.ts`, `src/glasses/stations.ts`

- [ ] Add type fields per the Key Types block above (defaults keep NYC subway behavior: `system: 'nyc-subway'`, `regionId: 'nyc'`)
- [ ] `systems.ts`: registry with the 9 systems + 7 regions from the verified-endpoints table
- [ ] `arrivals.ts`: `getStationArrivals(station)` looks up the system, picks strategy:
  - `stop-suffix` (NYC subway): existing mta-feeds parsing, unchanged
  - `direction-id` (all others): match `stu.stopId` against `station.stops` directly (no suffix strip); direction from `tu.trip.directionId` (0→'N', 1→'S'); departure-board systems force 'N'
  - LIRR/MNR: probe `stu` for track — check `stopTimeProperties?.assignedStopId` and the MTARR extension shape on the decoded object (log first entity once in dev); set `arrival.track` when found, else leave undefined and render `Trk --`
- [ ] Route filter: drop arrivals whose `routeId` isn't in `system.routeFilter` (when defined)
- [ ] Tests from Task 3 still pass against the refactor; commit "feat: multi-system arrival collection"

## Task 5: Station pack generator

**Files:** Create `scripts/generate-stations.mjs`, generated `src/data/packs/<system>.json`

- [ ] Script: `node scripts/generate-stations.mjs <system-id> <path-to-gtfs-dir>`
  - Reads stops.txt, routes.txt, trips.txt, stop_times.txt
  - Filters routes to route_type 0/1/2 (and `routeFilter` if given)
  - Groups stops by `parent_station` (fallback: stop itself when no parent)
  - Station routes = routes whose trips stop there; dir labels = most common trip_headsign per direction_id
  - Emits `{ id: "<system>:<parent_id>", system, name, stops: [child ids], routes, lat, lng, north: dir0Label, south: dir1Label }`
- [ ] Download GTFS zips to `/tmp/gtfs/<system>/` (curl + unzip; SEPTA: unzip outer then google_rail.zip; MBTA zip is large — stop_times.txt may be 1GB+, stream line-by-line, never read whole file)
- [ ] Generate `lirr.json`, `mnr.json` first (this session's priority), verify spot stations (Penn Station LIRR, Grand Central MNR, Jamaica)
- [ ] Generate remaining: `bart.json`, `septa-rail.json`, `rtd.json`, `mbta.json`, `msp.json`, `marta.json`
- [ ] Commit script + packs "feat: station packs generated from static GTFS"

## Task 6: Departure-board renderer

**Files:** `src/glasses/display.ts`, `src/glasses/display.test.ts`

- [ ] `renderBody` branches on `system.layout === 'departure-board'`:

```
Penn Station LIRR ★           10:24a
DEPARTURES
▶[RONK] Ronkonkoma   Trk 18  12m-10:36
 [PJEF] Pt Jefferson Trk 20  +4m late
 [BABL] Babylon      Trk 15  19m-10:43
 [HEMP] Hempstead    Trk --  24m-10:48
━━━━━━━━━━━━━━━ 3/5
10:23a  tap:refresh  dbl:exit
```

  - Single list (max 6), sorted by time; route badge = first 4 chars of terminal uppercased when route IDs are numeric (LIRR route IDs are branch numbers — display branch abbreviation instead); track dim `Trk --` until posted
  - Long route badges (`[Blue]`): terminal column shrinks from 15 to 12 chars when any badge in the list exceeds 3 chars
- [ ] Unit tests for both layouts; commit "feat: departure-board layout for commuter rail"

## Task 7: Region picker + pack loading

**Files:** `src/settings/SettingsPanel.tsx`, `src/settings/SettingsApp.tsx`, `src/glasses/stations.ts`, `src/data/stations.ts`

- [ ] `stations.ts` (data): `loadRegionStations(regionId)` — dynamic-imports the packs for that region's systems + bundled NYC subway list for 'nyc'; rebuilds `allStations`/`stationById`
- [ ] Settings panel: "Transit region" radio list from `REGIONS`; changing region keeps favorites (they're namespaced — stations from other regions simply don't resolve) and dispatches `subwaylens:sync`
- [ ] Search/nearby operate on the active region's stations
- [ ] Adaptive refresh: effective interval = `max(settings.refreshInterval, max(minRefreshSecs of systems with active stations))`
- [ ] Commit "feat: region picker + per-region station packs"

## Task 8: Manifest + integration

**Files:** `app.json`, `README.md`, `CHANGELOG.md`

- [ ] Whitelist adds the 6 new hosts (LIRR/MNR already covered by api-endpoint.mta.info)
- [ ] Bump version to 1.7.0 (package.json + app.json)
- [ ] Full `npm test` + `npx tsc --noEmit` + `npm run build` (NO `npm run pack` — user constraint)
- [ ] CHANGELOG entry; commit "feat: v1.7.0 — LIRR/Metro-North + multi-city (BART, SEPTA, RTD, MBTA, MSP, MARTA)"
- [ ] Push to origin

## Deferred to next session (do NOT build now)

- #4 equipment outage indicator, #6 schedule fallback, #7 big-number mode (see `docs/DESIGN-v1.7.0.md`)
- .ehpk packaging
- LIRR track-number extension verification on real hardware if the decoded feed doesn't expose it
