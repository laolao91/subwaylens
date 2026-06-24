# SubwayLens v1.8.1 — Feature Batch: Device Awareness, Outage Indicator, LIRR/MNR

**Date:** 2026-06-23
**Approved by:** Steven (per inline Q&A this session — all four design questions answered with the recommended option)
**Builds on:** `HANDOFF_v1.8.1.md` (2026-06-22 cleanup pass) and the follow-up review documented in `[[project-subwaylens-v1.8.1]]` memory. Does not re-derive that work.

This is a batch of three independent sub-projects, approved together but implementable and committable independently. None of them touch `renderBody()`'s existing N/S subway layout, container dimensions, or any behavior Steven asked to preserve from v1.6.x.

**Standing constraint carried over from prior reviews:** no `git commit`, `git push`, or `.ehpk` build without Steven's explicit go-ahead. All three sub-projects will be implemented and verified (build + tests green) but left as uncommitted working-tree changes, same as the current state of `HANDOFF_v1.8.1.md`'s fixes.

**Explicitly out of scope (confirmed during this session, not oversights):** multi-city/BART/MBTA, a region-picker UI or `AppSettings.regionId`, schedule fallback, big-number/glance mode, leave-by times. Do not reintroduce any of these as side effects of the work below.

---

## Sub-project A — Connection/wear-aware auto-refresh

**Goal:** Stop burning MTA fetches and battery refreshing a display nobody can see (glasses disconnected or sitting in the case/not worn).

**Architecture:** `src/main.ts`'s `startGlassesMode()` subscribes once to `bridge.onDeviceStatusChanged` alongside its existing `setupInput()`/`startAutoRefresh()` wiring, storing the latest `DeviceStatus` in a module-level variable (`lastDeviceStatus`, mirroring the existing pattern for `inputUnsub`). `refreshInPlace()`'s timer-driven path (not the tap-triggered manual path — a manual tap is explicit user intent and should always work) checks `lastDeviceStatus` before fetching: skip the tick if `connectType !== 'connected'` or `isWearing === false`. No new files.

**Data flow:** `onDeviceStatusChanged` callback fires on connect/disconnect/wear-state changes → updates `lastDeviceStatus` → next `setInterval` tick reads it before deciding whether to fetch. No change to what's rendered or when manual refresh happens.

**Error handling:** `DeviceStatus.isWearing`/`connectType` are optional in the SDK types (confirmed: `isWearing?: boolean`). Treat `undefined` as "don't skip" (fail open to the current always-refresh behavior) — never suppress a refresh based on absence of data, only on an explicit `disconnected`/`false` signal.

**Testing:** Unit test in `main.test.ts` (new file — `main.ts` currently has no dedicated test file; this is the first behavior in it worth isolating) mocking `bridge.onDeviceStatusChanged` to fire status changes and asserting `refreshInPlace` is/isn't invoked by the timer accordingly. Existing 34 tests must stay green.

---

## Sub-project B — Equipment-outage `!` header indicator

**Goal:** Ship the feature accepted in `DESIGN-v1.7.0.md` #4 — header marker only, no banner row, reuse the existing tap-to-alerts toggle.

**Architecture:**
- New `src/data/outages.ts`, structurally mirroring `src/data/alerts.ts` (fetch + 60s cache + 8s `AbortController` timeout, same shape). Exports `fetchOutages(): Promise<Map<string, EquipmentOutage[]>>` keyed by station complex ID, plus `stationHasOutage(outages, stationId): boolean`.
- `EquipmentOutage { stationComplexId: string; equipmentType: 'EL' | 'ES'; description: string; estimatedReturn?: string }` in `src/lib/types.ts`.
- `renderHeader()` (`src/glasses/display.ts`) gains an optional `hasOutage: boolean` parameter; when true, appends `!` after the existing favorite star (`125 St ★!`). One character, zero new rows — matches the accepted constraint exactly.
- `renderAlertSummary()` merges outage entries in as `[ELEV]`/`[ESC]`-badged lines using the same per-entry layout as `[ROUTE]` alerts, sorted above them (outages are usually more actionable than a service alert). `routeIdsFromArrivals`-style lookup is replaced with a direct station-ID lookup for this data source since outages aren't route-keyed.
- `main.ts` fetches outages on the same refresh cadence as alerts (already-existing `refreshAlerts()` call site) and passes the result into both render calls.

**Data flow / external dependency — researched, not guessed:** The original 2026-06-09 design assumed this feed lived on the already-whitelisted `api-endpoint.mta.info` host; that assumption is **wrong**. Web research this session found the real MTA elevator/escalator data lives on a separate legacy host, `advisory.mtanyct.info`, with a confirmed "developer web service" equipment endpoint (`eedevwebsvc/allequipments.aspx`, no API key) and human-facing outage report pages (`/EEoutage/EEOutageReport.aspx?StationID=All`). I could not confirm the exact machine-readable *outages* endpoint's URL/response shape from search alone, and this sandbox's network egress is firewalled (direct `curl` to the host returned connection-refused) — verifying it requires a network-connected dev environment.

**Resolution plan (first implementation task for this sub-project, not deferred indefinitely):**
1. From a real network (dev machine, not this sandbox), hit `eedevwebsvc/allequipments.aspx` and inspect its response shape; check for a sibling outages endpoint on the same `eedevwebsvc` path (MTA's pattern pairs an equipment list with an outages list joined by equipment ID).
2. If no clean machine-readable outages feed exists, fall back to parsing `EEOutageReport.aspx?StationID=All`'s HTML — prior art exists (`jeremiak/mta-elevator-outages` scrapes this exact page).
3. **Contingency:** if neither produces a workable feed within reasonable effort, ship sub-projects A and C on their own and explicitly defer B rather than blocking the batch — this is a real possibility worth Steven knowing up front, not hidden.
4. Once confirmed, add `advisory.mtanyct.info` to `app.json`'s network permission whitelist (it is not there today — only `api-endpoint.mta.info` and `react.dev/errors/` are).

**Error handling:** Identical posture to `alerts.ts` — fetch failure returns the last good cache (or empty map on first load), never throws, never blocks rendering. A station with no outage data renders exactly as today (no `!`).

**Testing:** New `outages.test.ts` (note: `alerts.ts` itself has no dedicated test file today — confirmed, `src/` has only `display.test.ts`, `geo.test.ts`, `time.test.ts`, `search.test.ts` — so this isn't mirroring an existing test file, it's following the project's vitest-with-mocked-fetch style used in `geo.test.ts`). Covers cache/timeout/error behavior the same way `outages.ts` mirrors `alerts.ts`'s implementation. `display.test.ts` gains cases for `renderHeader` with/without `hasOutage` and `renderAlertSummary` with outage entries merged above route alerts.

---

## Sub-project C — LIRR / Metro-North departure boards

**Goal:** Full LIRR + Metro-North station support, shown by default alongside subway stations, without rebuilding any multi-region scaffolding.

**Architecture (minimal-scope, per this session's decision):**
- `src/lib/types.ts`: add `Station.system?: 'lirr' | 'mnr'` (absent/undefined = NYC subway, preserving every existing station object as-is) and `TrainArrival.track?: string`.
- `src/data/railroad-track.ts`: **ported as-is** from `SubwayLens_v1.7.0/src/data/railroad-track.ts` — it's a pure wire-level protobuf decoder (MTA Railroad GTFS-RT extension field 1005) with zero UI/state coupling, already verified against a live LIRR capture. No changes needed, just copy + add its existing test fixture.
- `src/data/arrivals-commuter.ts` (new, named to stay distinct from the existing subway-specific `mta-feeds.ts` rather than generalizing it): fetches the two feeds below, decodes via `gtfs-realtime-bindings` + `railroad-track.ts`, matches `stopTimeUpdate.stopId` directly against `station.stops` (GTFS `direction_id` strategy — no stop-suffix parsing, that's subway-specific), tags `arrival.track` from the decoded map.
  - LIRR: `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr%2Fgtfs-lirr`
  - MNR: `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/mnr%2Fgtfs-mnr`
  - Both confirmed keyless and already under the whitelisted `api-endpoint.mta.info` host — no manifest change needed for this sub-project (unlike B).
- Station data: **v1.8.1 does not have a station-pack generator today** (confirmed — `scripts/` doesn't exist in this codebase; it's specific to the shelved v1.7.0 branch). Rather than rebuild it from scratch, port from `SubwayLens_v1.7.0`: the generator script (`scripts/generate-stations.mjs`) **and** its already-generated, already-verified output (`src/data/packs/lirr.json`, `mnr.json` — confirmed present on disk, generated and spot-checked 2026-06-09 against Penn Station LIRR / Grand Central MNR / Jamaica). Static GTFS station lists change rarely enough that these don't need regenerating just to land this feature; the script comes along so they *can* be regenerated later if MTA restructures a line. Loaded unconditionally at startup alongside the bundled subway list (no settings toggle, no region concept — they're just more entries in `allStations`/`stationById`).
- `src/glasses/display.ts`: new `renderDepartureBoard(station, arrivals)` function, used only when `station.system` is set. Existing `renderBody()` is not modified — `main.ts`'s render call branches once (`station.system ? renderDepartureBoard(...) : renderBody(...)`) and that branch point is the *only* change touching the subway rendering path. Layout per the validated v1.7.0 mockup:
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
  Max 6 entries, sorted by time, terminal column shrinks 15→12 chars if any route badge exceeds 3 chars (same rule as the original design).
- Search (`src/settings/search.ts`/`StationSearch.tsx`) and favorites need no code changes — they already operate on `allStations`/`stationById` generically by station object, so LIRR/MNR stations appear automatically once loaded into those maps.
- Auto-refresh floor: LIRR/MNR feeds are lean (confirmed keyless, not in the "heavy feed" tier that required the 60s floor for MBTA/MSP/MARTA in the original plan), so no change to `refreshInterval` handling is needed.

**Error handling:** A LIRR/MNR feed failure renders the existing "No live data" empty state within `renderDepartureBoard` (same posture as subway's empty state in `renderBody`) — no special-casing needed.

**Testing:** `arrivals-commuter.test.ts` using a captured LIRR protobuf fixture (the v1.7.0 fixture at `src/data/__fixtures__/lirr.pb` can be copied over — it's just captured bytes, not application logic). `display.test.ts` gains `renderDepartureBoard` cases: normal list, track-pending (`Trk --`), long-badge column shrink, empty/no-data state.

---

## Cross-cutting verification

After each sub-project: `npm run build` (clean) + `npm test` (existing 34 plus new tests, all green) before moving to the next. No `.ehpk` build, no commit, no push at any point in this batch without Steven explicitly asking for it.
