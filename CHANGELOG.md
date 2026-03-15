# Changelog

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
