# SubwayLens v2.0.0 Design Spec

**Date:** 2026-06-26
**Version:** 2.0.0
**Scope:** Launch menu, Delays view, nearest-station priority, LIRR/MNR badge fix, phone settings for launch behavior

---

## 1. Summary of Changes

SubwayLens 2.0 introduces three user-facing changes on top of the v1.8.2 base:

1. **Bug fix** — LIRR/MNR stations in the phone app showed raw GTFS numeric route IDs (e.g., "13", "4") as subway-style circular badges. They now show a single `LIRR` or `MNR` blue badge. The "tap to hide" route filter is suppressed for commuter-rail stations since numeric branch IDs are meaningless to users.

2. **Nearest-station priority (Feature 1)** — When GPS resolves on launch, the nearest station moves to position 0 in the glasses cycling order, even if it is already a favorite. Its arrivals are prefetched immediately so the display is ready without a loading gap. Order: nearest → favorites (saved order, deduped) → other nearby.

3. **Launch menu + Delays view (Feature 2)** — A new top-level mode state (`menu | stations | delays`) replaces the direct-to-stations launch. A launch menu lets users pick their starting view each session. A new Delays view surfaces system-wide service alerts and per-station significant delays (5+ min) without requiring navigation to individual stations.

---

## 2. App Modes and Navigation

### Mode state machine

```
App opens
    ↓
launchMode setting?
  'menu'      → show MENU
  'nearest'   → enter STATIONS (nearest station at index 0)
  'favorites' → enter STATIONS (favorites order, index 0)
  'delays'    → enter DELAYS

MENU     scroll=move highlight  tap=enter view  dbl=exit app
STATIONS scroll=cycle stations  tap=refresh     dbl=back to MENU
DELAYS   scroll=cycle alerts    tap=refresh     dbl=back to MENU
```

Double-tap from any non-menu view always returns to the menu, even when the user bypassed it on launch via a default mode setting. This lets users switch modes mid-session without touching their phone.

---

## 3. Launch Menu (Glasses)

### Display

```
SUBWAYLENS
━━━━━━━━━━━━━━━━━━━━━━━━━━
▶ Nearest Station
  Favorites
  Delays
━━━━━━━━━━━━━━━━━━━━━━━━━━
scroll:select  tap:enter  dbl:exit
```

- Header container: "SUBWAYLENS"
- Body container: the three options with a `▶` cursor
- Scroll up/down moves the cursor
- Tap enters the highlighted option
- Double-tap exits the app (only place in the app where dbl=exit)
- The cursor starts pre-highlighted on the user's `defaultView` (even when `showLaunchMenu` is true). If `defaultView` is `'nearest'` but GPS is off, cursor falls back to `'favorites'`.

### GPS / nearby edge cases

- If `nearbyEnabled` is off: "Nearest Station" renders as `  Nearest Station  (GPS off)` and is unselectable. Cursor skips it.
- If nearby is enabled but GPS has not yet resolved: option is selectable. Entering stations mode shows favorites immediately; nearest station slides to position 0 once GPS resolves (same as Feature 1 behavior).

---

## 4. Delays View (Glasses)

### Display

```
! DELAYS & ALERTS
━━━━━━━━━━━━━━━━━━━━━━━━━━
[A] A/C/E suspended btwn...
    W 4th-St to Jay St
[R] Minor delays systemwide
━━━━━━━━━━━━━━━━━━━━━━━━━━
  At your stations:
[B] DeKalb Av  +7m late
[R] Atlantic Av  +3m late
[F] Jackson Hts (nearby)  +6m
━━━━━━━━━━━━━━━━━━━━━━━━━━
10:23a  tap:refresh  dbl:menu
```

### Top section — system-wide service alerts

- Source: existing `fetchAlerts()` (MTA subway alerts feed)
- Shows all active route alerts, up to 4 (same cap as the existing per-station alert summary)
- Each alert: `[routeId] header text`, wrapped to a second line if needed
- If no alerts: `  No active alerts`

### Bottom section — delays at your stations

- Source: cached `StationArrivals` already fetched on launch — no extra network calls
- Stations checked: all favorited stations + the nearest station (if GPS resolved and it is not already a favorite)
- Threshold: any individual train with `delay > 300` seconds (5 min)
- Nearest station entries are labeled `(nearby)` to distinguish them from favorites
- If nothing exceeds the threshold: entire bottom section is hidden
- Format per entry: `[route] Station Name  +Xm late`

### Refresh behavior

- Tap fetches fresh alerts and re-scans cached arrivals
- Data age footer matches stations view convention: shows fetch time or `! Xm old` warning if stale

---

## 5. Phone Settings — Launch Behavior

New section added to `SettingsPanel` below the existing Nearby Stations section.

### UI

```
LAUNCH BEHAVIOR

Show launch menu          [toggle]
Opens a menu each time you launch
SubwayLens so you can choose your
starting view.

Default view:
  ○ Nearest Station
  ● Favorites
  ○ Delays
```

- Toggle ON + default = Favorites: menu appears each session with cursor pre-highlighted on Favorites
- Toggle OFF + default = Favorites: skips menu, goes straight to Favorites every time
- "Nearest Station" option is greyed and non-selectable when `nearbyEnabled` is off, with a note: "Enable nearby stations above"
- Stored as two fields in `AppSettings`:
  - `showLaunchMenu: boolean` — whether to show the menu on launch (default: `true`)
  - `defaultView: 'nearest' | 'favorites' | 'delays'` — the default view (default: `'favorites'`)
- When `showLaunchMenu` is `true`: menu appears with cursor pre-highlighted on `defaultView`
- When `showLaunchMenu` is `false`: skips menu and jumps directly to `defaultView`
- Existing users who upgrade get `showLaunchMenu: true` + `defaultView: 'favorites'` (menu shows, cursor starts on Favorites)

---

## 6. Data / Type Changes

### `AppSettings` (src/lib/types.ts)

Add two fields:
```ts
showLaunchMenu?: boolean                           // default: true
defaultView?: 'nearest' | 'favorites' | 'delays'  // default: 'favorites'
```
Both absent/undefined resolve to their defaults at runtime.

### `AppMode` (src/main.ts or new src/lib/types.ts entry)

New union type for the top-level glasses state:
```ts
type AppMode = 'menu' | 'stations' | 'delays'
```

---

## 7. Files Affected

| File | Change |
|------|--------|
| `src/settings/RouteBadge.tsx` | Add `SystemBadge` component (LIRR/MNR blue badge) |
| `src/settings/RouteFilter.tsx` | Accept `system` prop; render `SystemBadge` for commuter rail |
| `src/settings/FavoritesList.tsx` | Pass `system={station.system}` to `RouteFilter` |
| `src/settings/StationSearch.tsx` | Render `SystemBadge` instead of `RouteBadges` for commuter rail |
| `src/settings/NearbyStations.tsx` | Same as StationSearch |
| `src/glasses/stations.ts` | `appendNearbyStations` — nearest to position 0, prefetch arrivals |
| `src/lib/types.ts` | Add `launchMode` to `AppSettings`, add `AppMode` type |
| `src/lib/storage.ts` | Default `launchMode` to `'menu'` |
| `src/glasses/display.ts` | Add `renderMenu()`, `renderDelays()` |
| `src/glasses/input.ts` | No changes — callback interface already sufficient |
| `src/main.ts` | Mode state machine, wire up menu/delays flows |
| `src/settings/SettingsPanel.tsx` | Add "Launch Behavior" section |

---

## 8. Out of Scope

- LIRR/MNR service alerts (alerts feed is subway-only; commuter-rail alerts not available via same endpoint)
- Delays for LIRR/MNR stations in the bottom section (individual train delay data is available via departure board; can be included in a future pass)
- Persistent "last used mode" memory (user sets a default explicitly; no auto-learning)
