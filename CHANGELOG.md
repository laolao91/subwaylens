# Changelog

## v1.2.3 — 2026-03-28

Configuration improvement — adds location permission for GPS nearby stations feature.

### Configuration

- **Added location permission** — The `permissions` array in `app.json` now includes a `location` permission to enable the "Show nearby stations" feature. The app uses `navigator.geolocation.getCurrentPosition()` when this setting is enabled, so declaring the permission is required by Even Hub best practices. (`app.json`)

### Files Changed

| File | Change |
|------|--------|
| `app.json` | Add location permission (v1.2.3) |
| `package.json` | Version 1.2.3 |
| `README.md` | Update current version to 1.2.3, update SDK notes |

## v1.2.2 — 2026-03-28

Configuration improvement — adds network permission whitelist for enhanced security as per Even Hub best practices.

### Configuration

- **Added network permission whitelist** — The `network` permission in `app.json` now includes a `whitelist` array restricting network access to only `https://api-endpoint.mta.info`. This follows Even Hub official documentation best practices for security by explicitly limiting which domains the app can access. No code changes required. (`app.json`)

### Files Changed

| File | Change |
|------|--------|
| `app.json` | Add whitelist to network permission (v1.2.2) |
| `package.json` | Version 1.2.2 |

## v1.2.1 — 2026-03-27

Bug fix release — improves drag-to-reorder UX and fixes missing borough code for Hudson Yards terminal.

### Bug Fixes

- **Improved drag handle for favorites reordering** — Increased drag handle size from 15px to 20px and expanded tap area to 40x40px (w-10 h-10) for easier grabbing and reordering on mobile. The larger hit box makes it much easier to initiate drag operations. (`src/settings/FavoritesList.tsx`)

- **Fixed missing MAN code for Hudson Yards** — Added "34 St-Hudson Yards", "Hudson Yards", and "Hudson Yards-34 St" to the Manhattan borough mapping. The 7 train to Hudson Yards now correctly shows MAN on the glasses display. (`src/data/boroughs.ts`)

### Files Changed

| File | Change |
|------|--------|
| `src/settings/FavoritesList.tsx` | Larger drag handle (20px text, 40x40px tap area) |
| `src/data/boroughs.ts` | Add Hudson Yards terminal variations |
| `src/settings/SettingsApp.tsx` | Version 1.2.1 footer |
| `package.json` | Version 1.2.1 |
| `app.json` | Version 1.2.1 |

## v1.2.0 — 2026-03-27

Feature release — adds borough direction indicators on glasses display, fixes persistent scroll issue from v1.1.1, and improves UX for station search and sync button.

### New Features

- **Borough direction codes** — Glasses display now shows 3-letter borough codes (MAN/QNS/BK/BX) on a separate line below each direction header (▲/▼). This helps users quickly understand where trains are heading without memorizing terminal names.
  - Example display:
    ```
    ▼ Coney Island-Stillwell Av
    BK
     [D] Coney Island-Stillwell  4 min
    ```
  - Comprehensive terminal-to-borough mapping covers ~150 MTA terminals
  - Shows for all terminals regardless of current borough
  (`src/data/boroughs.ts`, `src/glasses/display.ts`)

### Bug Fixes

- **Fixed scroll issue (critical)** — The v1.1.1 scroll fix didn't work. Settings section was still inaccessible when favorites list was long. Root cause: `AppShell` component from even-toolkit doesn't handle scroll properly in the Even App WebView. **Solution:** Replaced `AppShell` with a simpler flex layout with explicit `overflow-y: auto` on the content area. Settings section is now always reachable regardless of favorites list length. (`src/settings/SettingsApp.tsx`)

### UX Improvements

- **"Send to Glasses" button repositioned** — Moved from top-right corner (easy to miss) to a prominent black button fixed at the bottom of the screen. More obvious and follows mobile app patterns for primary actions. (`src/settings/SettingsApp.tsx`)

- **Auto-clear search after add** — Search input now clears automatically after adding a station to favorites. No more manual backspacing. (`src/settings/StationSearch.tsx`)

### Files Changed

| File | Change |
|------|--------|
| `src/settings/SettingsApp.tsx` | Removed AppShell, fixed scroll, repositioned sync button |
| `src/settings/StationSearch.tsx` | Auto-clear search after add |
| `src/data/boroughs.ts` | NEW - Terminal-to-borough mapping (150+ terminals) |
| `src/glasses/display.ts` | Add borough codes below direction headers |
| `package.json` | Version 1.2.0 |
| `app.json` | Version 1.2.0 |

## v1.1.1 — 2026-03-27

Bug fix release — addresses three issues discovered during real-device testing on iPhone in the Even App WebView. Also updates to latest SDK/CLI versions for Even Hub Early Developer Program compliance.

### Bug fixes

- **Search result layout clipping** — Fixed search results with many route badges (8+ badges) pushing the add button off the right edge of the screen. Station names and route badges now stack vertically (name on top, badges below) with the add button guaranteed to stay visible on the right side with a 44x44px minimum tap target. (`src/settings/StationSearch.tsx`)

- **Settings section inaccessible** — Fixed page scroll issue where the Settings controls (refresh interval, nearby stations, nearby radius) were pushed below the viewport and unreachable. Added explicit scroll handling to ensure the entire page is scrollable in the Even App WebView. (`src/app.css`)

- **Search too strict** — Added fuzzy matching to station search. Users can now find stations with natural search patterns that previously failed:
  - Ordinal handling: "42nd" finds "42 St" stations
  - Abbreviation normalization: "time square" finds "Times Sq-42 St", "lex" finds "Lexington Av/53 St", "herald square" finds "Herald Sq"
  - Word-order tolerance: all query words must match but order doesn't matter
  - Bidirectional abbreviations: st↔street, av↔ave↔avenue, sq↔square, blvd↔boulevard, pkwy↔parkway, ctr↔center↔centre, hts↔heights, jct↔junction
  - Hyphens treated as spaces for matching
  - Search aliases (WTC, Penn Station, Grand Central, etc.) still take priority
  (`src/settings/search.ts`)

### Dependency updates

- **Even Hub SDK** — Updated to v0.0.9 (latest) for Even Hub Early Developer Program compliance
  - New features: Launch source listening, 12 container limit (up from 4), 288x144 image sizes, IMU hardware control
- **Even Hub CLI** — Updated to v0.1.10 (latest) for Even Hub Early Developer Program compliance
- **Even Hub Simulator** — Added v0.6.2 dev dependency for local testing with latest SDK features
- **Simulator requirement** — App verified on simulator v0.6.2

### Files changed

| File | Change |
|------|--------|
| `src/settings/StationSearch.tsx` | Vertical stacking layout for search results |
| `src/app.css` | Scroll handling for WebView |
| `src/settings/search.ts` | Fuzzy matching with abbreviation expansion |
| `package.json` | Version 1.1.1 |
| `app.json` | Version 1.1.1 |

## v1.1.0 — 2026-03-21

Settings page redesign — replaced the vanilla DOM dark-themed settings page with React + even-toolkit components, matching the Even Realities 2025 UIUX Design Guidelines light theme.

### What changed

- **React settings page** — Rebuilt the entire phone settings UI as React components using the even-toolkit design system. Light theme (#EEEEEE background, #FFFFFF cards) replaces the previous dark theme.
- **even-toolkit components** — Uses AppShell, ScreenHeader, Button, Toast, SegmentedControl, Toggle, SettingsGroup, EmptyState, and Input from even-toolkit/web.
- **Touch drag-to-reorder preserved** — Favorites list supports drag reorder via touch events (handle drag + long-press) for the Even App WebView, plus mouse drag for desktop browsers.
- **Visible delete button** — Each favorite has an x button for removal (works on desktop and mobile). Swipe-to-delete also works on mobile.
- **MTA route badges** — Custom RouteBadge component preserves official MTA brand colors. Badges appear left of station name in search results, below station name in favorites.
- **Toast notification** — "Send to Glasses" now shows a slide-up toast confirmation.
- **Version number** — v1.1.0 shown in footer.
- **Vite + React + Tailwind** — Added @vitejs/plugin-react, @tailwindcss/vite, and React 19. Vite downgraded from 7.x to 6.x for plugin compatibility.

### What did NOT change

All glasses display and data files are untouched:
- src/glasses/display.ts, src/glasses/input.ts, src/glasses/stations.ts
- src/data/mta-feeds.ts, src/data/feed-urls.ts, src/data/stations.json
- src/lib/types.ts, src/lib/storage.ts, src/lib/time.ts, src/lib/geo.ts
- src/main.ts — only change: import path updated from settings-page to settings-mount

### Files added

- src/settings/SettingsApp.tsx — React root component
- src/settings/FavoritesList.tsx — Favorites with drag reorder + delete
- src/settings/StationSearch.tsx — Debounced search with add-to-favorites
- src/settings/SettingsPanel.tsx — Refresh interval, nearby toggle, nearby radius
- src/settings/RouteBadge.tsx — MTA route color badges
- src/settings/settings-mount.tsx — React mount bridge
- src/app.css — even-toolkit light theme + Tailwind + MTA badges

### Files removed

- src/settings/settings-page.ts — replaced by SettingsApp.tsx
- src/settings/favorites.ts — replaced by FavoritesList.tsx
- src/styles.css — replaced by app.css

## v1.0.0 — 2026-03-15

First release after UAT testing on simulator and real G2 hardware.

### Bug fixes

- **BUG-001: Bridge detection black screen** — The SDK injects a bridge object even in regular browsers, causing the app to enter glasses mode and show a black screen instead of the settings page. Fixed by checking for `window.flutter_inappwebview` before entering glasses mode. (`src/main.ts`)

- **BUG-002: MTA feed always returns mock data** — The mock detection check used `HEAD` requests, but the MTA endpoint returns 403 for HEAD. Changed to `GET` with `AbortController` to cancel the response body after receiving headers. (`src/main.ts`)

- **BUG-003: Generic mock terminal names** — Mock data showed "Uptown", "Downtown" instead of real route destinations. Added `ROUTE_TERMINALS` map with actual last-stop names for all 24 routes. (`src/data/mta-feeds.ts`)

- **BUG-004: No settings page in Even App WebView** — The app treated glasses mode and settings page as mutually exclusive. Changed boot logic to always initialize the settings page, then additionally start glasses mode if the Flutter bridge is present. (`src/main.ts`)

- **BUG-005: Favorites don't sync to glasses** — Added "Send to Glasses" button that dispatches a `CustomEvent('subwaylens:sync')` caught by the glasses mode listener, which reloads stations and rebuilds the display. (`src/main.ts`, `src/settings/settings-page.ts`, `src/styles.css`)

- **BUG-006: Drag reorder broken on mobile** — HTML5 Drag and Drop API doesn't work in mobile WebViews. Added `touchstart`/`touchmove`/`touchend` handlers with floating visual lift effect and long-press support. (`src/settings/favorites.ts`, `src/styles.css`)

### Enhancements

- **Search aliases** — Added common name aliases so users can search "World Trade Center", "WTC", "Penn Station", "Grand Central", "Jackson Heights", etc. and find the correct station. (`src/settings/search.ts`)

- **Dynamic direction labels** — Direction headers (▲/▼) now derive from the most common terminal name in the actual train data, instead of using static generic labels. Falls back to station data when no trains are available. (`src/glasses/display.ts`)

- **Terminal name display** — Increased terminal name truncation from 16 to 19 characters so names like "Forest Hills-71 Av" display in full. (`src/glasses/display.ts`)

- **Display cleanup** — Removed duplicate heavy divider between header and body containers (the simulator/hardware draws its own container boundary line). Removed dividers from loading and empty state screens. (`src/glasses/display.ts`)

### Files changed

| File | Changes |
|------|---------|
| `src/main.ts` | Bridge detection, mock check, dual-mode boot, sync listener |
| `src/glasses/display.ts` | Direction labels, terminal truncation, divider cleanup |
| `src/data/mta-feeds.ts` | Route terminals map, typed sort callbacks |
| `src/settings/settings-page.ts` | Sync button HTML and handler |
| `src/settings/search.ts` | Search aliases |
| `src/settings/favorites.ts` | Touch drag-to-reorder |
| `src/styles.css` | Sync button styles, drag visual feedback |

### Known issues (deferred to v1.1)

See `tests.md` for full details.

- **IMP-001:** Direction header labels need per-station customization to match MTA platform signage
- **IMP-002:** Simulator shows double green line at container boundary (verify on real hardware)
- **IMP-003:** Long terminal names still truncated at 19 chars (consider smart abbreviations)
