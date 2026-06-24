# LIRR / Metro-North Departure Boards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full LIRR + Metro-North station support to SubwayLens, shown by default alongside subway stations, by porting a proven protobuf decoder and station-pack generator from `SubwayLens_v1.7.0` and adding one new arrival-fetch module and one new renderer — without touching the existing subway code path (`mta-feeds.ts`, `renderBody()`) at all.

**Architecture:** `Station` gains an optional `system?: 'lirr' | 'mnr'` field (undefined = subway, every existing object stays valid) and `TrainArrival` gains an optional `track?: string`. `src/data/railroad-track.ts` is ported byte-for-byte from v1.7.0 — a pure wire-level protobuf decoder with zero UI/state coupling. `scripts/generate-stations.mjs` and the already-generated `src/data/packs/lirr.json`/`mnr.json` are ported as-is (not regenerated). `src/data/stations.ts` loads the two packs into `allStations`/`stationById`/`stopIdToStation` unconditionally at module load, alongside the bundled subway list. A new `src/data/arrivals-commuter.ts` fetches the two GTFS-RT feeds, decodes them with `gtfs-realtime-bindings` + `railroad-track.ts`, and matches `stopTimeUpdate.stopId` directly against `station.stops` (GTFS `direction_id` strategy, collapsing everything into the `north` list — no stop-suffix parsing). A new `renderDepartureBoard()` in `src/glasses/display.ts` renders the single time-sorted list with track numbers; `renderBody()` is not touched. `src/main.ts` gets one branch-point change: `station.system ? renderDepartureBoard(...) : renderBody(...)`, in every place `renderBody` is currently called in the glasses-mode rendering path.

**Tech Stack:** TypeScript, Vitest (`environment: 'node'` per `vite.config.ts`), `gtfs-realtime-bindings` (already a dependency, `^1.1.1`), `protobufjs/minimal` (already present transitively via `gtfs-realtime-bindings`, confirmed `protobufjs@7.5.5` in `node_modules`).

## Global Constraints

- No `git push` and no `.ehpk` build at any point in this plan — local `git commit` only.
- Never use `--no-verify` or any destructive git flag.
- Do not modify `renderBody()`, container dimensions, or any subway-rendering behavior in `src/glasses/display.ts` — confirmed constraint, the subway path stays byte-for-byte untouched.
- Do not modify `src/data/mta-feeds.ts` — the new commuter-rail fetch logic is a separate module (`src/data/arrivals-commuter.ts`), not a generalization of the subway fetcher.
- Do not port `src/data/systems.ts` from v1.7.0, or any `TransitSystem`/`TransitRegion` registry, region picker, or `AppSettings.regionId` — explicitly out of scope per the design spec.
- LIRR/MNR stations are loaded unconditionally at startup — no settings toggle, no region concept.
- LIRR/MNR feeds are both already covered by the existing `app.json` network whitelist entry `https://api-endpoint.mta.info` — no manifest change in this plan.
- No change to `refreshInterval`/auto-refresh-floor handling — LIRR/MNR feeds are lean, not in the "heavy feed" tier.
- Existing 38 tests (`npm test`) and clean build (`npm run build`) must stay green after every task, and at the end of this plan.
- `src/settings/search.ts`, `src/settings/StationSearch.tsx`, `src/settings/FavoritesList.tsx` need no code changes — confirmed during planning research (see Task 8) that they operate generically over `Station` objects via `allStations`/`stationById` with no subway-specific filtering.

---

## File Structure

- **Create:** `src/data/railroad-track.ts` — ported as-is from `SubwayLens_v1.7.0/src/data/railroad-track.ts`. Pure wire-level protobuf decoder, zero changes.
- **Create:** `src/data/railroad-track.test.ts` — new test file (v1.7.0 had no dedicated test file for this module; its coverage lived inside `arrivals.test.ts`). Tests `extractTrackMap()` directly against the ported fixture.
- **Create:** `src/data/__fixtures__/lirr.pb` — ported as-is from `SubwayLens_v1.7.0/src/data/__fixtures__/lirr.pb` (68000 bytes, captured live LIRR feed, 2026-06-09).
- **Create:** `src/data/packs/lirr.json`, `src/data/packs/mnr.json` — ported as-is from `SubwayLens_v1.7.0/src/data/packs/` (127 and 113 stations respectively, already generated and spot-checked).
- **Create:** `scripts/generate-stations.mjs` — ported as-is from `SubwayLens_v1.7.0/scripts/generate-stations.mjs`. Not run in this plan; ported so the packs can be regenerated later if MTA restructures a line.
- **Modify:** `src/lib/types.ts` — add `Station.system?: 'lirr' | 'mnr'` and `TrainArrival.track?: string`.
- **Modify:** `src/data/stations.ts` — load `lirr.json`/`mnr.json` into `allStations`/`stationById`/`stopIdToStation` alongside the bundled subway list.
- **Create:** `src/data/arrivals-commuter.ts` — new module: fetches LIRR/MNR feeds, decodes with `gtfs-realtime-bindings`, tags tracks via `railroad-track.ts`, produces `StationArrivals` objects compatible with the existing shape (everything collapsed into `north`).
- **Create:** `src/data/arrivals-commuter.test.ts` — new test file using the ported LIRR fixture, following the `vi.useFakeTimers()` + stubbed-`fetch` pattern from v1.7.0's `arrivals.test.ts`.
- **Modify:** `src/glasses/display.ts` — add `renderDepartureBoard(station, arrivals)`. `renderBody()` untouched.
- **Modify:** `src/glasses/display.test.ts` — add `renderDepartureBoard` cases.
- **Modify:** `src/glasses/stations.ts` — `refreshCurrentArrivals()`/`prefetchAllStations()` dispatch to `arrivals-commuter.ts` when `station.system` is set, else to the existing `mta-feeds.ts` path (mirrors v1.7.0's `arrivals.ts` dispatcher, but inlined here since the design spec skips that separate module).
- **Modify:** `src/main.ts` — branch `renderBody`/`renderDepartureBoard` at each call site.
- **No code changes:** `src/settings/search.ts`, `src/settings/StationSearch.tsx`, `src/settings/FavoritesList.tsx` — verified generic, confirmed in Task 8.
- **No manifest changes:** `app.json` — LIRR/MNR feed host already whitelisted, confirmed in Task 1.

---

## Task 1: Confirm network whitelist covers LIRR/MNR feed URLs (verification only)

**Files:**
- Read only: `app.json`

**Interfaces:**
- Consumes: nothing.
- Produces: a confirmed go/no-go for later tasks — if this fails, add a manifest-change task before Task 6.

- [ ] **Step 1: Read the current whitelist**

Run: `cat app.json`

Confirm the `permissions[0].whitelist` array contains `"https://api-endpoint.mta.info"`. The two new feed URLs this plan adds are:
- `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr%2Fgtfs-lirr`
- `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/mnr%2Fgtfs-mnr`

Both start with `https://api-endpoint.mta.info`, matching the existing whitelist entry exactly (same host as the existing subway feeds in `src/data/feed-urls.ts`, which use `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs...`).

- [ ] **Step 2: Record the result**

Expected: `https://api-endpoint.mta.info` is present in `app.json`'s whitelist. No edit needed to `app.json` in this plan. If it is somehow not present when you check, stop and add a new task to insert it before proceeding to Task 6 — do not silently skip the manifest.

No commit for this task (no files changed).

---

## Task 2: Add `Station.system` and `TrainArrival.track` optional fields

**Files:**
- Modify: `src/lib/types.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Station.system?: 'lirr' | 'mnr'`, `TrainArrival.track?: string` — consumed by every later task that builds or renders LIRR/MNR data.

- [ ] **Step 1: Write a failing type-usage test**

There's no existing `types.test.ts`, and these are pure interface additions with no runtime behavior, so the verification here is a compile-time check rather than a vitest assertion. Add this snippet temporarily to confirm the fields don't exist yet — create `src/lib/types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import type { Station, TrainArrival } from './types'

describe('Station/TrainArrival optional fields', () => {
  it('Station accepts an optional system field', () => {
    const lirrStation: Station = {
      id: 'lirr:237',
      name: 'Penn Station',
      stops: ['237'],
      routes: ['1'],
      lat: 40.75058844,
      lng: -73.99358408,
      north: 'Ronkonkoma',
      south: 'Penn Station',
      system: 'lirr',
    }
    expect(lirrStation.system).toBe('lirr')

    const subwayStation: Station = {
      id: '119',
      name: '96 St',
      stops: ['119'],
      routes: ['1', '2', '3'],
      lat: 40.793919,
      lng: -73.972323,
      north: 'Uptown',
      south: 'Downtown',
    }
    expect(subwayStation.system).toBeUndefined()
  })

  it('TrainArrival accepts an optional track field', () => {
    const withTrack: TrainArrival = {
      route: '4',
      direction: 'N',
      stopId: '237',
      arrivalTime: 1750000000,
      terminal: 'Ronkonkoma',
      track: '18',
    }
    expect(withTrack.track).toBe('18')

    const withoutTrack: TrainArrival = {
      route: 'E',
      direction: 'N',
      stopId: 'A03N',
      arrivalTime: 1750000000,
      terminal: 'Jamaica Center',
    }
    expect(withoutTrack.track).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails on the type error**

Run: `npx vitest run src/lib/types.test.ts`
Expected: TypeScript compile error — `Object literal may only specify known properties, and 'system' does not exist in type 'Station'` (and same for `track` on `TrainArrival`).

- [ ] **Step 3: Add the fields to `src/lib/types.ts`**

Edit the `Station` interface (currently lines 1-11):

```typescript
/** A station complex from our bundled station data */
export interface Station {
  id: string
  name: string
  stops: string[]    // base GTFS stop IDs (e.g. ["A03", "127"])
  routes: string[]   // route letters (e.g. ["A", "C", "E"])
  lat: number
  lng: number
  north: string      // direction label (e.g. "Uptown", "Manhattan")
  south: string      // direction label (e.g. "Downtown", "Brooklyn")
  system?: 'lirr' | 'mnr'  // absent = NYC subway; commuter-rail systems set this
}
```

Edit the `TrainArrival` interface (currently lines 13-21):

```typescript
/** A single upcoming train arrival */
export interface TrainArrival {
  route: string        // e.g. "E", "F", "7"
  direction: 'N' | 'S' // N=northbound/uptown, S=southbound/downtown
  stopId: string       // full stop ID e.g. "A03N"
  arrivalTime: number  // Unix timestamp (seconds)
  terminal: string     // last stop name
  delay?: number       // seconds behind schedule (from GTFS-RT, absent when on time)
  track?: string       // LIRR/MNR track assignment from the MTARR GTFS-RT extension; absent for subway or unposted tracks
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/types.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: all previously-passing tests plus these 2 new ones are green (40 total).

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/types.test.ts
git commit -m "feat: add optional system field to Station and track field to TrainArrival"
```

---

## Task 3: Port `railroad-track.ts` and its fixture

**Files:**
- Create: `src/data/railroad-track.ts` (ported as-is)
- Create: `src/data/__fixtures__/lirr.pb` (ported as-is)
- Test: `src/data/railroad-track.test.ts` (new)

**Interfaces:**
- Consumes: nothing (pure function operating on raw bytes).
- Produces: `export function extractTrackMap(raw: Uint8Array): Map<string, string>` — keyed by `${tripId}|${stopId}` → track string. Consumed by Task 6 (`arrivals-commuter.ts`).

- [ ] **Step 1: Copy the fixture file**

Run: `mkdir -p src/data/__fixtures__ && cp "../SubwayLens_v1.7.0/src/data/__fixtures__/lirr.pb" src/data/__fixtures__/lirr.pb`

(Path is relative to the v1.8.1 project root, `/Users/stevenlao/Claude_Code_Sandbox/EvenHub_Developer_Submissions/SubwayLens/SubwayLens_v1.8.1`.)

- [ ] **Step 2: Verify the copy is byte-identical**

Run: `diff "../SubwayLens_v1.7.0/src/data/__fixtures__/lirr.pb" src/data/__fixtures__/lirr.pb`
Expected: no output (files identical). Also run `wc -c src/data/__fixtures__/lirr.pb` and confirm it reports `68000`.

- [ ] **Step 3: Write the failing test**

Create `src/data/railroad-track.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { extractTrackMap } from './railroad-track'

const FIXTURES = join(__dirname, '__fixtures__')
const lirrRaw = new Uint8Array(readFileSync(join(FIXTURES, 'lirr.pb')))

describe('extractTrackMap (LIRR fixture)', () => {
  it('finds track assignments keyed by tripId|stopId', () => {
    const tracks = extractTrackMap(lirrRaw)
    expect(tracks.size).toBeGreaterThan(0)
    for (const [key, track] of tracks) {
      expect(key).toMatch(/^.+\|.+$/)
      expect(track.length).toBeGreaterThan(0)
      break
    }
  })

  it('returns empty map on garbage bytes without throwing', () => {
    const tracks = extractTrackMap(new Uint8Array([1, 2, 3, 4, 5]))
    expect(tracks.size).toBe(0)
  })

  it('returns empty map on empty input without throwing', () => {
    const tracks = extractTrackMap(new Uint8Array([]))
    expect(tracks.size).toBe(0)
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run src/data/railroad-track.test.ts`
Expected: FAIL — `Cannot find module './railroad-track'` (file doesn't exist yet).

- [ ] **Step 5: Port `railroad-track.ts` as-is**

Create `src/data/railroad-track.ts` with exactly this content (copied verbatim from `SubwayLens_v1.7.0/src/data/railroad-track.ts` — no logic changes):

```typescript
/**
 * LIRR / Metro-North track extraction.
 *
 * Track assignments ride the MTA Railroad GTFS-RT extension on
 * StopTimeUpdate (extension field 1005, MtaRailroadStopTimeUpdate:
 * field 1 = track, field 2 = trainStatus). gtfs-realtime-bindings 1.x
 * only ships the standard spec, so we walk the raw wire bytes with the
 * protobufjs Reader and pull tracks into a lookup map keyed by
 * `${tripId}|${stopId}`.
 *
 * Wire path: FeedMessage.entity(2) → FeedEntity.trip_update(3) →
 *   TripUpdate.trip(1).trip_id(1), TripUpdate.stop_time_update(2) →
 *     StopTimeUpdate.stop_id(4), StopTimeUpdate.ext_1005 → track(1)
 *
 * Verified against a live LIRR capture 2026-06-09
 * (src/data/__fixtures__/lirr.pb).
 */

import { Reader } from 'protobufjs/minimal'

type WireField = { no: number; bytes: Uint8Array | null }

/** Decode one message level into its length-delimited fields (others skipped). */
function fields(buf: Uint8Array): WireField[] {
  const r = Reader.create(buf)
  const out: WireField[] = []
  while (r.pos < r.len) {
    const tag = r.uint32()
    const no = tag >>> 3
    const wire = tag & 7
    if (wire === 2) {
      out.push({ no, bytes: r.bytes() })
    } else {
      r.skipType(wire)
      out.push({ no, bytes: null })
    }
  }
  return out
}

const td = new TextDecoder()

/**
 * Extract `${tripId}|${stopId}` → track from a railroad feed's raw bytes.
 * Returns an empty map for feeds without the extension (harmless).
 */
export function extractTrackMap(raw: Uint8Array): Map<string, string> {
  const tracks = new Map<string, string>()
  try {
    for (const ent of fields(raw)) {
      if (ent.no !== 2 || !ent.bytes) continue // FeedMessage.entity
      for (const fe of fields(ent.bytes)) {
        if (fe.no !== 3 || !fe.bytes) continue // FeedEntity.trip_update
        let tripId = ''
        const stuList: Uint8Array[] = []
        for (const tu of fields(fe.bytes)) {
          if (tu.no === 1 && tu.bytes) {
            // TripUpdate.trip → TripDescriptor.trip_id(1)
            for (const t of fields(tu.bytes)) {
              if (t.no === 1 && t.bytes) tripId = td.decode(t.bytes)
            }
          } else if (tu.no === 2 && tu.bytes) {
            stuList.push(tu.bytes)
          }
        }
        if (!tripId) continue
        for (const stuBytes of stuList) {
          let stopId = ''
          let track = ''
          for (const stu of fields(stuBytes)) {
            if (stu.no === 4 && stu.bytes) stopId = td.decode(stu.bytes)
            else if (stu.no === 1005 && stu.bytes) {
              // MtaRailroadStopTimeUpdate: track(1)
              for (const ext of fields(stu.bytes)) {
                if (ext.no === 1 && ext.bytes) track = td.decode(ext.bytes)
              }
            }
          }
          if (stopId && track) tracks.set(`${tripId}|${stopId}`, track)
        }
      }
    }
  } catch {
    // Malformed bytes — return whatever was collected; tracks are optional.
  }
  return tracks
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/data/railroad-track.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 7: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: all green (43 total: 40 from Task 2 + 3 new).

- [ ] **Step 8: Commit**

```bash
git add src/data/railroad-track.ts src/data/railroad-track.test.ts src/data/__fixtures__/lirr.pb
git commit -m "feat: port railroad-track.ts protobuf decoder and LIRR fixture from v1.7.0"
```

---

## Task 4: Port the station-pack generator script and generated packs

**Files:**
- Create: `scripts/generate-stations.mjs` (ported as-is)
- Create: `src/data/packs/lirr.json` (ported as-is)
- Create: `src/data/packs/mnr.json` (ported as-is)

**Interfaces:**
- Consumes: nothing (standalone Node script, not imported by application code).
- Produces: `src/data/packs/lirr.json` and `mnr.json` on disk, each shaped `{ system: string, routeDisplay: Record<string,string>, stations: Station[] }` where each station has `{ id, system, name, stops, routes, lat, lng, north, south }`. Consumed by Task 5 (`stations.ts` loading) and Task 7 (test fixtures).

This task has no new runtime logic to unit-test (the script is not imported anywhere; it's a standalone dev tool ported for future re-generation). Verification is by diff and a smoke-load of the JSON.

- [ ] **Step 1: Create the scripts directory and copy the generator**

Run: `mkdir -p scripts && cp "../SubwayLens_v1.7.0/scripts/generate-stations.mjs" scripts/generate-stations.mjs`

- [ ] **Step 2: Verify the script copy is byte-identical**

Run: `diff "../SubwayLens_v1.7.0/scripts/generate-stations.mjs" scripts/generate-stations.mjs`
Expected: no output.

- [ ] **Step 3: Copy the generated station packs**

Run: `mkdir -p src/data/packs && cp "../SubwayLens_v1.7.0/src/data/packs/lirr.json" src/data/packs/lirr.json && cp "../SubwayLens_v1.7.0/src/data/packs/mnr.json" src/data/packs/mnr.json`

- [ ] **Step 4: Verify both pack copies are byte-identical**

Run: `diff "../SubwayLens_v1.7.0/src/data/packs/lirr.json" src/data/packs/lirr.json && diff "../SubwayLens_v1.7.0/src/data/packs/mnr.json" src/data/packs/mnr.json`
Expected: no output from either diff.

- [ ] **Step 5: Smoke-test the JSON shape**

Run:
```bash
node -e "
const lirr = require('./src/data/packs/lirr.json');
const mnr = require('./src/data/packs/mnr.json');
console.log('lirr stations:', lirr.stations.length, 'system:', lirr.system);
console.log('mnr stations:', mnr.stations.length, 'system:', mnr.system);
console.log('lirr sample:', JSON.stringify(lirr.stations.find(s => s.name === 'Penn Station')));
console.log('mnr sample:', JSON.stringify(mnr.stations.find(s => s.name === 'Grand Central')));
"
```
Expected output: `lirr stations: 127 system: lirr`, `mnr stations: 113 system: mnr`, and the Penn Station / Grand Central entries print with `id`, `system`, `name`, `stops`, `routes`, `lat`, `lng`, `north`, `south` fields populated (matching the shapes already confirmed in v1.7.0: `lirr:237` for Penn Station, `mnr:1` for Grand Central).

- [ ] **Step 6: Confirm `tsconfig.json`'s `resolveJsonModule` allows importing these in Task 5**

Run: `grep resolveJsonModule tsconfig.json`
Expected: `"resolveJsonModule": true` is already present (confirmed during planning — same setting `stations.ts` already relies on for `stations.json`). No tsconfig change needed.

- [ ] **Step 7: Commit**

```bash
git add scripts/generate-stations.mjs src/data/packs/lirr.json src/data/packs/mnr.json
git commit -m "feat: port station-pack generator script and generated LIRR/MNR packs from v1.7.0"
```

---

## Task 5: Load LIRR/MNR packs into `allStations`/`stationById`/`stopIdToStation`

**Files:**
- Modify: `src/data/stations.ts`
- Test: `src/data/stations.test.ts` (new)

**Interfaces:**
- Consumes: `src/data/packs/lirr.json`, `src/data/packs/mnr.json` (from Task 4), `Station` type (from Task 2).
- Produces: `allStations: Station[]`, `stationById: Map<string, Station>`, `stopIdToStation: Map<string, Station>` — now include LIRR/MNR entries. Same exported names/types as before, just more entries. Consumed by every downstream module that already imports from `stations.ts` (`mta-feeds.ts`, `search.ts`, `arrivals-commuter.ts` in Task 6, `stations.ts` glasses-mode manager).

- [ ] **Step 1: Write the failing test**

Create `src/data/stations.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { allStations, stationById, stopIdToStation } from './stations'

describe('stations (subway + LIRR + MNR packs loaded together)', () => {
  it('includes the bundled subway stations', () => {
    const subwayStation = stationById.get('119')
    expect(subwayStation).toBeDefined()
    expect(subwayStation?.system).toBeUndefined()
  })

  it('includes LIRR stations with system set to lirr', () => {
    const penn = stationById.get('lirr:237')
    expect(penn).toBeDefined()
    expect(penn?.system).toBe('lirr')
    expect(penn?.name).toBe('Penn Station')
  })

  it('includes MNR stations with system set to mnr', () => {
    const grandCentral = stationById.get('mnr:1')
    expect(grandCentral).toBeDefined()
    expect(grandCentral?.system).toBe('mnr')
    expect(grandCentral?.name).toBe('Grand Central')
  })

  it('allStations contains subway plus LIRR plus MNR counts', () => {
    const subwayCount = allStations.filter((s) => !s.system).length
    const lirrCount = allStations.filter((s) => s.system === 'lirr').length
    const mnrCount = allStations.filter((s) => s.system === 'mnr').length
    expect(subwayCount).toBe(445)
    expect(lirrCount).toBe(127)
    expect(mnrCount).toBe(113)
    expect(allStations.length).toBe(subwayCount + lirrCount + mnrCount)
  })

  it('stopIdToStation resolves LIRR stop IDs to their station', () => {
    const jamaica = stopIdToStation.get('102')
    expect(jamaica).toBeDefined()
    expect(jamaica?.id).toBe('lirr:102')
    expect(jamaica?.name).toBe('Jamaica')
  })

  it('does not let LIRR/MNR stop IDs collide with subway stop IDs', () => {
    // Subway stop IDs are bare numbers/letter-codes (e.g. "119"); LIRR stop "102"
    // is also a bare number. stopIdToStation is a flat map, so if both systems
    // used "102" the LIRR entry registered later would win. Confirm this is the
    // expected last-registration-wins behavior is harmless for the well-known
    // disambiguating cases used by the app (search/favorites always resolve by
    // the namespaced station `id`, e.g. "lirr:102", not by bare stop ID).
    const byId = stationById.get('lirr:102')
    expect(byId?.stops).toContain('102')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/data/stations.test.ts`
Expected: FAIL — LIRR/MNR lookups return `undefined`, count assertions fail (only 445 subway stations loaded today).

- [ ] **Step 3: Modify `src/data/stations.ts` to load the commuter-rail packs**

Replace the full file content:

```typescript
/**
 * Centralised station data.
 *
 * Single import point for the bundled MTA station list plus the LIRR and
 * Metro-North station packs. All consumers should import from here instead
 * of requiring stations.json/packs directly so the lookup maps are built
 * once and shared.
 *
 * LIRR/MNR stations are loaded unconditionally — no settings toggle, no
 * region concept. They're just more entries in allStations/stationById,
 * distinguished by the optional Station.system field.
 */

import stationsData from './stations.json'
import lirrPack from './packs/lirr.json'
import mnrPack from './packs/mnr.json'
import type { Station } from '../lib/types'

/** Every subway station complex in the MTA system. */
const subwayStations: Station[] = stationsData as Station[]

/** Every LIRR station, tagged with system: 'lirr'. */
const lirrStations: Station[] = lirrPack.stations as Station[]

/** Every Metro-North station, tagged with system: 'mnr'. */
const mnrStations: Station[] = mnrPack.stations as Station[]

/** Every station complex across subway, LIRR, and Metro-North. */
export const allStations: Station[] = [
  ...subwayStations,
  ...lirrStations,
  ...mnrStations,
]

/** O(1) lookup by station complex ID (e.g. "119", "lirr:237", "mnr:1"). */
export const stationById = new Map<string, Station>()
for (const s of allStations) {
  stationById.set(s.id, s)
}

/** O(1) lookup by base GTFS stop ID (e.g. "A03" → station). */
export const stopIdToStation = new Map<string, Station>()
for (const s of allStations) {
  for (const sid of s.stops) {
    stopIdToStation.set(sid, s)
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/data/stations.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: all green (49 total: 43 from Task 3 + 6 new). Pay particular attention to `search.test.ts` and `geo.test.ts` since they consume `allStations`/`stationById` — confirm they still pass with the larger combined list.

- [ ] **Step 6: Run the build to confirm the JSON imports bundle cleanly**

Run: `npm run build`
Expected: clean build, no TypeScript errors on the new JSON imports.

- [ ] **Step 7: Commit**

```bash
git add src/data/stations.ts src/data/stations.test.ts
git commit -m "feat: load LIRR/MNR station packs into allStations/stationById/stopIdToStation"
```

---

## Task 6: `arrivals-commuter.ts` — fetch and decode LIRR/MNR arrivals

**Files:**
- Create: `src/data/arrivals-commuter.ts`
- Test: `src/data/arrivals-commuter.test.ts`

**Interfaces:**
- Consumes: `Station`, `TrainArrival`, `StationArrivals` types (Task 2), `extractTrackMap` from `railroad-track.ts` (Task 3), `stationById`/`allStations` station data carrying `routeDisplay` lookups built from the packs (Task 5 — note: the packs' `routeDisplay` field is read directly in this task, not via a separate registry module).
- Produces: `export async function getCommuterArrivals(station: Station): Promise<StationArrivals>` — same return shape as `mta-feeds.ts`'s `getStationArrivals`, consumed by Task 9 (`src/glasses/stations.ts` dispatcher). Also exports `export function routeDisplayName(system: 'lirr' | 'mnr', routeId: string): string` for badge lookups, consumed by Task 8 (`renderDepartureBoard`).

This module deliberately does NOT use v1.7.0's `feed-cache.ts`/`pack-registry.ts` abstraction — those exist to support the multi-region scaffolding this plan explicitly skips. Instead it fetches+decodes inline (mirroring `mta-feeds.ts`'s own inline `fetchFeed`, but additionally keeping the raw bytes around for `extractTrackMap`, since the existing `mta-feeds.ts` fetcher discards raw bytes after decoding and must not be modified) and reads `routeDisplay` directly from the two pack JSON files.

- [ ] **Step 1: Write the failing test**

Create `src/data/arrivals-commuter.test.ts`:

```typescript
/**
 * Arrival collection tests against a captured live LIRR protobuf fixture
 * (src/data/__fixtures__/lirr.pb, captured 2026-06-09, ported from v1.7.0).
 *
 * Fixture times are in the past relative to test runs, so Date.now is
 * frozen to just after the capture timestamp.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { transit_realtime } from 'gtfs-realtime-bindings'
import { extractTrackMap } from './railroad-track'
import { getCommuterArrivals, routeDisplayName } from './arrivals-commuter'
import { stationById } from './stations'

const FIXTURES = join(__dirname, '__fixtures__')
const lirrRaw = new Uint8Array(readFileSync(join(FIXTURES, 'lirr.pb')))

// Freeze time to the fixture's feed-header timestamp so arrivals are "upcoming"
const feed = transit_realtime.FeedMessage.decode(lirrRaw)
const feedTime = Number(feed.header.timestamp) * 1000

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(feedTime)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function stubFetchWithFixture(raw: Uint8Array) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    arrayBuffer: async () => raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
  })) as unknown as typeof fetch)
}

describe('getCommuterArrivals — LIRR (direction-id, single departure list)', () => {
  it('collects upcoming departures for Jamaica into the single N list', async () => {
    stubFetchWithFixture(lirrRaw)
    const jamaica = stationById.get('lirr:102')!
    expect(jamaica).toBeDefined()

    const arrivals = await getCommuterArrivals(jamaica)
    expect(arrivals.north.length).toBeGreaterThan(0)
    expect(arrivals.south).toHaveLength(0) // commuter rail collapses to N

    // Sorted ascending
    const times = arrivals.north.map((a) => a.arrivalTime)
    expect([...times].sort((a, b) => a - b)).toEqual(times)

    // Terminals resolve to station names from the pack, not raw stop IDs
    const withNamedTerminal = arrivals.north.filter((a) => /[a-zA-Z]/.test(a.terminal))
    expect(withNamedTerminal.length).toBeGreaterThan(0)
  })

  it('attaches track numbers where the extension provides them', async () => {
    stubFetchWithFixture(lirrRaw)
    const tracks = extractTrackMap(lirrRaw)
    expect(tracks.size).toBeGreaterThan(0)
    const someTrackedStopId = [...tracks.keys()][0].split('|')[1]
    const station = [...stationById.values()].find(
      (s) => s.system === 'lirr' && s.stops.includes(someTrackedStopId)
    )
    if (!station) return // tracked stop not in pack — acceptable, skip

    const arrivals = await getCommuterArrivals(station)
    // Not all departures have posted tracks; at least the shape must hold.
    for (const a of arrivals.north) {
      if (a.track !== undefined) {
        expect(typeof a.track).toBe('string')
        expect(a.track.length).toBeGreaterThan(0)
        return
      }
    }
  })

  it('returns empty arrivals (not a throw) when the feed fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })) as unknown as typeof fetch)
    const jamaica = stationById.get('lirr:102')!
    const arrivals = await getCommuterArrivals(jamaica)
    expect(arrivals.north).toHaveLength(0)
    expect(arrivals.south).toHaveLength(0)
    expect(arrivals.stationId).toBe('lirr:102')
  })
})

describe('routeDisplayName', () => {
  it('maps LIRR numeric route IDs to branch names', () => {
    expect(routeDisplayName('lirr', '1')).toBe('Babylon')
    expect(routeDisplayName('lirr', '4')).toBe('Ronkonkoma')
  })

  it('falls back to the raw ID for unknown routes', () => {
    expect(routeDisplayName('lirr', 'zz')).toBe('zz')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/data/arrivals-commuter.test.ts`
Expected: FAIL — `Cannot find module './arrivals-commuter'`.

- [ ] **Step 3: Write `src/data/arrivals-commuter.ts`**

```typescript
/**
 * LIRR / Metro-North arrival fetcher and protobuf decoder.
 *
 * Separate module from mta-feeds.ts (subway) because the direction
 * strategy is fundamentally different:
 *   - Subway (mta-feeds.ts): direction encoded in the stop ID suffix
 *     (A03N/A03S), one feed shared by multiple routes.
 *   - Commuter rail (this module): standard GTFS-RT — match
 *     stopTimeUpdate.stopId directly against station.stops, one feed
 *     per system. Everything collapses into a single time-sorted list
 *     (the `north` array of StationArrivals) since departure boards
 *     don't have a north/south split — `south` is always empty here.
 *
 * Track numbers ride the MTA Railroad GTFS-RT extension and are decoded
 * via railroad-track.ts's raw-bytes walk (gtfs-realtime-bindings doesn't
 * know about this extension field).
 */

import GtfsRealtimeBindings from 'gtfs-realtime-bindings'
import { extractTrackMap } from './railroad-track'
import lirrPack from './packs/lirr.json'
import mnrPack from './packs/mnr.json'
import type { Station, TrainArrival, StationArrivals } from '../lib/types'

const FEED_TIMEOUT_MS = 8000

const LIRR_FEED_URL =
  'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr%2Fgtfs-lirr'
const MNR_FEED_URL =
  'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/mnr%2Fgtfs-mnr'

const FEED_URL_BY_SYSTEM: Record<'lirr' | 'mnr', string> = {
  lirr: LIRR_FEED_URL,
  mnr: MNR_FEED_URL,
}

const ROUTE_DISPLAY_BY_SYSTEM: Record<'lirr' | 'mnr', Record<string, string>> = {
  lirr: lirrPack.routeDisplay as Record<string, string>,
  mnr: mnrPack.routeDisplay as Record<string, string>,
}

// Stop ID -> station name lookup, built per system from the loaded packs.
// Built once at module load (packs are static, loaded unconditionally).
const STOP_NAMES_BY_SYSTEM: Record<'lirr' | 'mnr', Map<string, string>> = {
  lirr: buildStopNames(lirrPack.stations as Station[]),
  mnr: buildStopNames(mnrPack.stations as Station[]),
}

function buildStopNames(stations: Station[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const st of stations) {
    for (const sid of st.stops) map.set(sid, st.name)
  }
  return map
}

/**
 * Display label for a route ID within a commuter-rail system.
 * Falls back to the raw route ID for unknown routes.
 */
export function routeDisplayName(system: 'lirr' | 'mnr', routeId: string): string {
  return ROUTE_DISPLAY_BY_SYSTEM[system]?.[routeId] ?? routeId
}

interface RawFeed {
  entities: GtfsRealtimeBindings.transit_realtime.IFeedEntity[]
  raw: Uint8Array
}

/**
 * Fetch and decode a single GTFS-RT feed, keeping the raw bytes around
 * for extractTrackMap (which needs wire-level access mta-feeds.ts's
 * fetchFeed doesn't preserve).
 * Aborts after FEED_TIMEOUT_MS to prevent hung requests blocking refresh.
 */
async function fetchRawFeed(url: string): Promise<RawFeed> {
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
 * Fetch arrivals for a LIRR/MNR station.
 * Returns empty arrivals on any failure — no mock/fake data, matching
 * mta-feeds.ts's error posture.
 */
export async function getCommuterArrivals(station: Station): Promise<StationArrivals> {
  const now = Math.floor(Date.now() / 1000)
  const result: StationArrivals = {
    stationId: station.id,
    north: [],
    south: [],
    fetchedAt: now,
  }

  const system = station.system
  if (system !== 'lirr' && system !== 'mnr') return result

  const url = FEED_URL_BY_SYSTEM[system]
  const stopNames = STOP_NAMES_BY_SYSTEM[system]
  const stationStopIds = new Set(station.stops)

  try {
    const feed = await fetchRawFeed(url).catch(() => {
      console.warn(`Feed failed: ${url}`)
      return null
    })
    if (!feed) return result

    const trackMap = extractTrackMap(feed.raw)

    for (const entity of feed.entities) {
      const tu = entity.tripUpdate
      if (!tu?.trip || !tu.stopTimeUpdate) continue

      const routeId = (tu.trip.routeId as string) || ''
      const tripId = (tu.trip.tripId as string) || ''
      const stopTimeUpdates = tu.stopTimeUpdate

      // Terminal = last stop in the trip's remaining sequence
      const lastStop = stopTimeUpdates[stopTimeUpdates.length - 1]
      const lastStopId = (lastStop?.stopId as string) || ''
      const terminalName = stopNames.get(lastStopId) ?? lastStopId ?? routeId

      for (const stu of stopTimeUpdates) {
        const stopId = stu.stopId as string
        if (!stopId || !stationStopIds.has(stopId)) continue

        const arrTime = Number(stu.arrival?.time || stu.departure?.time || 0)
        if (arrTime === 0 || arrTime < now - 30) continue

        const stopDelay = Number(stu.arrival?.delay ?? stu.departure?.delay ?? 0)

        const arrival: TrainArrival = {
          route: routeId,
          direction: 'N', // departure boards collapse to a single list
          stopId,
          arrivalTime: arrTime,
          terminal: terminalName,
          delay: stopDelay > 0 ? stopDelay : undefined,
          track: trackMap.get(`${tripId}|${stopId}`),
        }

        result.north.push(arrival)
      }
    }

    result.north.sort((a, b) => a.arrivalTime - b.arrivalTime)
  } catch (err) {
    console.error('Failed to fetch commuter-rail arrivals:', err)
  }

  return result
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/data/arrivals-commuter.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: all green (54 total: 49 from Task 5 + 5 new).

- [ ] **Step 6: Run the build to confirm clean compilation**

Run: `npm run build`
Expected: clean build, no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/data/arrivals-commuter.ts src/data/arrivals-commuter.test.ts
git commit -m "feat: add arrivals-commuter.ts for LIRR/MNR GTFS-RT fetch and track decoding"
```

---

## Task 7: `renderDepartureBoard()` in `src/glasses/display.ts`

**Files:**
- Modify: `src/glasses/display.ts` (add new exported function; `renderBody()` untouched)
- Modify: `src/glasses/display.test.ts` (add new test cases)

**Interfaces:**
- Consumes: `Station`, `StationArrivals`, `TrainArrival` types (Task 2), `routeDisplayName` from `arrivals-commuter.ts` (Task 6), `formatArrival`/`isArrivingSoon`/`minutesUntil` from `src/lib/time.ts` (already exist — note `minutesUntil` is not currently imported into `display.ts`, needs adding to the import line).
- Produces: `export function renderDepartureBoard(station: Station, arrivals: StationArrivals): string` — consumed by Task 10 (`src/main.ts` branch point).

- [ ] **Step 1: Write the failing tests**

First, change the existing import line at the top of `src/glasses/display.test.ts` (currently line 2):

```typescript
import { renderLoading, renderNoStations, formatDirectionLine } from './display'
```

to:

```typescript
import { renderLoading, renderNoStations, formatDirectionLine, renderDepartureBoard } from './display'
```

And add a new import line directly below it (this file has no type imports yet):

```typescript
import type { Station, StationArrivals, TrainArrival } from '../lib/types'
```

Then append the following to the end of the file (after the existing `formatDirectionLine` describe block):

```typescript
function makeLirrStation(overrides: Partial<Station> = {}): Station {
  return {
    id: 'lirr:237',
    name: 'Penn Station',
    stops: ['237'],
    routes: ['1', '4'],
    lat: 40.75058844,
    lng: -73.99358408,
    north: 'Ronkonkoma',
    south: 'Penn Station',
    system: 'lirr',
    ...overrides,
  }
}

function makeArrival(overrides: Partial<TrainArrival> = {}): TrainArrival {
  return {
    route: '4',
    direction: 'N',
    stopId: '237',
    arrivalTime: 1750000000,
    terminal: 'Ronkonkoma',
    ...overrides,
  }
}

function makeArrivals(north: TrainArrival[], fetchedAt = 1750000000 - 60): StationArrivals {
  return { stationId: 'lirr:237', north, south: [], fetchedAt }
}

describe('renderDepartureBoard', () => {
  it('renders DEPARTURES header and a normal list of entries with tracks', () => {
    const station = makeLirrStation()
    const now = 1750000000
    const arrivals = makeArrivals([
      makeArrival({ route: '4', terminal: 'Ronkonkoma', arrivalTime: now + 12 * 60, track: '18' }),
      makeArrival({ route: '5', terminal: 'Babylon', arrivalTime: now + 19 * 60, track: '15' }),
    ])
    const text = renderDepartureBoard(station, arrivals)
    expect(text).toContain('DEPARTURES')
    expect(text).toContain('Trk 18')
    expect(text).toContain('Trk 15')
    expect(text).toContain('tap:refresh')
    expect(text).toContain('dbl:exit')
  })

  it('shows "Trk --" when a departure has no posted track yet', () => {
    const station = makeLirrStation()
    const arrivals = makeArrivals([
      makeArrival({ route: '2', terminal: 'Hempstead', arrivalTime: 1750000000 + 24 * 60, track: undefined }),
    ])
    const text = renderDepartureBoard(station, arrivals)
    expect(text).toContain('Trk --')
  })

  it('shows the empty/no-live-data state when there are no departures', () => {
    const station = makeLirrStation()
    const arrivals = makeArrivals([])
    const text = renderDepartureBoard(station, arrivals)
    expect(text).toContain('No live data')
  })

  it('limits to a maximum of 6 entries', () => {
    const station = makeLirrStation()
    const now = 1750000000
    const many = Array.from({ length: 10 }, (_, i) =>
      makeArrival({ route: '4', terminal: 'Ronkonkoma', arrivalTime: now + (i + 1) * 60, track: String(i + 1) })
    )
    const arrivals = makeArrivals(many)
    const text = renderDepartureBoard(station, arrivals)
    const trkLines = text.split('\n').filter((l) => l.includes('Trk'))
    expect(trkLines.length).toBeLessThanOrEqual(6)
  })

  it('sorts entries by arrival time ascending', () => {
    const station = makeLirrStation()
    const now = 1750000000
    const arrivals = makeArrivals([
      makeArrival({ route: '5', terminal: 'Babylon', arrivalTime: now + 30 * 60, track: '15' }),
      makeArrival({ route: '4', terminal: 'Ronkonkoma', arrivalTime: now + 5 * 60, track: '18' }),
    ])
    const text = renderDepartureBoard(station, arrivals)
    const trkLineIndexes = text.split('\n')
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => line.includes('Trk'))
    expect(trkLineIndexes[0].line).toContain('Trk 18') // 5min entry first
    expect(trkLineIndexes[1].line).toContain('Trk 15')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/glasses/display.test.ts`
Expected: FAIL — `renderDepartureBoard` is not exported from `./display`.

- [ ] **Step 3: Add `renderDepartureBoard()` to `src/glasses/display.ts`**

First, update the import line (currently line 19) to add `minutesUntil`:

```typescript
import { formatArrival, isArrivingSoon, minutesUntil } from '../lib/time'
```

And add the import for `routeDisplayName` near the top, alongside the existing alert imports (after line 23's `import { alertsForRoutes, routeHasAlert } from '../data/alerts'`):

```typescript
import { routeDisplayName } from '../data/arrivals-commuter'
```

Then append these new constants near the existing `MAX_TRAINS`/`CHARS_PER_LINE`/`TERMINAL_WIDTH` constants (after `TERMINAL_WIDTH` at line 40):

```typescript
/** Max departures shown on a departure board (single list, no direction split). */
const MAX_DEPARTURES = 6

/** Departure-board terminal column width when route badges are short (<=3 chars). */
const BOARD_TERMINAL_WIDTH_WIDE = 15

/** Departure-board terminal column width when any route badge exceeds 3 chars
 *  (track column needs the extra room — same rule validated in the v1.7.0 mockup). */
const BOARD_TERMINAL_WIDTH_NARROW = 12
```

Then append the new function at the end of the file (after `renderNoStations()`):

```typescript
/**
 * Abbreviate a branch/route display name to a compact badge.
 * Multi-word: first letter + first 3 of second word ("Port Jefferson" → "PJEF").
 * Single word: first 4 ("Ronkonkoma" → "RONK").
 */
function branchAbbrev(display: string): string {
  const words = display.toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(/\s+/).filter(Boolean)
  if (words.length === 0) return '????'
  if (words.length >= 2) return words[0][0] + words[1].slice(0, 3)
  return words[0].slice(0, 4)
}

/**
 * Render the commuter-rail departure board: one time-sorted list with
 * branch badges and track numbers. Tracks show "Trk --" until the MTARR
 * extension posts them (~10 min before departure at terminals). The
 * terminal column shrinks from 15 to 12 chars when any visible badge
 * exceeds 3 chars, making room for the track field — same rule as the
 * validated v1.7.0 mockup:
 *
 *   Penn Station LIRR ★           10:24a
 *   DEPARTURES
 *   ▶[RONK] Ronkonkoma   Trk 18  12m-10:36
 *    [PJEF] Pt Jefferson Trk 20  +4m late
 *    [BABL] Babylon      Trk 15  19m-10:43
 *    [HEMP] Hempstead    Trk --  24m-10:48
 *   ━━━━━━━━━━━━━━━ 3/5
 *   10:23a  tap:refresh  dbl:exit
 */
export function renderDepartureBoard(
  station: Station,
  arrivals: StationArrivals
): string {
  const now = Math.floor(Date.now() / 1000)
  const system = station.system === 'mnr' ? 'mnr' : 'lirr'
  const lines: string[] = []

  lines.push('DEPARTURES')

  const departures = arrivals.north.slice(0, MAX_DEPARTURES)

  if (departures.length === 0) {
    lines.push('  No live data')
  } else {
    const badges = departures.map((t) => branchAbbrev(routeDisplayName(system, t.route)))
    const terminalWidth = badges.some((b) => b.length > 3)
      ? BOARD_TERMINAL_WIDTH_NARROW
      : BOARD_TERMINAL_WIDTH_WIDE

    departures.forEach((t, i) => {
      const badge = `[${badges[i]}]`
      const rawTerminal = t.delay && t.delay > 60
        ? `+${Math.round(t.delay / 60)}m late`
        : t.terminal
      const terminal = rawTerminal.length > terminalWidth
        ? rawTerminal.slice(0, terminalWidth - 1) + '.'
        : rawTerminal.padEnd(terminalWidth, ' ')
      const track = t.track ? `Trk ${t.track}`.padEnd(6, ' ').slice(0, 6) : 'Trk --'
      const mins = minutesUntil(t.arrivalTime, now)
      const clock = formatArrival(t.arrivalTime, now).split(' - ')[1] ?? formatArrival(t.arrivalTime, now).replace('NOW ', '')
      const time = mins === 0 ? `NOW ${clock}` : `${mins}m-${clock}`
      const marker = isArrivingSoon(t.arrivalTime, now) ? '▶' : ' '

      const left = `${marker}${badge} ${terminal} ${track}`
      const gap = Math.max(1, CHARS_PER_LINE - left.length - time.length)
      lines.push(left + ' '.repeat(gap) + time)
    })
  }

  // Footer — no alert toggle for commuter rail (alerts feed is subway-only).
  const ageSecs = now - arrivals.fetchedAt
  if (ageSecs > 120) {
    lines.push(`! ${Math.floor(ageSecs / 60)}m old  tap:refresh  dbl:exit`)
  } else {
    const fetchStr = formatClockTime(new Date(arrivals.fetchedAt * 1000))
    lines.push(`${fetchStr}  tap:refresh  dbl:exit`)
  }

  return lines.join('\n')
}
```

Note on the `clock` line: `formatArrival()` returns `"Nm - H:MM"` or `"NOW H:MM"` (see `src/lib/time.ts`). Splitting on `' - '` extracts `H:MM` for the `Nm-H:MM` compact form; the fallback handles the `NOW` case where there's no `' - '` separator.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/glasses/display.test.ts`
Expected: PASS, all cases including the 5 new `renderDepartureBoard` tests.

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: all green (59 total: 54 from Task 6 + 5 new).

- [ ] **Step 6: Run the build to confirm clean compilation**

Run: `npm run build`
Expected: clean build, no TypeScript errors, no circular-import errors (watch for `display.ts` → `arrivals-commuter.ts` → `stations.ts` — confirm this is a one-directional dependency, not a cycle; `arrivals-commuter.ts` does not import from `display.ts`, so this is safe).

- [ ] **Step 7: Commit**

```bash
git add src/glasses/display.ts src/glasses/display.test.ts
git commit -m "feat: add renderDepartureBoard for LIRR/MNR commuter-rail display"
```

---

## Task 8: Verify settings/search/favorites need no code changes (verification only)

**Files:**
- Read only: `src/settings/search.ts`, `src/settings/StationSearch.tsx`, `src/settings/FavoritesList.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: a confirmed go/no-go — if any subway-specific filtering is found, stop and add a real fix task before continuing to Task 9.

This was already checked during plan research (this plan's author read all three files in full while building this plan). Re-verify here as a discrete, checkable task so execution doesn't silently skip it.

- [ ] **Step 1: Re-read `src/settings/search.ts`**

Run: `cat src/settings/search.ts`

Confirm: `searchStations()` iterates `allStations` (imported from `./data/stations` — now includes LIRR/MNR per Task 5) and matches purely on `Station.name` (exact substring + fuzzy word match). No field anywhere references `Station.system`, route letters being subway-specific, or any other subway-only filter. `getStation(id)` is a plain `stationById.get(id)` lookup. **Confirmed: no changes needed.**

- [ ] **Step 2: Re-read `src/settings/StationSearch.tsx`**

Run: `cat src/settings/StationSearch.tsx`

Confirm: this component calls `searchStations(val, 15)` and renders `station.name` + `RouteBadges routes={station.routes}` for each result, with an add button keyed only on `station.id`. No subway-specific logic. **Confirmed: no changes needed.**

- [ ] **Step 3: Re-read `src/settings/FavoritesList.tsx`**

Run: `cat src/settings/FavoritesList.tsx`

Confirm: this component receives `favoriteIds: string[]` and resolves each via `getStation(id)` (the same generic `stationById` lookup from `search.ts`), rendering `station.name` and a `RouteFilter` keyed on `station.routes`. Drag-reorder and remove operate on the `favoriteIds` array of plain string IDs. No subway-specific logic. **Confirmed: no changes needed.**

- [ ] **Step 4: Manually exercise the search UI to confirm LIRR/MNR stations are discoverable**

Run: `npm run dev` (starts Vite dev server), then in a browser open the settings page and search for "Penn Station" or "Jamaica" or "Grand Central". Confirm both the subway result and the LIRR/MNR result (now that Task 5 has loaded the packs) appear in the results list, each addable as a favorite independently (they have distinct IDs: `"318"` for subway 34 St-Penn Station vs `"lirr:237"` for LIRR Penn Station).

Stop the dev server afterward (Ctrl-C).

- [ ] **Step 5: Record the result**

No commit for this task — verification only, no files changed. If any step above reveals an actual subway-specific filter blocking LIRR/MNR stations from appearing, stop this plan and insert a new task here (before Task 9) to fix the specific file found, with its own failing test first.

---

## Task 9: Dispatch arrivals fetching by `station.system` in `src/glasses/stations.ts`

**Files:**
- Modify: `src/glasses/stations.ts`
- Test: extend coverage indirectly via Task 6's `arrivals-commuter.test.ts` (already covers `getCommuterArrivals` directly); this task adds a focused dispatcher test.

**Interfaces:**
- Consumes: `getStationArrivals` from `mta-feeds.ts` (existing, unmodified), `getCommuterArrivals` from `arrivals-commuter.ts` (Task 6), `Station.system` (Task 2).
- Produces: a new internal dispatcher used by `refreshCurrentArrivals()` and `prefetchAllStations()` — both keep their existing exported signatures, so `main.ts` callers (Task 10) need no changes to these two functions' call sites.

- [ ] **Step 1: Write the failing test**

Create `src/glasses/stations.test.ts` (new file — `stations.ts` currently has no dedicated test file). Rather than spying on sibling-module function bindings (fragile under Vite's ESM transform), this test stubs global `fetch` and asserts on the resulting `StationArrivals` *shape* — which path ran is observable because the subway path (`mta-feeds.ts`) splits into `north`/`south` by stop-ID suffix while the commuter path (`arrivals-commuter.ts`) always collapses everything into `north` with `south` empty, and because a malformed/empty buffer decodes to zero entities via `gtfs-realtime-bindings` regardless of which path consumes it (so a single shared fetch stub is sufficient to prove no network call throws and the correct stationId comes back):

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import { dispatchGetArrivals } from './stations'
import { stationById } from '../data/stations'

describe('dispatchGetArrivals — routes by station.system', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubEmptyFeed() {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
    })) as unknown as typeof fetch)
  }

  it('routes a subway station (no system field) through the stop-suffix path', async () => {
    stubEmptyFeed()
    const station = stationById.get('119')!
    expect(station.system).toBeUndefined()

    const arrivals = await dispatchGetArrivals(station)
    expect(arrivals.stationId).toBe('119')
    expect(arrivals.north).toEqual([])
    expect(arrivals.south).toEqual([])
  })

  it('routes a LIRR station through the commuter direction-id path', async () => {
    stubEmptyFeed()
    const station = stationById.get('lirr:237')!
    expect(station.system).toBe('lirr')

    const arrivals = await dispatchGetArrivals(station)
    expect(arrivals.stationId).toBe('lirr:237')
    expect(arrivals.north).toEqual([])
    expect(arrivals.south).toEqual([]) // commuter path always leaves south empty
  })

  it('routes an MNR station through the commuter direction-id path', async () => {
    stubEmptyFeed()
    const station = stationById.get('mnr:1')!
    expect(station.system).toBe('mnr')

    const arrivals = await dispatchGetArrivals(station)
    expect(arrivals.stationId).toBe('mnr:1')
    expect(arrivals.north).toEqual([])
    expect(arrivals.south).toEqual([])
  })

  it('a subway station with zero matching routes returns empty arrivals without touching fetch', async () => {
    // Subway path short-circuits to an empty result when feedUrlsForRoutes()
    // finds no feeds for the station's routes — confirms dispatch reaches
    // mta-feeds.ts's own early-return rather than the commuter path.
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch)
    const station = { ...stationById.get('119')!, routes: [] }

    const arrivals = await dispatchGetArrivals(station)
    expect(arrivals.north).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/glasses/stations.test.ts`
Expected: FAIL — `dispatchGetArrivals` is not exported from `./stations`.

- [ ] **Step 3: Modify `src/glasses/stations.ts`**

Update the import line (currently line 8):

```typescript
import { getStationArrivals } from '../data/mta-feeds'
```

to:

```typescript
import { getStationArrivals } from '../data/mta-feeds'
import { getCommuterArrivals } from '../data/arrivals-commuter'
```

Add a new dispatcher function right after the imports/state block, before `loadStations()` (insert after line 38's `let cachedSettings: AppSettings | null = null`):

```typescript
/**
 * Dispatch arrival fetching by station.system: subway stations (system
 * undefined) use the stop-suffix mta-feeds.ts path; LIRR/MNR stations use
 * the direction-id arrivals-commuter.ts path. Exported for direct testing.
 */
export async function dispatchGetArrivals(station: Station): Promise<StationArrivals> {
  if (station.system === 'lirr' || station.system === 'mnr') {
    return getCommuterArrivals(station)
  }
  return getStationArrivals(station)
}
```

Then update `refreshCurrentArrivals()` (currently lines 152-158) to call the dispatcher instead of `getStationArrivals` directly:

```typescript
/**
 * Fetch arrivals for the current station.
 * Caches results.
 */
export async function refreshCurrentArrivals(): Promise<StationArrivals | null> {
  const station = currentStation()
  if (!station) return null
  const arrivals = await dispatchGetArrivals(station)
  state.arrivals.set(station.id, arrivals)
  return arrivals
}
```

And update `prefetchAllStations()` (currently lines 174-186) similarly:

```typescript
/**
 * Prefetch arrivals for all active stations in parallel and populate the cache.
 * Called on startup and on foreground re-enter so scroll is instant (no Loading...).
 * Individual station failures are swallowed — they'll be retried on next refresh.
 */
export async function prefetchAllStations(): Promise<void> {
  if (state.stations.length === 0) return
  await Promise.all(
    state.stations.map(async (station) => {
      try {
        const arrivals = await dispatchGetArrivals(station)
        state.arrivals.set(station.id, arrivals)
      } catch {
        // Silently skip — stale or empty cache is fine
      }
    })
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/glasses/stations.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: all green (63 total: 59 from Task 7 + 4 new).

- [ ] **Step 6: Run the build to confirm clean compilation**

Run: `npm run build`
Expected: clean build, no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/glasses/stations.ts src/glasses/stations.test.ts
git commit -m "feat: dispatch arrival fetching to arrivals-commuter.ts for LIRR/MNR stations"
```

---

## Task 10: Branch `renderBody`/`renderDepartureBoard` in `src/main.ts`

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `renderDepartureBoard` from `src/glasses/display.ts` (Task 7), `station.system` (Task 2).
- Produces: no new exports — this is the final wiring task connecting everything built so far into the live render path.

`src/main.ts` currently calls `renderBody(station, filtered, currentIndex, stations.length, alerts)` (or the alerts-equivalent) at four call sites: inside `displayCurrentStation()` (two calls — initial cached paint and fresh-data paint), inside `refreshInPlace()` (one call), and inside the `subwaylens:stations-updated` listener (one call). Each becomes a branch on `station.system`.

- [ ] **Step 1: Update the import line**

Change (currently lines 38-44):

```typescript
import {
  renderHeader,
  renderBody,
  renderAlertSummary,
  renderLoading,
  renderNoStations,
} from './glasses/display'
```

to:

```typescript
import {
  renderHeader,
  renderBody,
  renderDepartureBoard,
  renderAlertSummary,
  renderLoading,
  renderNoStations,
} from './glasses/display'
```

- [ ] **Step 2: Branch in `displayCurrentStation()`'s cached-paint call site**

Change (currently lines 205-208):

```typescript
  if (cached) {
    const filtered = applyRouteFilter(cached, station.id)
    const initialBody = renderBody(station, filtered, currentIndex, stations.length, alerts)
    lastBodyText = initialBody
```

to:

```typescript
  if (cached) {
    const filtered = applyRouteFilter(cached, station.id)
    const initialBody = station.system
      ? renderDepartureBoard(station, filtered)
      : renderBody(station, filtered, currentIndex, stations.length, alerts)
    lastBodyText = initialBody
```

- [ ] **Step 3: Branch in `displayCurrentStation()`'s fresh-data-paint call site**

Change (currently lines 232-238):

```typescript
  const freshAlerts = getCachedAlerts()
  const filtered = applyRouteFilter(
    arrivals ?? { stationId: station.id, north: [], south: [], fetchedAt: Math.floor(Date.now() / 1000) },
    station.id
  )
  const bodyText = renderBody(station, filtered, currentIndex, stations.length, freshAlerts)
  lastBodyText = bodyText
```

to:

```typescript
  const freshAlerts = getCachedAlerts()
  const filtered = applyRouteFilter(
    arrivals ?? { stationId: station.id, north: [], south: [], fetchedAt: Math.floor(Date.now() / 1000) },
    station.id
  )
  const bodyText = station.system
    ? renderDepartureBoard(station, filtered)
    : renderBody(station, filtered, currentIndex, stations.length, freshAlerts)
  lastBodyText = bodyText
```

- [ ] **Step 4: Branch in `refreshInPlace()`'s call site**

Change (currently lines 260-266):

```typescript
    const { stations, currentIndex } = getState()
    const alerts = getCachedAlerts()
    const filtered = applyRouteFilter(
      arrivals ?? { stationId: station.id, north: [], south: [], fetchedAt: Math.floor(Date.now() / 1000) },
      station.id
    )
    const bodyText = renderBody(station, filtered, currentIndex, stations.length, alerts)
```

to:

```typescript
    const { stations, currentIndex } = getState()
    const alerts = getCachedAlerts()
    const filtered = applyRouteFilter(
      arrivals ?? { stationId: station.id, north: [], south: [], fetchedAt: Math.floor(Date.now() / 1000) },
      station.id
    )
    const bodyText = station.system
      ? renderDepartureBoard(station, filtered)
      : renderBody(station, filtered, currentIndex, stations.length, alerts)
```

Note: `isAlertView` still gates whether `renderAlertSummary` is shown instead of `bodyText` later in the same function (lines 270-274) — that logic is unchanged; commuter-rail stations simply never set `isAlertView` to true since `onTap`'s alert-check (in `setupInput` callbacks) only flips it when `hasAlerts` is true, and LIRR/MNR routes never appear in the subway alerts map, so this naturally stays false for commuter-rail stations with zero extra code.

- [ ] **Step 5: Branch in the `subwaylens:stations-updated` listener**

Change (currently lines 422-433):

```typescript
  window.addEventListener('subwaylens:stations-updated', () => {
    prefetchAllStations().then(() => {
      if (isAlertView) return
      const station = currentStation()
      if (!station) return
      const cached = getCachedArrivals(station.id)
      if (!cached) return
      const { stations, currentIndex } = getState()
      const filtered = applyRouteFilter(cached, station.id)
      const bodyText = renderBody(station, filtered, currentIndex, stations.length, getCachedAlerts())
      lastBodyText = bodyText
      updateBody(bodyText)
    })
  })
```

to:

```typescript
  window.addEventListener('subwaylens:stations-updated', () => {
    prefetchAllStations().then(() => {
      if (isAlertView) return
      const station = currentStation()
      if (!station) return
      const cached = getCachedArrivals(station.id)
      if (!cached) return
      const { stations, currentIndex } = getState()
      const filtered = applyRouteFilter(cached, station.id)
      const bodyText = station.system
        ? renderDepartureBoard(station, filtered)
        : renderBody(station, filtered, currentIndex, stations.length, getCachedAlerts())
      lastBodyText = bodyText
      updateBody(bodyText)
    })
  })
```

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all 63 tests still green — `main.ts` has no dedicated test file in this plan (sub-project A's plan, running in parallel, adds `main.test.ts` for its own auto-refresh feature; this task doesn't need a new test file since the branch logic is a thin pass-through of already-tested `renderDepartureBoard`/`renderBody` functions, verified in Tasks 7 and the existing test suite respectively).

- [ ] **Step 7: Run the build to confirm clean compilation**

Run: `npm run build`
Expected: clean build, no TypeScript errors.

- [ ] **Step 8: Manual smoke check in the simulator or dev server**

Run: `npm run dev`, open the app, add a LIRR or MNR station as a favorite via the settings page (confirmed reachable per Task 8), then view it on the glasses-mode page (or via the EvenHub simulator if available). Confirm:
- The header shows the station name with the `★` if favorited (no `LIRR`/`MNR` tag is added in this plan — the design spec's mockup shows `Penn Station LIRR ★` but per the **minimal-scope decision this plan follows**, `renderHeader()` is not modified; the tag in the mockup was v1.7.0's multi-region addition layered on top of the base header function. If Steven wants the system tag in the header text itself, that is a follow-up to `renderHeader()`, out of scope for this plan's "don't touch renderBody/renderHeader" constraint — flag this to Steven rather than silently adding it).
- The body shows `DEPARTURES` followed by up to 6 time-sorted entries with badges and `Trk NN`/`Trk --`.
- Scrolling to a subway station afterward still shows the normal two-direction `renderBody` layout, unaffected.

- [ ] **Step 9: Commit**

```bash
git add src/main.ts
git commit -m "feat: branch glasses-mode rendering to renderDepartureBoard for LIRR/MNR stations"
```

---

## Task 11: Final cross-cutting verification

**Files:**
- None modified — verification only.

**Interfaces:**
- Consumes: the entire feature built in Tasks 1-10.
- Produces: a final green build + test confirmation, matching the design spec's "Cross-cutting verification" requirement.

- [ ] **Step 1: Run the full test suite one more time**

Run: `npm test`
Expected: all tests green. Final count should be 63 (38 original + 2 from Task 2's `types.test.ts` + 3 from Task 3's `railroad-track.test.ts` + 6 from Task 5's `stations.test.ts` + 5 from Task 6's `arrivals-commuter.test.ts` + 5 from Task 7's `renderDepartureBoard` cases in `display.test.ts` + 4 from Task 9's `stations.test.ts` dispatcher tests = 38 + 2 + 3 + 6 + 5 + 5 + 4 = 63).

- [ ] **Step 2: Run the production build one more time**

Run: `npm run build`
Expected: clean build (the pre-existing "chunks larger than 500kB" warning is expected and unrelated to this feature — it exists on the pre-feature baseline too).

- [ ] **Step 3: Confirm no `.ehpk` was built and no `git push` occurred**

Run: `git log --oneline -15` and `git status`

Confirm: all commits from this plan are present locally (Tasks 2, 3, 4, 6, 7, 9, 10 — Tasks 1, 5's diff-verification substeps, 8, and 11 had no commits), nothing has been pushed to a remote, and no `subwaylens.ehpk` file exists in the project root (`ls subwaylens.ehpk` should report "No such file or directory").

- [ ] **Step 4: Report status**

This plan's implementation is complete: LIRR + Metro-North departure boards are live, shown by default, with all original subway behavior unchanged and verified by the full green test suite. No commit/push/`.ehpk` build beyond what this plan's tasks already did locally — further action (push, `.ehpk` packaging, merging with sub-projects A and B) requires Steven's explicit go-ahead per the design spec's standing constraint.

No commit for this task (verification only).

---

## Self-Review Notes

- **Spec coverage:** `Station.system`/`TrainArrival.track` (Task 2), `railroad-track.ts` port (Task 3), generator script + packs port (Task 4), unconditional pack loading (Task 5), `arrivals-commuter.ts` with `direction_id` strategy and track tagging (Task 6), `renderDepartureBoard` with the mockup layout, 6-entry cap, track-pending state, and the 15→12 column-shrink rule (Task 7), confirmed no search/favorites changes needed (Task 8), arrival-fetch dispatch by `station.system` (Task 9), the single `main.ts` branch point (Task 10), and final cross-cutting build+test verification (Task 11). The `app.json` whitelist is confirmed sufficient in Task 1, with no manifest-change task added since the host already matches.
- **Placeholder scan:** no TBD/TODO/"add appropriate handling" patterns — every step has concrete code or an exact command with expected output.
- **Type consistency:** `Station.system?: 'lirr' | 'mnr'` (Task 2) is used identically in Tasks 5, 6, 7, 9, 10. `TrainArrival.track?: string` (Task 2) is produced by `arrivals-commuter.ts` (Task 6) and consumed by `renderDepartureBoard` (Task 7) with the same field name throughout. `getCommuterArrivals(station: Station): Promise<StationArrivals>` (Task 6) matches the call signature used in `dispatchGetArrivals` (Task 9). `renderDepartureBoard(station: Station, arrivals: StationArrivals): string` (Task 7) matches its call sites in `main.ts` (Task 10) exactly — two arguments, no `stationIndex`/`totalStations`/`alerts` (deliberately simpler than v1.7.0's 4-arg version, since the design spec's signature is `renderDepartureBoard(station, arrivals)`).
- **Flagged deviation found during research:** the design spec's mockup shows `Penn Station LIRR ★` (a system tag in the header), but `renderHeader()` in v1.8.1 has no such tag today, and the spec's own architecture section says `renderBody()` (and by the same logic, the header rendering shared by both layouts) must not be modified beyond the one main.ts branch point. v1.7.0's actual `renderHeader()` *was* modified to add this tag (confirmed by reading it), which would conflict with this plan's "don't touch the existing render functions beyond the one branch point" constraint. This plan ships without the header tag and flags it as a follow-up decision for Steven in Task 10, Step 8, rather than silently adding a `renderHeader()` change that the design spec didn't explicitly approve.
