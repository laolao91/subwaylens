# Equipment-Outage `!` Header Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a one-character `!` marker in the glasses header (and matching `[ELEV]`/`[ESC]` lines in the existing tap-to-alerts summary view) when a station has an active elevator/escalator outage, sourced from MTA's equipment-outage feed.

**Architecture:** New `src/data/outages.ts` mirrors `src/data/alerts.ts` exactly — fetch + 60s cache + 8s `AbortController` timeout, never throws, returns last-good cache on failure. `renderHeader()` gains an optional `hasOutage: boolean` param appending `!` after the favorite star. `renderAlertSummary()` merges `[ELEV]`/`[ESC]`-badged outage lines above the existing `[ROUTE]` alert lines. `main.ts` fetches outages on the exact same cadence as `refreshAlerts()` (same 4 call sites) and threads the result into both render calls. The external feed's exact shape is unconfirmed from this sandbox (network egress is firewalled here) — Task 1 is a real spike task with documented fallback and contingency, not a placeholder.

**Tech Stack:** TypeScript, Vitest (`vi.fn`/`global.fetch` mocking, see `src/lib/geo.test.ts` for the project's mocking style), no new dependencies expected (JSON-shape primary path needs none; HTML-scrape fallback would need a lightweight parse — see Task 1's contingency notes).

## Global Constraints

- No `git commit`, `git push`, or `.ehpk` build without Steven's explicit go-ahead. This plan's steps include local commits (per standing project norm that local commits are fine), but **no step pushes**.
- Do not modify `renderBody()`'s existing N/S subway layout, container dimensions, or any behavior carried over from v1.6.x.
- Do not reintroduce out-of-scope items: multi-city/BART/MBTA, region-picker UI, `AppSettings.regionId`, schedule fallback, big-number/glance mode, leave-by times.
- `outages.ts`'s error-handling posture must exactly match `alerts.ts`: fetch failure (timeout, non-200, decode error, thrown exception) returns the last good cache (or empty `Map` on first load) — **never throws**, **never blocks rendering**.
- A station with no outage data must render exactly as it does today (no `!`, no `[ELEV]`/`[ESC]` lines) — zero visual regression for the common case.
- `app.json`'s network whitelist only gets the new host added once Task 1's spike confirms which host it actually is — do not add a host that hasn't been verified to respond.
- Existing 38 tests (`npm test`) and `npm run build` must stay green after every task in this plan, and must still be green at the end.
- If Task 1's spike produces neither a JSON/XML feed match nor a scrapeable HTML report within reasonable effort, the contingency is to **stop this plan after Task 1** and report back rather than building speculative parsing logic against an unconfirmed shape — this is documented as a real possible outcome, not hidden.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/lib/types.ts` | Modify | Add `EquipmentOutage` interface |
| `src/data/outages.ts` | Create | Fetch + cache + parse the MTA equipment-outage feed into `Map<stationComplexId, EquipmentOutage[]>` |
| `src/data/outages.test.ts` | Create | Vitest coverage for `outages.ts`'s cache/timeout/error/parse behavior |
| `src/glasses/display.ts` | Modify | `renderHeader()` gains `hasOutage` param; `renderAlertSummary()` merges outage lines above route-alert lines |
| `src/glasses/display.test.ts` | Modify | New `describe` blocks for `renderHeader` and `renderAlertSummary` outage cases |
| `src/glasses/stations.ts` | Modify | Add `refreshOutages()` / `getCachedOutages()`, mirroring the existing `refreshAlerts()` / `getCachedAlerts()` pair |
| `src/main.ts` | Modify | Call `refreshOutages()` alongside every existing `refreshAlerts()` call site; pass outage data into `renderHeader`/`renderAlertSummary` calls |
| `app.json` | Modify | Add the confirmed outage-feed host to the network permission whitelist |

---

### Task 1: Spike — confirm the real MTA equipment-outage feed shape

**Files:**
- Create (scratch, not committed): a throwaway local script or `curl` session run from a real network-connected machine — **not** this sandbox, whose direct network egress to non-whitelisted hosts is firewalled (confirmed: a `curl` to `advisory.mtanyct.info` from this sandbox returns connection-refused).
- No production file changes in this task. This task's deliverable is a decision, written down, that the next tasks depend on.

**Interfaces:**
- Consumes: nothing from earlier tasks (this is the first task).
- Produces: a confirmed feed shape (or a documented "neither path worked" outcome) that Task 2 onward depends on. Specifically, produces the answer to: "what HTTP method + URL + response format gives per-station EL/ES outage data, keyed by what station identifier?"

This task cannot be executed inside this sandboxed environment — it requires a developer running it from their own network-connected machine. Hand these exact steps to whoever has that access:

- [ ] **Step 1: Probe the equipment list endpoint**

```bash
curl -sv "https://advisory.mtanyct.info/eedevwebsvc/allequipments.aspx" -o /tmp/equipments_response.txt
cat /tmp/equipments_response.txt | head -c 2000
```

Expected: either valid JSON/XML listing elevator/escalator equipment with station IDs, or an HTTP error. Record the exact `Content-Type` response header and the first ~50 lines of body shape (note field names, especially anything that looks like a station complex ID, equipment ID, or `ADA` flag).

- [ ] **Step 2: Probe for a sibling outages endpoint on the same path**

MTA's typical pattern pairs an equipment list with a separate outages list joined by equipment ID. Try these candidate paths (adjust based on what Step 1's response reveals about naming conventions):

```bash
curl -sv "https://advisory.mtanyct.info/eedevwebsvc/outages.aspx" -o /tmp/outages_response.txt
curl -sv "https://advisory.mtanyct.info/eedevwebsvc/getoutages.aspx" -o /tmp/outages_response2.txt
curl -sv "https://advisory.mtanyct.info/eedevwebsvc/allequipments.aspx?outages=1" -o /tmp/outages_response3.txt
cat /tmp/outages_response.txt /tmp/outages_response2.txt /tmp/outages_response3.txt 2>/dev/null | head -c 3000
```

Expected: one of these (or a variant discovered from Step 1's response if it embeds outage status directly per equipment record — check for a status/outage boolean field in the Step 1 response first, since the equipment list itself may already include current outage state, eliminating the need for a separate call). Record which URL worked and the exact response shape: field names, nesting, station-ID field name, equipment-type field name and its possible values (confirm whether it's literally `EL`/`ES` or something else like `Elevator`/`Escalator`), and whether an estimated-return-to-service field exists and its name/format.

- [ ] **Step 3: Fallback — confirm the HTML scrape path works if Step 1/2 found no clean JSON/XML feed**

```bash
curl -sv "https://advisory.mtanyct.info/EEoutage/EEOutageReport.aspx?StationID=All" -o /tmp/outage_report.html
grep -o '<table[^>]*>' /tmp/outage_report.html | head -5
wc -l /tmp/outage_report.html
```

Expected: an HTML page with a table of current outages. Cross-reference structure against the precedent scraper at `github.com/jeremiak/mta-elevator-outages` (inspect that repo's parsing logic for the exact table/row/cell selectors it uses — it scrapes this exact page, so its CSS selectors or regex patterns can be ported directly rather than re-derived from scratch).

- [ ] **Step 4: Record the decision and stop or continue**

Write the outcome as a one-paragraph note (in the commit message of Task 2's first commit, or in a scratch file outside `src/` — not part of the shipped app) covering:
- Which endpoint/method worked (Step 1/2 JSON/XML, or Step 3 HTML scrape)
- The exact field names needed for `EquipmentOutage.stationComplexId`, `equipmentType`, `description`, `estimatedReturn`
- The exact host to whitelist in `app.json` (confirm it really is `advisory.mtanyct.info` and not a redirect target — follow any 301/302 with `curl -L` and record the final host)

**Contingency — if neither Step 2 nor Step 3 produces a workable feed:** Stop this plan here. Do not proceed to Task 2 with invented field names. Report back that Sub-project B (equipment-outage indicator) is deferred, and that Sub-projects A and C from the same design batch are unaffected and can proceed independently. This is an explicitly acceptable outcome per the design spec, not a failure of this plan.

**If Step 1/2 succeeded (JSON/XML path) — this is the assumed-confirmed path the rest of this plan's test code is written against:** Proceed to Task 2 using the `eedevwebsvc`-style JSON response as the shape. **Before implementing Task 3's parsing logic, re-read this task's recorded field names and adjust the parsing code in Task 3, Step 3 to match — the field names used in Task 3 below (`station`, `equipmentno`, `equipmenttype`, `outagestart`/`estimatedreturntoservice`) are a best-guess placeholder shape based on MTA's publicly documented `eedevwebsvc` schema for the *equipment* list, extrapolated to outages; they are explicitly called out for adjustment, not assumed correct.**

- [ ] **Step 5: Commit the spike decision (if a scratch note was kept under `docs/`)**

Only if you wrote a scratch decision note under `docs/` (not `src/`):

```bash
git add docs/superpowers/spikes/2026-06-23-outage-feed-spike-result.md
git commit -m "docs: record MTA equipment-outage feed spike result"
```

If no such note was kept (decision recorded only in your own working notes), skip this step — there is nothing to commit yet.

---

### Task 2: Add `EquipmentOutage` type

**Files:**
- Modify: `src/lib/types.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `EquipmentOutage` interface, consumed by `src/data/outages.ts` (Task 3) and `src/glasses/display.ts` (Tasks 5–6).

This is a pure type addition with no runtime behavior, so there's no failing-test step — add it directly and verify the build still type-checks.

- [ ] **Step 1: Add the type**

In `src/lib/types.ts`, after the closing brace of the `StationArrivals` interface (currently ending at line 29) and before `AppSettings` (currently starting at line 32), insert:

```typescript
/** An active elevator/escalator outage at a station complex */
export interface EquipmentOutage {
  stationComplexId: string
  equipmentType: 'EL' | 'ES'
  description: string
  estimatedReturn?: string
}
```

- [ ] **Step 2: Verify the project still type-checks**

Run: `npm run build`
Expected: clean build, no TypeScript errors (this step only adds an unused-but-valid exported interface, so nothing should break).

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add EquipmentOutage type"
```

---

### Task 3: `src/data/outages.ts` — fetch layer with cache/timeout/error handling

**Files:**
- Create: `src/data/outages.ts`
- Create: `src/data/outages.test.ts`

**Interfaces:**
- Consumes: `EquipmentOutage` from `src/lib/types.ts` (Task 2).
- Produces:
  - `fetchOutages(): Promise<Map<string, EquipmentOutage[]>>` — keyed by `stationComplexId`, consumed by `src/glasses/stations.ts` (Task 7).
  - `stationHasOutage(outages: Map<string, EquipmentOutage[]>, stationId: string): boolean` — consumed by `src/glasses/display.ts` (Task 5) and `src/main.ts` (Task 7/8 wiring).
  - `outagesForStation(outages: Map<string, EquipmentOutage[]>, stationId: string): EquipmentOutage[]` — consumed by `src/glasses/display.ts` (Task 6) to build `[ELEV]`/`[ESC]` lines.

This task writes tests against the JSON-shape primary assumption flagged in Task 1 Step 4. **If Task 1's spike confirmed a different field layout, or confirmed the HTML-scrape fallback instead, adjust this task's fixture JSON and parsing logic to match before writing the implementation** — the test *behavior* (cache/timeout/error semantics) stays identical either way; only the parsing internals of Step 3 change.

- [ ] **Step 1: Write the failing tests for cache, timeout, and error behavior**

Create `src/data/outages.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fetchOutages, stationHasOutage, outagesForStation } from './outages'

const SAMPLE_RESPONSE = {
  equipments: [
    {
      station: '127',
      equipmentno: 'EL123',
      equipmenttype: 'EL',
      isactive: 'true',
      outagestart: '2026-06-23T08:00:00',
      estimatedreturntoservice: '2026-06-23T18:00:00',
      reason: 'Maintenance',
    },
    {
      station: '127',
      equipmentno: 'ES456',
      equipmenttype: 'ES',
      isactive: 'false',
      outagestart: '',
      estimatedreturntoservice: '',
      reason: '',
    },
    {
      station: 'A03',
      equipmentno: 'EL789',
      equipmenttype: 'EL',
      isactive: 'true',
      outagestart: '2026-06-22T10:00:00',
      estimatedreturntoservice: '',
      reason: 'Repair',
    },
  ],
}

function mockFetchOnce(body: unknown, ok = true, status = 200): void {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(body)).buffer,
    json: async () => body,
  }) as unknown as typeof fetch
}

beforeEach(() => {
  vi.useRealTimers()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchOutages', () => {
  it('returns a Map keyed by station complex ID with only active outages', async () => {
    mockFetchOnce(SAMPLE_RESPONSE)
    const result = await fetchOutages()
    expect(result.get('127')).toHaveLength(1)
    expect(result.get('127')?.[0].equipmentType).toBe('EL')
    expect(result.get('A03')).toHaveLength(1)
  })

  it('excludes inactive equipment entries', async () => {
    mockFetchOnce(SAMPLE_RESPONSE)
    const result = await fetchOutages()
    const station127 = result.get('127') ?? []
    expect(station127.some(o => o.description === '')).toBe(false)
  })

  it('returns an empty Map (not throwing) when fetch resolves non-200', async () => {
    mockFetchOnce({}, false, 503)
    const result = await fetchOutages()
    expect(result.size).toBe(0)
  })

  it('returns an empty Map (not throwing) when fetch rejects entirely', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch
    const result = await fetchOutages()
    expect(result).toBeInstanceOf(Map)
    expect(result.size).toBe(0)
  })

  it('returns last good cache on a subsequent failure rather than clearing it', async () => {
    mockFetchOnce(SAMPLE_RESPONSE)
    const first = await fetchOutages()
    expect(first.size).toBeGreaterThan(0)

    // Force cache to be considered stale by manipulating Date.now via fake timers,
    // then simulate a failed re-fetch.
    vi.useFakeTimers()
    vi.advanceTimersByTime(61_000)
    global.fetch = vi.fn().mockRejectedValue(new Error('timeout')) as unknown as typeof fetch
    const second = await fetchOutages()
    expect(second.size).toBe(first.size)
    vi.useRealTimers()
  })
})

describe('stationHasOutage', () => {
  it('returns true when the station has at least one outage entry', () => {
    const outages = new Map([['127', [{ stationComplexId: '127', equipmentType: 'EL' as const, description: 'x' }]]])
    expect(stationHasOutage(outages, '127')).toBe(true)
  })

  it('returns false when the station has no entry', () => {
    const outages = new Map<string, import('../lib/types').EquipmentOutage[]>()
    expect(stationHasOutage(outages, '127')).toBe(false)
  })

  it('returns false when the station has an empty array entry', () => {
    const outages = new Map([['127', []]])
    expect(stationHasOutage(outages, '127')).toBe(false)
  })
})

describe('outagesForStation', () => {
  it('returns the outage list for a known station', () => {
    const entry = { stationComplexId: '127', equipmentType: 'EL' as const, description: 'Out of service' }
    const outages = new Map([['127', [entry]]])
    expect(outagesForStation(outages, '127')).toEqual([entry])
  })

  it('returns an empty array for an unknown station', () => {
    const outages = new Map<string, import('../lib/types').EquipmentOutage[]>()
    expect(outagesForStation(outages, 'unknown')).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/data/outages.test.ts`
Expected: FAIL with `Cannot find module './outages'` (file doesn't exist yet).

- [ ] **Step 3: Implement `src/data/outages.ts`**

```typescript
/**
 * MTA equipment-outage fetcher and parser.
 *
 * Fetches the elevator/escalator outage feed and returns active outages
 * keyed by affected station complex ID.
 *
 * Mirrors alerts.ts's shape exactly: fetch + 60s cache + 8s AbortController
 * timeout, same error-handling posture (never throws, returns last good
 * cache on failure).
 *
 * NOTE: parsing logic below targets the eedevwebsvc-style JSON response
 * assumed during planning (see docs/superpowers/specs/2026-06-23-device-
 * awareness-outages-lirr-design.md, Sub-project B). If the spike in the
 * implementation plan's Task 1 confirmed a different shape (different
 * field names, XML instead of JSON, or the EEOutageReport.aspx HTML-scrape
 * fallback), adjust the field-extraction logic in fetchOutages() below —
 * the cache/timeout/error structure around it does not change.
 */

import type { EquipmentOutage } from '../lib/types'
import { OUTAGES_FEED_URL } from './feed-urls'

interface RawEquipmentRecord {
  station?: string
  equipmentno?: string
  equipmenttype?: string
  isactive?: string
  outagestart?: string
  estimatedreturntoservice?: string
  reason?: string
}

interface RawOutageResponse {
  equipments?: RawEquipmentRecord[]
}

/** Cache: last fetched outages per station complex ID */
let cachedOutages: Map<string, EquipmentOutage[]> = new Map()
let lastFetchedAt = 0
const CACHE_TTL_MS = 60_000 // 1 minute

/**
 * Fetch and parse active MTA equipment (elevator/escalator) outages.
 * Returns a Map of stationComplexId -> EquipmentOutage[].
 * Results are cached for CACHE_TTL_MS to avoid redundant fetches.
 */
export async function fetchOutages(): Promise<Map<string, EquipmentOutage[]>> {
  const now = Date.now()
  if (now - lastFetchedAt < CACHE_TTL_MS) {
    return cachedOutages
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const response = await fetch(OUTAGES_FEED_URL, {
      signal: controller.signal,
      headers: { 'Cache-Control': 'no-cache' },
    })
    clearTimeout(timeout)

    if (!response.ok) {
      console.warn('Outages feed returned', response.status)
      return cachedOutages
    }

    const buffer = await response.arrayBuffer()
    const text = new TextDecoder().decode(buffer)
    const data = JSON.parse(text) as RawOutageResponse

    const result = new Map<string, EquipmentOutage[]>()
    for (const rec of data.equipments ?? []) {
      if (rec.isactive !== 'true') continue
      const stationComplexId = rec.station
      const equipmentType = rec.equipmenttype === 'ES' ? 'ES' : 'EL'
      if (!stationComplexId) continue

      const outage: EquipmentOutage = {
        stationComplexId,
        equipmentType,
        description: rec.reason ?? '',
        estimatedReturn: rec.estimatedreturntoservice || undefined,
      }

      const existing = result.get(stationComplexId) ?? []
      existing.push(outage)
      result.set(stationComplexId, existing)
    }

    cachedOutages = result
    lastFetchedAt = now
    return result
  } catch (err) {
    console.warn('Failed to fetch outages:', err)
    return cachedOutages
  }
}

/**
 * Check if a given station complex has an active outage.
 */
export function stationHasOutage(
  outages: Map<string, EquipmentOutage[]>,
  stationId: string
): boolean {
  return (outages.get(stationId)?.length ?? 0) > 0
}

/**
 * Get the outage list for a given station complex.
 */
export function outagesForStation(
  outages: Map<string, EquipmentOutage[]>,
  stationId: string
): EquipmentOutage[] {
  return outages.get(stationId) ?? []
}
```

Add the feed URL constant to `src/data/feed-urls.ts`. Open that file and append after `ALERTS_FEED_URL` (currently ending at line 50):

```typescript

/**
 * MTA equipment (elevator/escalator) outage feed.
 * Host confirmed during the implementation-plan spike (Task 1) — adjust
 * this URL if the spike found a different path or the HTML-scrape fallback
 * was used instead.
 */
export const OUTAGES_FEED_URL =
  'https://advisory.mtanyct.info/eedevwebsvc/allequipments.aspx'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/data/outages.test.ts`
Expected: PASS, all 9 tests.

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: PASS, 38 existing + 9 new = 47 tests.

- [ ] **Step 6: Commit**

```bash
git add src/data/outages.ts src/data/outages.test.ts src/data/feed-urls.ts
git commit -m "feat: add outages.ts fetch layer for equipment outages"
```

---

### Task 4: `renderHeader()` gains `hasOutage` parameter

**Files:**
- Modify: `src/glasses/display.ts:65-74`
- Modify: `src/glasses/display.test.ts`

**Interfaces:**
- Consumes: nothing new (boolean parameter only).
- Produces: `renderHeader(station: Station, isFavorite: boolean, hasOutage?: boolean): string` — the third parameter is consumed by `src/main.ts` (Task 7).

- [ ] **Step 1: Write the failing tests**

The existing `display.test.ts` comment (lines 4-6) notes `renderHeader` isn't tested today because it needs a full `Station` object. Add a minimal fixture and new test cases.

First, update the existing import lines at the top of `src/glasses/display.test.ts` (lines 1-2) to pull in `renderHeader` and the `Station` type:

```typescript
import { describe, it, expect } from 'vitest'
import { renderLoading, renderNoStations, formatDirectionLine, renderHeader } from './display'
import type { Station } from '../lib/types'
```

Then append the fixture and new test cases to the end of `src/glasses/display.test.ts`:

```typescript
function makeTestStation(overrides: Partial<Station> = {}): Station {
  return {
    id: '127',
    name: '125 St',
    stops: ['127'],
    routes: ['A', 'B', 'C', 'D'],
    lat: 40.811,
    lng: -73.9555,
    north: 'Uptown',
    south: 'Downtown',
    ...overrides,
  }
}

describe('renderHeader', () => {
  it('renders the station name with no star and no outage marker by default', () => {
    const result = renderHeader(makeTestStation(), false)
    expect(result).toContain('125 St')
    expect(result).not.toContain('★')
    expect(result).not.toContain('!')
  })

  it('appends the favorite star when isFavorite is true', () => {
    const result = renderHeader(makeTestStation(), true)
    expect(result).toContain('★')
  })

  it('appends "!" immediately after the star when hasOutage is true and isFavorite is true', () => {
    const result = renderHeader(makeTestStation(), true, true)
    expect(result).toContain('★!')
  })

  it('appends "!" with no star when hasOutage is true and isFavorite is false', () => {
    const result = renderHeader(makeTestStation(), false, true)
    expect(result).toContain('!')
    expect(result).not.toContain('★')
  })

  it('omits "!" entirely when hasOutage is false or omitted', () => {
    const result = renderHeader(makeTestStation(), true, false)
    expect(result).not.toContain('!')
    const resultOmitted = renderHeader(makeTestStation(), true)
    expect(resultOmitted).not.toContain('!')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/glasses/display.test.ts -t renderHeader`
Expected: FAIL — `renderHeader(..., true, true)` produces a result not containing `★!` (the third argument is currently ignored since the parameter doesn't exist).

- [ ] **Step 3: Implement the `hasOutage` parameter**

In `src/glasses/display.ts`, replace the existing `renderHeader` function (lines 65-74):

```typescript
export function renderHeader(
  station: Station,
  isFavorite: boolean,
  hasOutage: boolean = false
): string {
  const star = isFavorite ? ' ★' : ''
  const outageMark = hasOutage ? '!' : ''
  const timeStr = getCurrentTimeStr()
  const name = station.name
  const maxNameLen = CHARS_PER_LINE - star.length - outageMark.length - 1 - timeStr.length
  const displayName =
    name.length > maxNameLen ? name.slice(0, maxNameLen - 2) + '..' : name
  const gap = Math.max(
    1,
    CHARS_PER_LINE - displayName.length - star.length - outageMark.length - timeStr.length
  )
  return displayName + star + outageMark + ' '.repeat(gap) + timeStr
}
```

Note: when `isFavorite` is false and `hasOutage` is true, `star` is `''` and `outageMark` is `'!'`, so the result is `displayName + '!' + gap + timeStr` — no stray leading space, matching the test's expectation of `!` present without `★`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/glasses/display.test.ts -t renderHeader`
Expected: PASS, all 5 new tests.

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: PASS, all existing tests plus the 5 new ones still green (the `hasOutage` parameter is optional with a default, so every existing two-argument call site is unaffected).

- [ ] **Step 6: Commit**

```bash
git add src/glasses/display.ts src/glasses/display.test.ts
git commit -m "feat: renderHeader appends ! marker for equipment outages"
```

---

### Task 5: `renderAlertSummary()` merges outage entries above route alerts

**Files:**
- Modify: `src/glasses/display.ts:248-284`
- Modify: `src/glasses/display.test.ts`

**Interfaces:**
- Consumes: `outagesForStation` from `src/data/outages.ts` (Task 3); `EquipmentOutage` from `src/lib/types.ts` (Task 2).
- Produces: `renderAlertSummary(arrivals: StationArrivals, alerts: Map<string, RouteAlert[]>, outages?: EquipmentOutage[]): string` — the third parameter consumed by `src/main.ts` (Task 7).

This task changes `renderAlertSummary`'s signature to accept the station's outage list directly (already filtered to one station by the caller via `outagesForStation`), rather than the full outages Map plus a station ID — consistent with how `alertsForRoutes` already does route-based filtering before this function is called, keeping `renderAlertSummary` itself free of lookup logic.

- [ ] **Step 1: Write the failing tests**

First, update the two import lines at the top of `src/glasses/display.test.ts` again (the ones Task 4 just edited) to add `renderAlertSummary` and the remaining types:

```typescript
import { describe, it, expect } from 'vitest'
import { renderLoading, renderNoStations, formatDirectionLine, renderHeader, renderAlertSummary } from './display'
import type { Station, StationArrivals, TrainArrival, EquipmentOutage } from '../lib/types'
```

Then append the fixtures and new test cases to the end of `src/glasses/display.test.ts`:

```typescript
function makeArrival(overrides: Partial<TrainArrival> = {}): TrainArrival {
  return {
    route: 'A',
    direction: 'N',
    stopId: 'A03N',
    arrivalTime: Math.floor(Date.now() / 1000) + 300,
    terminal: 'Inwood-207 St',
    ...overrides,
  }
}

function makeArrivals(overrides: Partial<StationArrivals> = {}): StationArrivals {
  return {
    stationId: '127',
    north: [makeArrival()],
    south: [],
    fetchedAt: Math.floor(Date.now() / 1000),
    ...overrides,
  }
}

describe('renderAlertSummary with outages', () => {
  it('renders "No active alerts." when there are no route alerts and no outages', () => {
    const result = renderAlertSummary(makeArrivals(), new Map())
    expect(result).toContain('No active alerts.')
  })

  it('renders an [ELEV] line for an EL outage with no route alerts present', () => {
    const outages: EquipmentOutage[] = [
      { stationComplexId: '127', equipmentType: 'EL', description: 'Elevator out of service' },
    ]
    const result = renderAlertSummary(makeArrivals(), new Map(), outages)
    expect(result).toContain('[ELEV]')
    expect(result).toContain('Elevator out of service')
    expect(result).not.toContain('No active alerts.')
  })

  it('renders an [ESC] line for an ES outage', () => {
    const outages: EquipmentOutage[] = [
      { stationComplexId: '127', equipmentType: 'ES', description: 'Escalator down' },
    ]
    const result = renderAlertSummary(makeArrivals(), new Map(), outages)
    expect(result).toContain('[ESC]')
    expect(result).toContain('Escalator down')
  })

  it('sorts outage lines above route alert lines', () => {
    const alerts = new Map([['A', [{ routeId: 'A', headerText: 'Delays on A', effect: 2 }]]])
    const outages: EquipmentOutage[] = [
      { stationComplexId: '127', equipmentType: 'EL', description: 'Elevator out of service' },
    ]
    const result = renderAlertSummary(makeArrivals(), alerts, outages)
    const elevIndex = result.indexOf('[ELEV]')
    const routeIndex = result.indexOf('[A]')
    expect(elevIndex).toBeGreaterThan(-1)
    expect(routeIndex).toBeGreaterThan(-1)
    expect(elevIndex).toBeLessThan(routeIndex)
  })

  it('wraps a long outage description across two lines like route alerts do', () => {
    const longDescription = 'A'.repeat(60)
    const outages: EquipmentOutage[] = [
      { stationComplexId: '127', equipmentType: 'EL', description: longDescription },
    ]
    const result = renderAlertSummary(makeArrivals(), new Map(), outages)
    const lines = result.split('\n')
    const firstLineIdx = lines.findIndex(l => l.includes('[ELEV]'))
    expect(firstLineIdx).toBeGreaterThan(-1)
    expect(lines[firstLineIdx].length).toBeLessThanOrEqual(38)
  })

  it('still caps total displayed entries at 4 combined outages + alerts', () => {
    const outages: EquipmentOutage[] = [
      { stationComplexId: '127', equipmentType: 'EL', description: 'Outage 1' },
      { stationComplexId: '127', equipmentType: 'ES', description: 'Outage 2' },
    ]
    const alerts = new Map([
      ['A', [{ routeId: 'A', headerText: 'Alert A', effect: 2 }]],
      ['B', [{ routeId: 'B', headerText: 'Alert B', effect: 2 }]],
      ['C', [{ routeId: 'C', headerText: 'Alert C', effect: 2 }]],
    ])
    const result = renderAlertSummary(
      makeArrivals({ north: [makeArrival({ route: 'A' }), makeArrival({ route: 'B' }), makeArrival({ route: 'C' })] }),
      alerts,
      outages
    )
    const badgeCount = (result.match(/\[(ELEV|ESC|A|B|C)\]/g) ?? []).length
    expect(badgeCount).toBeLessThanOrEqual(4)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/glasses/display.test.ts -t "renderAlertSummary with outages"`
Expected: FAIL — `renderAlertSummary` currently takes 2 arguments and ignores a 3rd; outage entries never appear, so the `[ELEV]`/`[ESC]` assertions fail.

- [ ] **Step 3: Implement the outage merge**

In `src/glasses/display.ts`, replace `renderAlertSummary` (lines 248-284):

```typescript
/**
 * Render the alert summary view.
 * Shown when user taps while alerts or outages are active.
 * Outage entries (elevator/escalator) are merged in above route alerts
 * since they're usually more actionable. Max 4 entries displayed total
 * (outages + route alerts combined), each truncated to fit ~80 chars.
 */
export function renderAlertSummary(
  arrivals: StationArrivals,
  alerts: Map<string, RouteAlert[]>,
  outages: EquipmentOutage[] = []
): string {
  const lines: string[] = []
  lines.push('! SERVICE ALERTS')
  lines.push('━'.repeat(DIVIDER_WIDTH))

  const routeIds = routeIdsFromArrivals(arrivals)
  const routeAlerts = alertsForRoutes(alerts, routeIds)

  interface SummaryEntry {
    badge: string
    text: string
  }

  const outageEntries: SummaryEntry[] = outages.map(o => ({
    badge: o.equipmentType === 'ES' ? '[ESC]' : '[ELEV]',
    text: o.description,
  }))
  const alertEntries: SummaryEntry[] = routeAlerts.map(a => ({
    badge: `[${a.routeId}]`,
    text: a.headerText,
  }))

  // Outages sorted above route alerts — they're usually more actionable.
  const combined = [...outageEntries, ...alertEntries].slice(0, 4)

  if (combined.length === 0) {
    lines.push('  No active alerts.')
  } else {
    for (const entry of combined) {
      const maxFirst = CHARS_PER_LINE - entry.badge.length - 1
      const text = entry.text
      if (text.length <= maxFirst) {
        lines.push(`${entry.badge} ${text}`)
      } else {
        lines.push(`${entry.badge} ${text.slice(0, maxFirst)}`)
        const rest = text.slice(maxFirst)
        const cont = rest.length > CHARS_PER_LINE - 4
          ? rest.slice(0, CHARS_PER_LINE - 5) + '.'
          : rest
        lines.push(`    ${cont}`)
      }
    }
  }

  lines.push('━'.repeat(DIVIDER_WIDTH))
  lines.push('tap:trains  dbl:exit')

  return lines.join('\n')
}
```

Add the `EquipmentOutage` import at the top of `src/glasses/display.ts` (alongside the existing type imports on line 18):

```typescript
import type { Station, StationArrivals, TrainArrival, EquipmentOutage } from '../lib/types'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/glasses/display.test.ts -t "renderAlertSummary with outages"`
Expected: PASS, all 6 new tests.

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: PASS — the third `outages` parameter defaults to `[]`, so any pre-existing two-argument call to `renderAlertSummary` (there are none in the current test file, but `main.ts` calls it with 2 args today) continues to behave identically until Task 7 updates those call sites.

- [ ] **Step 6: Commit**

```bash
git add src/glasses/display.ts src/glasses/display.test.ts
git commit -m "feat: renderAlertSummary merges outage entries above route alerts"
```

---

### Task 6: `src/glasses/stations.ts` — outage cache wiring

**Files:**
- Modify: `src/glasses/stations.ts:1-34, 104-119`

**Interfaces:**
- Consumes: `fetchOutages` from `src/data/outages.ts` (Task 3); `EquipmentOutage` from `src/lib/types.ts` (Task 2).
- Produces: `refreshOutages(): Promise<Map<string, EquipmentOutage[]>>` and `getCachedOutages(): Map<string, EquipmentOutage[]>`, consumed by `src/main.ts` (Task 7). Mirrors the existing `refreshAlerts()` / `getCachedAlerts()` pair exactly.

This module has no dedicated test file today (confirmed — `stations.ts`'s only coverage is indirect, through `main.ts`/`display.ts` tests), so this task adds the wiring directly and relies on Task 7's `main.test.ts`-equivalent verification... but note `main.ts` also has no dedicated test file per the design spec context (Sub-project A introduces the first one). Since this plan is scoped to Sub-project B only, verify this task via the full suite plus a manual call-site check in Task 7, not a new `stations.test.ts` — adding one is out of scope for this plan (it would duplicate what Sub-project A's `main.test.ts` is already chartered to cover for the station-manager's interaction with `main.ts`).

- [ ] **Step 1: Add the outages cache field, import, and functions**

In `src/glasses/stations.ts`, update the import block (lines 7-13):

```typescript
import { allStations, stationById } from '../data/stations'
import { getStationArrivals } from '../data/mta-feeds'
import { fetchAlerts } from '../data/alerts'
import { fetchOutages } from '../data/outages'
import { getFavorites, getSettings } from '../lib/storage'
import { getCurrentPosition, nearbyStations } from '../lib/geo'
import type { Station, StationArrivals, AppSettings, EquipmentOutage } from '../lib/types'
import type { RouteAlert } from '../data/alerts'
```

Update the `StationManagerState` interface (lines 15-26) to add an `outages` field:

```typescript
export interface StationManagerState {
  /** Ordered list of active stations (favorites + nearby) */
  stations: Station[]
  /** Which stations are favorites (vs GPS-nearby) */
  favoriteIds: Set<string>
  /** Current station index */
  currentIndex: number
  /** Cached arrivals per station ID */
  arrivals: Map<string, StationArrivals>
  /** Cached service alerts per route ID */
  alerts: Map<string, RouteAlert[]>
  /** Cached equipment outages per station complex ID */
  outages: Map<string, EquipmentOutage[]>
}
```

Update the initial `state` value (lines 28-34) to include `outages: new Map()`:

```typescript
let state: StationManagerState = {
  stations: [],
  favoriteIds: new Set(),
  currentIndex: 0,
  arrivals: new Map(),
  alerts: new Map(),
  outages: new Map(),
}
```

Add `refreshOutages` and `getCachedOutages` immediately after `getCachedAlerts` (after line 119):

```typescript

/**
 * Fetch and cache equipment outages for all stations.
 * Called alongside refreshAlerts() on the same cadence.
 */
export async function refreshOutages(): Promise<Map<string, EquipmentOutage[]>> {
  const outages = await fetchOutages()
  state.outages = outages
  return outages
}

/**
 * Get the current cached outages map.
 */
export function getCachedOutages(): Map<string, EquipmentOutage[]> {
  return state.outages
}
```

- [ ] **Step 2: Verify the project still type-checks and the full suite passes**

Run: `npm run build && npm test`
Expected: clean build, all existing + new tests still green (this task adds new exports without touching any existing call site's behavior — `main.ts` isn't updated to call them until Task 7).

- [ ] **Step 3: Commit**

```bash
git add src/glasses/stations.ts
git commit -m "feat: add refreshOutages/getCachedOutages to station manager"
```

---

### Task 7: Wire outages into `main.ts`'s render call sites

**Files:**
- Modify: `src/main.ts:24-44, 196-240, 242-278, 315-347, 363-390`

**Interfaces:**
- Consumes: `refreshOutages`, `getCachedOutages` from `src/glasses/stations.ts` (Task 6); `stationHasOutage`, `outagesForStation` from `src/data/outages.ts` (Task 3); updated `renderHeader`/`renderAlertSummary` signatures from Tasks 4–5.
- Produces: fully wired feature — no further tasks consume this one's output directly (it's the integration point).

This task touches the 4 existing `refreshAlerts()` call sites (lines 227, 254, 335, 401) and the 3 `renderHeader()` call sites (lines 199, 267, 325) plus 2 `renderAlertSummary()` call sites (lines 271, 382), pairing each with the outages equivalent. There's no new unit test for `main.ts` in this task (no `main.test.ts` exists yet — Sub-project A's plan, not this one, introduces it) — verification here is the full suite staying green plus a manual structural check that every call site was updated (Step 3).

- [ ] **Step 1: Update imports**

In `src/main.ts`, update the `stations` import block (lines 24-37):

```typescript
import {
  loadStations,
  currentStation,
  nextStation,
  prevStation,
  refreshCurrentArrivals,
  refreshAlerts,
  getCachedAlerts,
  refreshOutages,
  getCachedOutages,
  getCachedArrivals,
  prefetchAllStations,
  applyRouteFilter,
  isFavorite,
  getState,
} from './glasses/stations'
```

Update the `display` import block (lines 38-44) — no new imports needed there since `renderHeader`/`renderAlertSummary` are already imported; add the `outages.ts` helpers:

```typescript
import { stationHasOutage, outagesForStation } from './data/outages'
```

- [ ] **Step 2: Update `displayCurrentStation()` (lines 180-240)**

Replace the body from the `headerText`/`cached`/`alerts` declarations (lines 199-201) onward through the final fetch block:

```typescript
  const cached = getCachedArrivals(station.id)
  const alerts = getCachedAlerts()
  const outages = getCachedOutages()
  const headerText = renderHeader(station, isFavorite(station.id), stationHasOutage(outages, station.id))

  // Show cached data immediately (no Loading... flicker) when available,
  // then refresh in the background and update once fresh data arrives.
  if (cached) {
    const filtered = applyRouteFilter(cached, station.id)
    const initialBody = renderBody(station, filtered, currentIndex, stations.length, alerts)
    lastBodyText = initialBody
    if (useRebuild) {
      await rebuildPage(headerText, initialBody)
    } else {
      await updateHeader(headerText)
      await updateBody(initialBody)
    }
  } else {
    if (useRebuild) {
      await rebuildPage(headerText, renderLoading())
    } else {
      await updateHeader(headerText)
      await updateBody(renderLoading())
    }
  }

  // Fetch fresh data; abort if navigation moved on while we were fetching.
  const [arrivals] = await Promise.all([
    refreshCurrentArrivals(),
    refreshAlerts(),
    refreshOutages(),
  ])

  if (displaySeq !== seq) return

  const freshAlerts = getCachedAlerts()
  const filtered = applyRouteFilter(
    arrivals ?? { stationId: station.id, north: [], south: [], fetchedAt: Math.floor(Date.now() / 1000) },
    station.id
  )
  const bodyText = renderBody(station, filtered, currentIndex, stations.length, freshAlerts)
  lastBodyText = bodyText
  await updateBody(bodyText)
```

(The `Promise.all` array gains `refreshOutages()` as a third entry — its destructured result is unused here since the header was already painted above with the cached outages snapshot; the next call to `getCachedOutages()` elsewhere will see the fresh result. This matches the existing pattern where `refreshAlerts()`'s resolved value is similarly unused at this call site, with `getCachedAlerts()` read fresh afterward instead.)

- [ ] **Step 3: Update `refreshInPlace()` (lines 242-278)**

Replace the body from the `Promise.all` through the `updateBody` calls:

```typescript
  try {
    const [arrivals] = await Promise.all([
      refreshCurrentArrivals(),
      refreshAlerts(),
      refreshOutages(),
    ])

    // Navigation occurred mid-refresh — discard stale result.
    if (displaySeq !== seq) return

    const { stations, currentIndex } = getState()
    const alerts = getCachedAlerts()
    const outages = getCachedOutages()
    const filtered = applyRouteFilter(
      arrivals ?? { stationId: station.id, north: [], south: [], fetchedAt: Math.floor(Date.now() / 1000) },
      station.id
    )
    const bodyText = renderBody(station, filtered, currentIndex, stations.length, alerts)
    await updateHeader(renderHeader(station, isFavorite(station.id), stationHasOutage(outages, station.id)))
    lastBodyText = bodyText

    if (isAlertView && arrivals) {
      await updateBody(renderAlertSummary(arrivals, alerts, outagesForStation(outages, station.id)))
    } else {
      await updateBody(bodyText)
    }
  } finally {
    isRefreshing = false
  }
```

- [ ] **Step 4: Update `startGlassesMode()`'s initial paint and prefetch (lines 315-347)**

Update the `createInitialPage` call (lines 322-330):

```typescript
  const station = currentStation()
  if (station) {
    await createInitialPage(
      renderHeader(station, isFavorite(station.id), stationHasOutage(getCachedOutages(), station.id)),
      renderLoading()
    )
  } else {
    await createInitialPage('SubwayLens', renderNoStations())
  }
```

(`getCachedOutages()` returns an empty Map at this point since nothing has fetched yet — `stationHasOutage` on an empty Map correctly returns `false`, matching the existing pre-feature behavior for this first paint.)

Update the prefetch `Promise.all` and subsequent body render (lines 332-347):

```typescript
  if (station) {
    // Warm the cache for all favorites in parallel, then paint from cache.
    const seq = ++displaySeq
    await Promise.all([prefetchAllStations(), refreshAlerts(), refreshOutages()])
    if (displaySeq === seq) {
      const { stations, currentIndex } = getState()
      const alerts = getCachedAlerts()
      const cached = getCachedArrivals(station.id)
      if (cached) {
        const filtered = applyRouteFilter(cached, station.id)
        const bodyText = renderBody(station, filtered, currentIndex, stations.length, alerts)
        lastBodyText = bodyText
        await updateBody(bodyText)
        await updateHeader(renderHeader(station, isFavorite(station.id), stationHasOutage(getCachedOutages(), station.id)))
      }
    }
  }
```

(Added a trailing `updateHeader` call here since the initial header painted before the prefetch can now be stale — the prefetch may have just discovered an outage that the pre-fetch empty-Map paint didn't know about. This is a new line, not present in the original; needed because this is the one call site where the header was set before any outage data existed at all.)

- [ ] **Step 5: Update the `onTap` handler (lines 363-390)**

Replace the body of the `onTap` handler:

```typescript
    onTap: async () => {
      const station = currentStation()
      const cachedArrivals = station
        ? getCachedArrivals(station.id)
        : null
      const alerts = getCachedAlerts()
      const outages = getCachedOutages()

      // Check if any routes at this station have active alerts, or the
      // station itself has an active equipment outage.
      const routeIds = cachedArrivals
        ? [
            ...cachedArrivals.north.map(t => t.route),
            ...cachedArrivals.south.map(t => t.route),
          ]
        : []
      const hasRouteAlerts = routeIds.some(id => alerts.has(id) && (alerts.get(id)?.length ?? 0) > 0)
      const hasOutage = station ? stationHasOutage(outages, station.id) : false
      const hasAlerts = hasRouteAlerts || hasOutage

      if (hasAlerts && cachedArrivals && station) {
        isAlertView = !isAlertView
        if (isAlertView) {
          await updateBody(renderAlertSummary(cachedArrivals, alerts, outagesForStation(outages, station.id)))
        } else {
          await updateBody(lastBodyText)
        }
      } else {
        isAlertView = false
        await refreshInPlace()
      }
    },
```

- [ ] **Step 6: Update the `subwaylens:stations-updated` listener (lines 422-435)**

Add outage data to the header refresh inside this listener. Replace the listener body:

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
      updateHeader(renderHeader(station, isFavorite(station.id), stationHasOutage(getCachedOutages(), station.id)))
    })
  })
```

- [ ] **Step 7: Run the full suite and build**

Run: `npm run build && npm test`
Expected: clean build, all 53 tests passing (38 original + 9 from `outages.test.ts` + 5 from `renderHeader` cases + 6 from `renderAlertSummary` cases — `stations.ts`'s Task 6 additions had no dedicated tests, consistent with `main.ts`/`stations.ts` having no test file in this codebase today).

- [ ] **Step 8: Manually verify every call site was updated**

Run: `grep -n "renderHeader\|renderAlertSummary\|refreshAlerts\|refreshOutages" src/main.ts`
Expected: every `renderHeader(...)` call has 3 arguments, every `renderAlertSummary(...)` call has 3 arguments, and every `refreshAlerts()` call has a matching `refreshOutages()` call in the same `Promise.all`. If any call site shows only 2 arguments or a missing paired `refreshOutages()`, go back and fix that specific site before proceeding.

- [ ] **Step 9: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire equipment outages into header and alert summary render calls"
```

---

### Task 8: Add the outage-feed host to `app.json`'s network whitelist

**Files:**
- Modify: `app.json:13-17`

**Interfaces:**
- Consumes: the confirmed host from Task 1's spike result.
- Produces: nothing consumed by later tasks — this is required for the feature to actually work on-device (the EvenHub runtime blocks `fetch()` calls to non-whitelisted hosts), but doesn't affect local `npm test`/`npm run build` since those don't enforce the whitelist.

- [ ] **Step 1: Update the network permission whitelist**

In `app.json`, update the `permissions` array's `network` entry (lines 13-17):

```json
    {
      "name": "network",
      "desc": "Access MTA real-time subway data feeds to display live train arrival times",
      "whitelist": [
        "https://api-endpoint.mta.info",
        "https://advisory.mtanyct.info",
        "https://react.dev/errors/"
      ]
    },
```

If Task 1's spike confirmed a different host than `advisory.mtanyct.info` (e.g. a redirect target, or the HTML-scrape fallback lives on a different subdomain), use that confirmed host here instead — do not whitelist a host that wasn't actually verified to respond in Task 1.

- [ ] **Step 2: Validate the JSON is well-formed**

Run: `node -e "JSON.parse(require('fs').readFileSync('app.json', 'utf8')); console.log('valid')"`
Expected: prints `valid` with no parse errors.

- [ ] **Step 3: Run the full suite one more time**

Run: `npm run build && npm test`
Expected: clean build, all 53 tests passing (this change doesn't affect TypeScript compilation or test behavior — it's a manifest-only change).

- [ ] **Step 4: Commit**

```bash
git add app.json
git commit -m "feat: whitelist advisory.mtanyct.info for equipment outage feed"
```

---

### Task 9: Final verification pass

**Files:**
- None modified — verification only.

**Interfaces:**
- Consumes: the complete feature from Tasks 1–8.
- Produces: confirmation the plan's Global Constraints are satisfied.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: `Test Files 5 passed (5)`, `Tests 53 passed (53)` — the existing 4 files (`display.test.ts`, `geo.test.ts`, `time.test.ts`, `search.test.ts`) plus the new `outages.test.ts`, totaling 38 original + 9 (`outages.test.ts`) + 5 (`renderHeader` cases) + 6 (`renderAlertSummary` cases) = 53.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: clean TypeScript compile + Vite build, no errors, `dist/` populated.

- [ ] **Step 3: Confirm no out-of-scope regressions in `renderBody`**

Run: `grep -n "function renderBody" -A 3 src/glasses/display.ts`
Expected: `renderBody`'s signature is unchanged from before this plan started (still takes `station, arrivals, stationIndex, totalStations, alerts` — 5 params, no `outages` param) — confirming Sub-project B never touched the N/S subway layout per the Global Constraints.

- [ ] **Step 4: Confirm git history reflects local-only commits**

Run: `git log --oneline -10` and `git status`
Expected: the 8 commits from Tasks 2–8 (Task 1 may have produced 0 or 1 commits depending on whether a scratch spike note was kept) are present locally; working tree is clean; nothing has been pushed (do not run `git push` — this step only inspects state, per the plan's Global Constraints).

No commit for this task — it's verification-only, matching the design spec's "Cross-cutting verification" section, which calls for a build+test check, not a code change.
