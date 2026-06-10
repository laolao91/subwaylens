## v1.7.0 — 2026-06-09

Feature release: LIRR + Metro-North departure boards, multi-city support, equipment outage alerts, schedule fallback, glance mode, and a performance overhaul of feed fetching.

### New: Equipment Outage Alerts (NYC subway)

- A `!` marker appears in the header when the current station has an elevator or escalator out of service (keyless MTA outage feed, 5-min cache). Details appear as [ELEV]/[ESC] entries in the existing tap-to-view alert summary — zero arrival rows consumed.

### New: Schedule Fallback (NYC subway)

- When realtime feeds are down, the display shows scheduled-headway estimates per route ("[L] every ~4 min (sched)") with a "! sched est." footer instead of "No live data". Generated at build time from static GTFS (7KB table). Stateless per refresh cycle — live data resumes automatically on the next successful fetch.

### New: High Readability Glance Mode

- Settings toggle (default off): one giant next-train countdown per direction, built from 3-row block digits (the G2 SDK exposes no font-size control). Tap cycles glance → detail → alerts → glance.

### New: Commuter Rail (LIRR + Metro-North)

- **Departure boards** — LIRR and Metro-North stations show a single time-sorted departure list with branch badges ([RONK], [BABY]), delay notices, and **track numbers** extracted from the MTA Railroad GTFS-RT extension (dim "Trk --" until posted, ~10 min before departure).
- Penn Station, Grand Central, Jamaica, and 235+ other commuter rail stations are searchable and favoritable alongside subway stations in the NYC region.

### New: Multi-city

- **Transit region picker** in settings — one region active at a time. All feeds keyless:
  - SF Bay Area (BART)
  - Boston (MBTA subway, light rail + Commuter Rail)
  - Philadelphia (SEPTA Regional Rail)
  - Denver (RTD rail lines)
  - Atlanta (MARTA rail)
  - Minneapolis-St Paul (METRO)
- Station packs load per-region via code-split chunks — a Boston user never downloads the Denver data.
- **Adaptive refresh floor** — heavy feeds (MBTA/MSP/MARTA, ≥500KB per fetch) enforce a 60s minimum refresh to cap cellular data usage.

### Performance & Reliability

- **Feed-level fetch dedupe + 10s TTL cache** — stations sharing a GTFS-RT feed no longer trigger duplicate downloads/decodes; prefetch of N favorites on one feed costs one fetch instead of N.
- Refresh-interval setting changes now apply immediately (was: required app restart).
- Auto-refresh no longer cancels in-flight station-switch renders (duplicate fetch eliminated).
- Exiting the alert view re-renders from cache so the footer timestamp is current.
- Route-filter storage no longer accumulates empty entries.

### Internals

- Multi-system architecture: TransitSystem registry, direction-id strategy for standard GTFS, stop-suffix strategy for MTA subway.
- Station pack generator (scripts/generate-stations.mjs) builds packs from any static GTFS zip.
- Protobuf fixture tests for arrivals parsing and LIRR track extraction (49 tests, up from 30).

## v1.6.2 — 2026-06-09

Bug fix release.

### Glasses Display

- **Favorites display no longer waits on GPS** — `loadStations()` previously awaited a GPS fix (up to 10 seconds on a cold Android lock) before rebuilding the station list, delaying redisplay of favorite stations that don't need location at all. Favorites now publish immediately; nearby stations resolve in the background and append when ready, triggering a light cache-based re-render (progress bar updates to the new station count, no nav reset, no alert-view exit).

## v1.6.0 — 2026-05-23

Feature release: instant station switching, live phone preview, per-station route filters, delay + stale indicators, and a full unit test suite.

### Glasses Display

- **Instant station switching (warm cache)** — SubwayLens now prefetches arrivals for all favorite stations in parallel on startup and whenever the app returns to the foreground. Scrolling to a new station shows cached data immediately with no "Loading..." flash. Fresh data arrives in the background and updates the display automatically.
- **Per-train delay indicator** — when the MTA GTFS-RT feed reports a trip is running behind schedule (>60s delay), the terminal name is replaced with "+Xm late" so you can see at a glance which trains to wait for and which to skip.
- **Stale data warning** — when the last successful data fetch is more than 2 minutes old (e.g., a slow MTA endpoint), the footer line changes to "! Xm old  tap:refresh" so you know not to trust the arrival times blindly.

### Phone Settings

- **Per-station route filter** — each station row in "My Stations" now shows tappable route badges. Tap a badge to hide that route from the glasses display (badge fades to 25% opacity). Hidden routes are stored per station and respected instantly. Useful at multi-line stations where you only ever take one route (e.g., only the 4/5 at a 4/5/6 station).
- **Live glasses preview** — a new "Glasses Preview" section shows a real-time simulation of exactly what your G2 glasses are currently displaying. Fetches live MTA data from the phone and renders using the same layout engine as the glasses. Auto-refreshes on the configured interval. Station picker lets you preview any favorite.

### Reliability & Performance

- **Bundle code splitting** — Vite now splits the build into three chunks: app code, vendor-react, and vendor-gtfs (protobuf/GTFS bindings). The GTFS chunk loads in parallel with the main bundle, reducing time-to-interactive on the Android phone settings page.
- **Alert severity ordering** — service alerts are now sorted by severity before caching: NO_SERVICE alerts appear before REDUCED_SERVICE, SIGNIFICANT_DELAYS, etc. The most disruptive alert for a route is always shown first.
- **Search alias matching tightened** — alias keywords now require `startsWith` matching (was `includes`). Searching "bar" correctly matches "barclays" but no longer matches unrelated results that happen to contain "bar" mid-word.
- **Unit test suite** — added Vitest with 33 tests across `time.ts`, `geo.ts`, `search.ts`, and `display.ts`. Covers edge cases including near-midnight arrival formatting, haversine distance, alias min-length guard, and renderer output shape.

---

## v1.5.4 — 2026-05-02

Code-quality and reliability release. No new user-visible features — all changes are under the hood.

### Bug Fixes

- **Race condition: stale arrivals clobbering the display** — each display-initiating action (navigation or refresh) now captures a monotonic sequence number. Async continuations abort their write if the sequence has moved on, so a slow fetch for station A can never overwrite the display after the user has already scrolled to station B.
- **Concurrent auto-refreshes** — an `isRefreshing` gate prevents a new interval tick from starting a second fetch while the previous one is still in flight.

### Reliability

- **Feed fetch timeouts** — each MTA GTFS-RT feed request now uses an `AbortController` with an 8-second timeout (matching the existing alerts feed), so a hung endpoint cannot block the refresh cycle indefinitely.

### Code Quality

- **Centralised station data** — `src/data/stations.ts` is a new single module that exports `allStations`, `stationById`, and `stopIdToStation`. Four files that previously each imported `stations.json` and rebuilt their own maps now share these.
- **`getStation()` is now O(1)** — `settings/search.ts` previously did a linear `Array.find` for ID lookups; it now uses the shared `stationById` Map.
- **Extracted `buildContainers()` helper** — `createInitialPage` and `rebuildPage` in `main.ts` shared ~40 lines of duplicated `TextContainerProperty` construction. One helper now serves both.
- **Removed dead wrapper** — `getStationArrivals` was a redundant try/catch around `fetchStationArrivals`, which already swallows per-feed errors. The extra wrapper is removed.
- **Removed dead null checks** — `if (!arrivals) return` guards in `displayCurrentStation` and `refreshInPlace` were unreachable since `getStationArrivals` always returns an object; removed.
- **Clock formatting deduplication** — `display.ts` had inline H:MMa/p formatting in two places. Extracted into a shared `formatClockTime(date)` helper.
- **Version string wired to `package.json`** — `src/lib/version.ts` imports `pkg.version` directly so the version footer in `SettingsApp.tsx` can never drift from `package.json` or `app.json`.
- **Drag-and-drop state cleanup** — `FavoritesList.tsx` now uses `useRef` for drag index values in mouse event handlers (avoiding nested `setState` callbacks to read current state) and a `useEffect` cleanup to remove window-level listeners if the component unmounts mid-drag.
- **Search alias guard** — alias matching now requires a minimum 3-character query, preventing short prefixes like "p" from eagerly surfacing alias results.
- **`setupInput` unsub stored** — `main.ts` now retains the unsubscribe handle returned by `setupInput` so re-entry is safe.
- **Collapsed duplicate lifecycle handlers** — `onForegroundExit` and `onAbnormalExit` performed identical cleanup; unified into a single `handleBackground` function.
- **Consistent number parsing** — `SettingsPanel.tsx` now uses `Number()` for both refresh interval and nearby radius (was `parseInt` + `parseFloat`).
- **Fixed stale docstring** — `time.ts` `formatArrival` doc now correctly shows `"Nm - H:MM"` instead of `"Nm H:MM"`.
- **Fixed misleading comment** — `alerts.ts` comment "most relevant = first" corrected to "first encountered in feed order".

---

## v1.5.3 — 2026-04-18

Dependency maintenance release.

### Dependency updates

- **Even Hub SDK** — Updated to v0.0.10
- **Even Hub CLI** — Updated to v0.1.12
- **protobufjs** — Updated to patch critical security vulnerability (arbitrary code execution)
- **npm** — Updated to v11.12.1

---

# Changelog
## v1.5.2 — 2026-04-14
Fix: handle ABNORMAL_EXIT_EVENT to stop auto-refresh on unexpected disconnect.

### Bug Fixes
- **Connection lost error on app close** — SubwayLens now handles `ABNORMAL_EXIT_EVENT` from the SDK. Previously, closing the EvenRealities companion app while SubwayLens was active left the auto-refresh timer running, causing bridge calls to a dead connection and a "connection lost" error on the glasses display. The timer is now stopped cleanly on disconnect.

---

## v1.5.1 — 2026-04-11
Fix: header clock now updates on every auto-refresh cycle, not only on station switch.

### Bug Fixes
- **Clock freeze** — `refreshInPlace()` now calls `updateHeader()` alongside `updateBody()`. The header clock previously only updated when scrolling to a new station or sending favorites from the phone.

---

## v1.5.0 — 2026-04-11
Quality-of-life release: smarter terminal name display, MTA service alerts, last-refreshed timestamp, and dependency updates.
### Glasses Display
- **Smart terminal abbreviations** — curated lookup table (~50 entries) maps verbose MTA terminal names to short, rider-recognizable abbreviations. `Coney Island-Stillwell Av` becomes `Coney Island`, `Van Cortlandt Park-242 St` becomes `Van Cortlandt`, `Jamaica Center-Parsons/Archer` becomes `Jamaica Ctr`, etc. Falls back to existing truncation for unlisted terminals.
- **Service alert indicators** — route badges now show `[E!]` instead of `[E]` when MTA reports an active service alert for that route. Fetched from the MTA GTFS-RT alerts feed alongside arrivals data.
- **Alert summary view** — tap to toggle between arrivals view and a condensed alert summary when alerts are active. Shows affected route, alert header text. Footer hint updates to `tap:alerts  dbl:exit` when alerts exist, `tap:trains  dbl:exit` to return.
- **Last-refreshed timestamp** — footer line now shows the time of last successful data fetch (e.g. `10:24a  tap:refresh  dbl:exit`). Users can immediately tell if arrival data is fresh or stale.
### Dependencies
- `@evenrealities/even_hub_sdk` updated from 0.0.9 to 0.0.10 (shadow-timers fix for WebView timer reliability)
- `@evenrealities/evenhub-cli` updated from 0.1.10 to 0.1.11
- `even-toolkit` updated from 1.1.2 to 1.7.0 (full component library now available for future use)
- `react-router` added as peer dependency (required by even-toolkit 1.3.0+)
### New Files
- `src/data/terminal-abbrevs.ts` — terminal name abbreviation lookup table
- `src/data/alerts.ts` — MTA GTFS-RT alerts fetch, decode, and cache layer


## v1.4.0 — 2026-04-07

UI, display, and navigation improvements across both the phone settings page and glasses display.

### Phone UI

- **List item dividers** — subtle hairline borders between station rows in My Stations, Add Station search results, and Nearby Stations. Rows no longer visually merge together.
- **Green checkmark** — already-favorited stations now show a green ✓ (using `text-positive` token) instead of dim gray in both search results and Nearby Stations.
- **Larger route badges** — MTA route badges increased from 22×22px to 24×24px with font size bumped from 12px to 13px. Easier to read, less cramped on multi-route stations.
- **Distance pill** — nearby station distances (e.g. "0.12 mi") now display as a bordered pill badge instead of plain dim text.

### Glasses Display

- **Compact time format** — arrival times shortened from "3 min - 10:24" to "3m 10:24", saving ~4 characters per train line and giving terminal names more room.
- **NOW for imminent trains** — trains under 1 minute away now show "NOW 10:24" instead of "0 min - 10:24". Clearer and more urgent at a glance.
- **Solid direction divider** — the dashed ─ ─ ─ ─ divider between north and south directions replaced with a solid ━━━━━━━ heavy line, matching the progress bar style.
- **Live clock in header** — current time displayed on the right side of the station name header, updating on every refresh cycle. No extra containers needed.
- **Control hint footer** — a dim "tap:refresh  dbl:exit" line at the bottom of the body so new users know what the ring gestures do.

### Navigation

- **Exit confirmation** — double-tap no longer exits immediately. First double-tap shows "Double-tap again to exit. Scroll or tap to cancel." Second double-tap within 3 seconds exits. Any scroll or tap cancels and restores the normal view.
- **Auto-cancel** — if no second double-tap is received within 3 seconds, the confirmation screen dismisses automatically.
- **Pause auto-refresh during confirm** — the auto-refresh timer does not fire while the exit confirmation screen is showing.

### Dependencies

- **even-toolkit** updated from 1.0.0 to 1.6.5. No breaking changes — all existing component imports and CSS token paths are backward compatible.

## v1.3.0 — 2026-04-01

Added nearby stations feature with GPS-based discovery.

### Added

- **Nearby Stations** — GPS-detected stations within a configurable radius (0.1, 0.25, 0.5, or 1.0 miles). Shows when "Show nearby stations" is enabled in settings.
- Five states handled: loading, denied, unavailable, no results, results with distance and add-to-favorites.
- `NearbyStations.tsx` component with `getCurrentPosition()` + `nearbyStations()` from `geo.ts`.
- Nearby radius setting added to `SettingsPanel.tsx` (hidden when nearby is off).

## v1.2.3 — 2026-03-30

Hotfix for version string and minor display corrections.

## v1.2.2 — 2026-03-29

Hotfix release.

## v1.2.1 — 2026-03-28

Larger drag handle and Hudson Yards borough code fix.

## v1.2.0 — 2026-03-27

Borough direction codes and UX improvements.

### Added

- Borough codes (MAN/QNS/BK/BX) shown below direction headers on glasses display.
- Scroll fix for WebView.

## v1.1.1 — 2026-03-27

Bug fixes and SDK 0.0.9 compliance.

## v1.1.0 — 2026-03-21

Settings page redesign — replaced vanilla DOM dark theme with React + even-toolkit light theme.

## v1.0.0 — 2026-03-15

First release.
