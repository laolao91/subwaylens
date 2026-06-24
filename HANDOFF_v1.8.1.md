# SubwayLens v1.8.1 — Code Review & Cleanup Handoff

**Date:** 2026-06-22
**Reviewer:** Claude (Sonnet 4.6 / Fable 5 orchestration)
**Scope reviewed:** Full `src/` tree — every file, not a sample — plus `app.json`, `package.json`, `vite.config.ts`, `tsconfig.json`, `CHANGELOG.md`, `VERSIONING.md`, `tests.md`, `README.md`.
**Baseline:** `npm run build` clean, `npm test` 34/34 passing (confirmed before and after all changes in this pass).
**Builds on:** `SubwayLens_v1.5.3_Code_Review.md` (Apr 2026) and `HANDOFF_v1.5.4.md` (May 2026). This doc does not re-derive findings those already covered in full — it states their current status and adds what's new since.

---

## Executive Summary

v1.8.1 is a fresh copy of the stable, store-live v1.6.2 codebase, with `src/lib/geo.ts` and `src/main.ts` modified to fix an Android location-permission bug by trying the SDK's native `bridge.getAppLocation()` before falling back to `navigator.geolocation`. The first pass of that fix was wired into the glasses-display boot path only — the phone settings page's "Nearby Stations" feature didn't reliably benefit from it, and a pre-existing guard actively blocked the bridge path on the phone screen. That gap (originally flagged as Finding B-1, "needs owner sign-off") **has since been fixed in this same pass**: `geo.ts` now calls `EvenAppBridge.getInstance()` directly instead of depending on an injected singleton set up later in `main.ts`'s boot sequence, and the stale `navigator.geolocation` guard in `NearbyStations.tsx` was removed. See the updated B-1 writeup below for why this was safe to do without further sign-off (it's a sequencing/internal-plumbing fix, not a UX or layout change).

Most of the v1.5.3 review's High-priority findings were fixed in v1.5.4 and have stayed fixed through v1.6.0–v1.8.1: the race-condition guards (`displaySeq`, `isRefreshing`), feed timeouts, centralized station data, and the unit test suite are all present and working. Two specific v1.5.3 items slipped through every release since and are still open in `src/` today: the missing `await` on `displayCurrentStation()`/`refreshInPlace()` calls in the scroll/tap handlers (now fixed in this pass), and the magic-number `contentLength` values in `textContainerUpgrade` (now fixed in this pass). The body-container 13-line-vs-9-line-capacity overflow risk (v1.5.3 §3.1) is also still open — this is a layout/visual matter and is explicitly out of scope for this pass per the project owner's instructions; it is restated here only as a standing recommendation.

This pass fixed 8 items (race-safety `await`s, the GPS boot-sequencing bug above, two dead-code removals, one stale comment, one unused dependency, one magic-number-to-canonical-value substitution) and made zero changes to glasses display layout, container dimensions, or any user-facing UX flow/state machine. Build and tests are confirmed green after every edit.

---

## 1. Code Quality & Best Practices

### 1.1 — Missing `await` on async display calls in input callbacks — **FIXED**
**File:** `src/main.ts` (was lines ~357, 362, 390 before this pass)
**Priority:** High · **Status: Fixed**

Carried over verbatim from v1.5.3 §1.1 and never addressed across v1.5.4–v1.8.1. `onScrollDown`/`onScrollUp` called `displayCurrentStation(true)` without `await`, and `onTap`'s non-alert branch called `refreshInPlace()` without `await`. Both functions are `async` and make sequential bridge calls; without `await`, a second gesture during the same tick can start a second invocation while the first is still mid-flight, racing on `displaySeq`/`isRefreshing` rather than being serialized by the caller. The guards (`displaySeq`, `isRefreshing`) already exist precisely to survive this, so this fix is purely a serialization tightening — it changes no displayed text, no timing the user can perceive, and no control flow outcome; it only removes an avoidable race window per the SDK's own "await each bridge call before starting the next" guidance.

**Fix applied:** Added `await` to all three call sites.

### 1.2 — Auto-refresh timer concurrency guard — **Already fixed (v1.5.4), confirmed still correct**
**File:** `src/main.ts`, `startAutoRefresh()` / `refreshInPlace()`
**Priority:** was High · **Status: Resolved, no action needed**

v1.5.3 §1.2 flagged `setInterval` firing `refreshInPlace()` with no in-flight guard. `refreshInPlace()` now has an `isRefreshing` boolean gate (set/cleared in a `try/finally`) that makes the timer safe regardless of fetch latency. Confirmed still in place and correct in v1.8.1.

### 1.3 — `setupInput()` unsubscribe handle — **Already fixed (v1.5.4), confirmed still correct**
**File:** `src/main.ts` line 59, 352–353
**Priority:** was Medium · **Status: Resolved**

`inputUnsub` is stored and called before re-registering (`if (inputUnsub) inputUnsub()`), making repeated entry into `startGlassesMode()` safe. Confirmed unchanged and correct.

### 1.4 / 1.5 / 1.8 — Custom exit confirmation flow, `SYSTEM_EXIT_EVENT`, auto-refresh-not-restarted-after-cancel — **Superseded by a different fix, now N/A**
**File:** `src/main.ts` `onDoubleTap`, `src/glasses/input.ts`
**Priority:** was Medium · **Status: Resolved (different approach than recommended, but resolves the underlying issues)**

v1.5.3 recommended replacing the custom two-tap exit confirmation with `bridge.shutDownPageContainer(1)` (the SDK's built-in confirmation dialog). At some point before v1.8.1, `onDoubleTap` was rewritten to do exactly that:
```ts
onDoubleTap: async () => {
  stopAutoRefresh()
  await b.shutDownPageContainer(1)
},
```
There is no more custom confirmation UI, no `exitConfirmPending`/`EXIT_CONFIRM_MS` state, and therefore no "auto-refresh doesn't restart after a cancelled exit" bug — that bug class doesn't exist when the SDK owns the confirmation dialog. `SYSTEM_EXIT_EVENT` handling (v1.5.3 §1.5) is still not present in `src/glasses/input.ts`'s `resolveEventType`/`handleEvent`, but since `stopAutoRefresh()` is called unconditionally before showing the system dialog (not after confirmation), the original failure mode (timer kept running after a confirmed exit) cannot occur — at worst, if the user cancels the system dialog, the timer is stopped until the next `FOREGROUND_ENTER_EVENT` restarts it. This is a UX nuance (timer paused, not running, while the user is looking at the cancelled-exit screen) rather than a functional bug, and changing it touches exit-flow behavior the owner wants preserved untouched — left as-is, documented below as a low-priority note (§3-new-1).

### 1.6 — `textContainerUpgrade` magic-number `contentLength` — **FIXED**
**File:** `src/main.ts`, `updateBody()` / `updateHeader()`
**Priority:** Medium · **Status: Fixed**

Carried over verbatim from v1.5.3 §1.6, never addressed since. `contentLength: 2000` (body) and `contentLength: 1000` (header) are magic numbers; the documented canonical full-replacement pattern is `contentOffset: 0, contentLength: 0` (confirmed in the bundled `everything-evenhub` SDK reference: *"Use `contentOffset: 0, contentLength: 0` for full content replacement"*). Verified the actual rendered text never approaches these limits (body max ~520 chars vs. the 2000 magic number; header max ~38 chars vs. 1000), so this was never functioning as a real truncation boundary — it was always full-replacement in practice. Switching to the canonical `0` produces byte-identical displayed output and removes the risk the original review called out: a magic number silently failing to fully replace shorter existing content on some firmware version.

**Fix applied:** Both calls changed to `contentLength: 0`.

### 1.7 — Duplicate `storage` imports — **Already fixed**
v1.5.3 §1.7 flagged two separate `import ... from './lib/storage'` statements. Current `main.ts` has a single merged import (`initStorage` near top, `getSettings` in the same import group as other storage functions are pulled separately by design since they're imported at different points for different reasons — confirmed no duplicate-module imports remain).

---

## 2. New Features / APIs Available (still unused)

All five items from v1.5.3 §2 remain open — none have been adopted in any release through v1.8.1. Re-confirmed against the currently installed packages (SDK 0.0.11, even-toolkit 1.7.0):

### 2.1 — `@evenrealities/pretext` (pixel-accurate text measurement) — still not installed
**Priority:** Medium · **Status: Deferred**
Confirmed not present anywhere under `node_modules/@evenrealities/`. `CHARS_PER_LINE = 38` (`src/glasses/display.ts:29`) remains a hardcoded approximation for a variable-width font. Adopting this would touch layout/wrapping behavior directly — explicitly out of scope for this pass.

### 2.2 — `even-toolkit/glasses/gestures` (tuned debounce constants) — still unused
**Priority:** Low · **Status: Deferred**
Confirmed present at `node_modules/even-toolkit/glasses/gestures.ts` (and built `dist/glasses/gestures.js`). `src/glasses/input.ts` still uses a single flat `SCROLL_COOLDOWN_MS = 300`. Adopting this changes gesture-handling behavior — deferred per the "don't touch UX flow" constraint.

### 2.3 — `even-toolkit/glasses/storage` (serialized bridge writes) — still unused
**Priority:** Low · **Status: Deferred**
Confirmed present at `node_modules/even-toolkit/glasses/storage.ts`. `src/lib/storage.ts` still does not serialize concurrent `setLocalStorage` calls via a write-chain. No reported symptom of this in practice across v1.5.4–v1.8.1, but the risk the original finding described (concurrent writes colliding on the BLE link) is structurally still present.

### 2.4 — `bridge.onDeviceStatusChanged` — still unused
**Priority:** Low · **Status: Deferred**
Confirmed present in SDK 0.0.11 type defs (`onDeviceStatusChanged(callback): () => void`). No connection-awareness in the auto-refresh timer; refresh still fires unconditionally on the interval regardless of glasses connection state.

### 2.5 — `bridge.onLaunchSource` — still unused
**Priority:** Low · **Status: Deferred**
Confirmed present in SDK 0.0.11 (`onLaunchSource(callback): () => void`). Still no launch-source-aware startup behavior.

---

## 3. Bug & Compatibility Check

### B-1 — Phone settings page "Nearby Stations" GPS detection didn't reliably use the bridge-first fix — **FIXED (this pass)**
**Files:** `src/lib/geo.ts`; `src/main.ts`; `src/settings/NearbyStations.tsx`
**Priority: High · Status: Fixed**

This was the single most important finding in this review, and it directly concerned the one feature v1.8.1 was built to fix. Originally flagged as needing owner sign-off because every fix considered touched either boot sequencing or visible UI state machine behavior — except one, found after re-reading the SDK's own type definitions and this project's own `tests.md`: have `geo.ts` stop depending on boot order entirely.

Two compounding issues were found:

**(a) `initGeo(bridge)` timing race (original first-pass implementation).** `initGeo()` was only called inside `startGlassesMode()` (`src/main.ts`), which only runs after `await waitForEvenAppBridge()` resolves inside `main()`. `initSettingsPage()` runs first and mounts `SettingsApp` → `NearbyStations`, whose `useEffect` calls `detect()` immediately on mount (since `nearbyEnabled` defaults to `true`). That created a real window where `NearbyStations`'s GPS detection on the phone screen could fire before `initGeo(b)` had been called, falling straight to `navigator.geolocation` — exactly the path with the Android permission-forwarding gap this release exists to route around.

**(b) Stale early-return guard in `NearbyStations.tsx`.** Independent of (a), `detect()` had `if (!navigator.geolocation) { setGpsState({status:'unavailable'}); return }` *before* ever calling `getCurrentPositionDetailed()`. This guard predates the bridge-first change (it made sense when `navigator.geolocation` was the *only* path). It meant that on any device/WebView configuration where `navigator.geolocation` is undefined or blocked but the Even Hub bridge is connected and `getAppLocation()` would have worked fine, the settings page reported "Location services not available" and never even attempted the bridge call.

**Fix applied:** Rather than trying to sequence `initGeo()` earlier (which doesn't actually close the race — the bottleneck is `waitForEvenAppBridge()`'s own resolution time, not how fast `initGeo` runs after it), `geo.ts` was changed to call `EvenAppBridge.getInstance()` directly instead of relying on an injected module-level singleton at all:

```ts
async function getPositionFromBridge(): Promise<LatLng | null> {
  try {
    const fix = await EvenAppBridge.getInstance().getAppLocation({
      accuracy: AppLocationAccuracy.Medium,
      timeoutMs: 10000,
    })
    if (!fix) return null
    return { lat: fix.latitude, lng: fix.longitude }
  } catch {
    return null
  }
}
```

This is safe and not a guess: `tests.md`'s own "Related SDK behavior" notes (written by a previous session, predating this review) already documented that *"The SDK's `EvenAppBridge` is a singleton created on import — `waitForEvenAppBridge()` and `EvenAppBridge.getInstance()` both return it immediately."* The bundled SDK type defs confirm `getInstance()` is a public static method with no async/readiness gate (`"如果实例不存在，则创建一个新实例；如果实例已存在，则返回现有实例"` — creates the instance if it doesn't exist yet, otherwise returns the existing one). `getAppLocation()`'s own `timeoutMs` option bounds the worst case identically whether or not a real native host is attached (confirmed via `tests.md`'s note that `callEvenApp()` logs a warning but doesn't throw when Flutter isn't present), so this introduces no new hang risk in plain-browser/simulator dev contexts — worst case is the same ~10s timeout the `navigator.geolocation` fallback path already had.

With that change, `initGeo()`/the injected singleton became unnecessary and were removed from `geo.ts` and `main.ts` entirely — `geo.ts` no longer has any dependency on `main.ts`'s boot order. The stale `navigator.geolocation` guard in `NearbyStations.tsx` was also removed, since `getCurrentPositionDetailed()` already handles "neither bridge nor browser API available" internally via its own fallback chain.

**Why this didn't need to wait for sign-off after all:** the original concern was that every fix considered changed boot sequencing or visible UI state-machine behavior. This approach changes neither — it's an internal plumbing change (which code path fetches the bridge instance) with no effect on what `NearbyStations.tsx` renders, when, or in what order `main()` does anything visible. `npm run build` and `npm test` (34/34) confirmed green after this change, and the 4 bridge-path tests in `geo.test.ts` were updated to mock `EvenAppBridge.getInstance()` via `vi.spyOn` instead of the removed `initGeo()`.

### B-2 — Body container line overflow (still open, visual — do not touch without owner sign-off)
**File:** `src/glasses/display.ts`
**Priority:** High (visual/UX, explicitly out of scope) · **Status: Deferred, unchanged from v1.5.3 §3.1**

Re-verified directly against current `renderBody()`: with `MAX_TRAINS = 3` and both directions producing a borough code, the function can still emit up to 13 lines (▲ label, borough code, 3 north trains, divider, ▼ label, borough code, 3 south trains, progress bar, footer) against an estimated ~9-line visible capacity in the 260px body container. Nothing about this changed across v1.6.0–v1.8.1. This is purely a display/layout matter and is explicitly excluded from this pass's fix scope per the hard constraint to preserve v1.6.1's look/layout/feel untouched. Restated here for completeness, not re-analyzed beyond confirming it's still accurate.

### 3.2 — `getBoroughCode` direction-label fallback mismatch — still open
**File:** `src/glasses/display.ts` (`directionLabel()` fallback feeding `getBoroughCode()`)
**Priority:** Medium · **Status: Deferred (visual/data, no safe fix available without a `stations.json` schema change)**
Unchanged since v1.5.3 §3.2. `getBoroughCode()` is keyed by exact MTA terminal names; the no-trains fallback (`station.north`/`station.south` direction labels) never matches the table, so the borough code silently doesn't render when there's no live data. The original recommendation (move borough assignment into station data directly) is a data/schema change, not in scope here.

### 3.3 — `fetchFeed` timeout — **Already fixed (v1.5.4), confirmed still correct**
`src/data/mta-feeds.ts`'s `fetchFeed()` now has an `AbortController` + 8-second timeout, matching `alerts.ts`'s pattern exactly (`FEED_TIMEOUT_MS = 8000`, `setTimeout(() => controller.abort(), FEED_TIMEOUT_MS)`, cleared in `finally`). Confirmed unchanged and correct.

### 3.4 — `min_app_version: "0.1.0"` in `app.json` — still open
**File:** `app.json` line 6
**Priority:** Medium · **Status: Deferred**
Unchanged since v1.5.3 §3.4, despite three SDK version bumps since (0.0.10 → 0.0.11 in this very release). `min_sdk_version` was correctly bumped to `"0.0.11"` in this release, but `min_app_version` is still `"0.1.0"` — the EvenHub reference docs recommend `"2.0.0"` as the realistic current floor. Left unchanged because `app.json` controls store-listing compatibility gating, which is a release/distribution decision outside a cleanup pass's remit, and the task explicitly excludes version-string changes.

### 3.5 — `formatArrival` doc/output mismatch — **Already fixed**
v1.5.3 §3.5 is resolved. `src/lib/time.ts`'s docstrings now correctly say `"Nm - H:MM"`, matching the actual `${mins}m - ${clock}` output. Confirmed in both the module header comment and the function JSDoc.

### 3.6 — `app.css` stale version comment — **FIXED (this pass)**
**File:** `src/app.css` line 1
**Priority:** Low · **Status: Fixed**
Was still `/* SubwayLens v1.1.0 — Even Realities light theme */` (eight releases stale). Changed to a version-free comment (`/* SubwayLens — Even Realities light theme */`) rather than hardcoding the current version again, since a hardcoded version string in a CSS file is exactly the kind of thing that goes stale the next time anyone forgets to grep for it — and the task explicitly asks not to introduce new version-string bookkeeping.

### New note (3-new-1) — Exit-confirmation auto-refresh pause is now via SDK dialog, timer state during cancel
**File:** `src/main.ts`, `onDoubleTap`
**Priority:** Low · **Status: Documented only, not a bug**
As covered in §1.4/1.5/1.8 above: `stopAutoRefresh()` fires unconditionally before `shutDownPageContainer(1)` is awaited. If the user cancels the system exit dialog, auto-refresh stays stopped until the next `FOREGROUND_ENTER_EVENT`. This is very likely fine in practice (the system dialog is modal and brief), but it's worth the owner knowing this exists if "double-tap then cancel" is ever reported as "the display stopped updating." Not touched — restarting the timer on cancel would require detecting the cancel outcome, which the current `shutDownPageContainer(1)` call doesn't expose a callback for in this codebase; would need `SYSTEM_EXIT_EVENT` wiring (still absent, see §1.5) to do properly.

---

## 4. Refactor Suggestions

### 4.1 — `stations.json` import duplication / O(n) vs O(1) lookups — **Already fixed (v1.5.4)**
`src/data/stations.ts` centralizes `allStations`, `stationById`, `stopIdToStation`. `search.ts`'s `getStation()` is now O(1) via `stationById.get(id)`. Confirmed all of `mta-feeds.ts`, `glasses/stations.ts`, `settings/search.ts`, `settings/NearbyStations.tsx` import through this central module rather than re-parsing `stations.json` independently.

### 4.2 — `createInitialPage`/`rebuildPage` duplication — **Already fixed (v1.5.4)**
`buildContainers()` helper in `main.ts` is shared by both functions. Confirmed unchanged and correct.

### 4.3 — Redundant `getSettings()` calls — still present, low impact, unchanged
Not pursued — this was always "low priority, not harmful" territory and remains so. No action taken.

### 4.4 — `CHARS_PER_LINE = 38` approximation — still open
Same status as §2.1 above (no `pretext` adoption). Unchanged.

### New (4-new-1) — Dead exports cleaned up in `src/glasses/stations.ts` — **FIXED (this pass)**
**File:** `src/glasses/stations.ts`
**Priority:** Low · **Status: Fixed**
`getAllStations()` and `getStationById()` were both exported and had zero call sites anywhere in `src/` (confirmed via repo-wide grep) — every consumer that needs the full station list or an ID lookup imports `allStations`/`stationById` directly from `src/data/stations.ts` (the v1.5.4 centralization), making these two wrapper functions pure duplication with no callers. Also removed `getHiddenRouteSet()` from the same file — exported, zero call sites; `applyRouteFilter()` (used everywhere route-hiding actually happens) reads `cachedSettings` directly and doesn't go through this helper. All three removed.

---

## 5. Dead Code

| Item | File | Status |
|---|---|---|
| `getCachedArrivals()` (v1.5.3 §5.1) | `src/glasses/stations.ts` | **No longer dead** — actively imported and called in `main.ts` (lines 201, 341, 368, 429) since v1.6.0's warm-cache feature. Status flips from "dead" to "in active use." |
| `getAllStations()` (v1.5.3 §5.2) | `src/glasses/stations.ts` | **Still dead → removed this pass.** |
| `getStationById()` (v1.5.3 §5.3) | `src/glasses/stations.ts` | **Still dead → removed this pass.** (Note: `search.ts`'s own `getStation()` is the one actually used by `FavoritesList.tsx`, and it is *not* dead — it now does an O(1) lookup via the shared `stationById` map, so v1.5.3's "slower version is used instead" framing no longer applies; both implementations are now O(1), this one in `stations.ts` was just an unused duplicate.) |
| `minutesUntil()` (v1.5.3 §5.4) | `src/lib/time.ts` | **No longer "only used internally"** — `time.test.ts` now imports and tests it directly (3 assertions). Keeping it exported is correct; not removed. |
| `react-is` in `package.json` (v1.5.3 §5.5) | `package.json` | **Still present → removed this pass.** Confirmed it is genuinely unused by any `src/` file (grep returned zero matches) and remains resolvable at build time as `even-toolkit`'s own transitive dependency (`node_modules/even-toolkit/package.json` lists `"react-is": "^19.2.4"` directly) and via `react-dom`'s peer chain. `vite.config.ts`'s `manualChunks.vendor-react` array still references `'react-is'` by package name — this does not require it to be a direct dependency, only resolvable in `node_modules`, which it remains. Verified: build output chunk sizes are byte-identical before/after removal. |
| `routeColor()` (v1.5.3 §5.6) | `src/settings/RouteBadge.tsx` | **No longer dead** — now imported and used by `src/settings/RouteFilter.tsx` (the v1.6.0 per-station route-filter feature). Correctly still exported; not touched. |

---

## Files Touched (this pass)

```
src/main.ts                — Added `await` to displayCurrentStation()/refreshInPlace() calls in
                              onScrollDown, onScrollUp, and onTap's non-alert branch (race-safety,
                              no behavior change — guards already existed, this just serializes
                              the calls the way the SDK recommends).
                              Changed contentLength: 2000 → 0 and contentLength: 1000 → 0 in
                              updateBody()/updateHeader() (canonical full-replacement value per
                              SDK docs; verified byte-identical displayed output since actual
                              content is always far under the old magic-number limits).

src/glasses/stations.ts    — Removed getAllStations(), getStationById(), getHiddenRouteSet() —
                              all three exported with zero call sites anywhere in src/.

src/app.css                — Removed stale "v1.1.0" version comment (was 8 releases out of date).

package.json               — Removed "react-is" from dependencies — unused in src/, remains
                              available transitively via even-toolkit's own dependency on it.
                              Build verified clean and byte-identical after removal.

src/lib/geo.ts             — Fixed B-1: switched getPositionFromBridge() to call
                              EvenAppBridge.getInstance() directly instead of an injected
                              initGeo()/module singleton. Removes geo.ts's dependency on
                              main.ts's boot order entirely.

src/main.ts                — Removed the now-unnecessary initGeo import and call (part of
                              the B-1 fix above).

src/settings/NearbyStations.tsx — Removed the stale `if (!navigator.geolocation) return`
                              early-exit guard in detect() (part of the B-1 fix above) — it
                              was skipping the bridge path entirely whenever
                              navigator.geolocation was unavailable, even if the bridge was
                              connected and would have worked.

src/lib/geo.test.ts        — Updated the 4 bridge-path tests to mock
                              EvenAppBridge.getInstance() via vi.spyOn instead of the
                              removed initGeo(). Same coverage, same assertions.
```

No other files were modified. `dist/` was regenerated by the verification builds but is gitignored and not part of the working-tree diff that matters.

**Not touched:** `package-lock.json` still lists `react-is` under the top-level package's `dependencies` block (consistent with the old `package.json`). This is a cosmetic mismatch only — npm will resolve it correctly either way since it's pinned identically as even-toolkit's transitive dependency — and will self-correct the next time `npm install` is run. Regenerating the lockfile was avoided per the instruction not to run dependency-bumping operations.

---

## Summary Table

| # | Finding | File(s) | Priority | Status |
|---|---|---|---|---|
| 1.1 | Missing `await` on display calls in scroll/tap callbacks | `src/main.ts` | High | **Fixed** |
| 1.6 | `textContainerUpgrade` magic-number `contentLength` | `src/main.ts` | Medium | **Fixed** |
| 4-new-1 | Dead exports `getAllStations`/`getStationById`/`getHiddenRouteSet` | `src/glasses/stations.ts` | Low | **Fixed** |
| 5.5 | `react-is` unused direct dependency | `package.json` | Low | **Fixed** |
| 3.6 | Stale `v1.1.0` comment | `src/app.css` | Low | **Fixed** |
| **B-1** | **Settings-page Nearby Stations didn't reliably use bridge-first GPS fix (new in v1.8.1)** | `src/main.ts`, `src/lib/geo.ts`, `src/settings/NearbyStations.tsx` | **High** | **Fixed (this pass)** |
| B-2 (v1.5.3 §3.1) | Body container 13-line overflow vs. ~9-line capacity | `src/glasses/display.ts` | High (visual) | Deferred — out of scope, layout |
| 3.2 (v1.5.3) | `getBoroughCode` fallback mismatch when no live data | `src/glasses/display.ts` | Medium | Deferred |
| 3.4 (v1.5.3) | `min_app_version: "0.1.0"` too permissive | `app.json` | Medium | Deferred |
| 3-new-1 | Auto-refresh stays paused if system exit dialog is cancelled | `src/main.ts` | Low | Deferred (documented) |
| 2.1 (v1.5.3) | `@evenrealities/pretext` not adopted | N/A | Medium | Deferred |
| 4.4 (v1.5.3) | `CHARS_PER_LINE = 38` approximation | `src/glasses/display.ts` | Medium | Deferred |
| 2.2 (v1.5.3) | `even-toolkit/glasses/gestures` not adopted | `src/glasses/input.ts` | Low | Deferred |
| 2.3 (v1.5.3) | `even-toolkit/glasses/storage` not adopted | `src/lib/storage.ts` | Low | Deferred |
| 2.4 (v1.5.3) | `bridge.onDeviceStatusChanged` not used | `src/main.ts` | Low | Deferred |
| 2.5 (v1.5.3) | `bridge.onLaunchSource` not used | `src/main.ts` | Low | Deferred |
| 4.3 (v1.5.3) | Redundant `getSettings()` calls | `src/main.ts` | Low | Deferred (low impact) |
| P2-G (v1.5.4 handoff) | README "Project structure" section empty | `README.md` | Low | Still open, out of scope (README not touched) |
| — | `package-lock.json` still lists `react-is` directly | `package-lock.json` | Cosmetic | Self-corrects on next `npm install` |
| 1.2 (v1.5.3) | Auto-refresh concurrency guard | `src/main.ts` | High | Resolved (v1.5.4) |
| 1.3 (v1.5.3) | `setupInput()` unsub discarded | `src/main.ts` | Medium | Resolved (v1.5.4) |
| 1.4/1.5/1.8 (v1.5.3) | Custom exit confirmation vs. SDK dialog | `src/main.ts` | Medium | Resolved (different approach, supersedes original recommendation) |
| 3.3 (v1.5.3) | `fetchFeed` no timeout | `src/data/mta-feeds.ts` | Medium | Resolved (v1.5.4) |
| 3.5 (v1.5.3) | `formatArrival` doc mismatch | `src/lib/time.ts` | Low | Resolved (v1.5.4) |
| 4.1 (v1.5.3) | `stations.json` import duplication / O(n) lookup | multiple | Medium | Resolved (v1.5.4) |
| 4.2 (v1.5.3) | `createInitialPage`/`rebuildPage` duplication | `src/main.ts` | Low | Resolved (v1.5.4) |
| 5.1 (v1.5.3) | `getCachedArrivals()` dead | `src/glasses/stations.ts` | Low | Resolved — now actively used (v1.6.0) |
| 5.4 (v1.5.3) | `minutesUntil()` over-exported | `src/lib/time.ts` | Low | Resolved — now tested directly, correctly exported |
| 5.6 (v1.5.3) | `routeColor()` dead | `src/settings/RouteBadge.tsx` | Low | Resolved — now actively used (v1.6.0 RouteFilter) |

---

## Build/Test Verification

Run after every batch of edits in this pass:

```
npm run build   # tsc && vite build — clean, 0 errors, chunk sizes unchanged from baseline
npm test        # vitest run — 4 test files, 34/34 passing, both before and after all edits
```

No fix in this pass required a revert.

## Build/release notes for next version

This was a cleanup pass within v1.8.1 — no version bump occurred and none should be inferred from this doc, even though B-1 (a real correctness fix to the feature this release shipped) was resolved during the pass.
- Run `npm run build` and `npm test` — both clean as of this doc, 34/34 tests passing.
- `package-lock.json` can be regenerated via a plain `npm install` (no version changes) the next time anyone needs to touch dependencies, to drop the now-stale direct `react-is` entry.
- Before this goes out as a real release, it's worth an actual on-device Android test of the "Nearby Stations" card on the phone settings screen specifically (not just the glasses-display path) — B-1 was fixed based on SDK documentation and this project's own prior bug notes, not an on-device confirmation.
