# Changelog

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
