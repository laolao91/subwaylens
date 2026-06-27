# SubwayLens v2.0.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship SubwayLens v2.0.0 — a launch menu, system-wide Delays view, nearest-station priority, and LIRR/MNR badge fix — built on top of the v1.8.2 codebase already present in `SubwayLens_v2.0.0/`.

**Architecture:** A new `AppMode` ('menu' | 'stations' | 'delays') replaces the hard-coded station-first startup. `main.ts` reads two new settings fields (`showLaunchMenu`, `defaultView`) to decide whether to display the launch menu or jump directly to a view. The bug fix (LIRR/MNR badges) and Feature 1 (nearest-station priority) are already committed to this folder from the v1.9.1 copy — only Tasks 1–4 below produce net-new code.

**Tech Stack:** TypeScript, React (phone settings UI), Vite, Vitest, Even Hub SDK, even-toolkit/web components.

**Working directory for all commands:** `/Users/stevenlao/Claude_Code_Sandbox/EvenHub_Developer_Submissions/SubwayLens/SubwayLens_v2.0.0`

## Global Constraints

- All tests run with: `npm test` (Vitest)
- TypeScript strict mode — no `any` unless already present in the file being edited
- Do not modify v1.8.1 or v1.9.1 folders
- Never write the GitHub PAT to any file; use only in the remote URL argument at push time
- `display.ts` functions must be pure (no side effects, no imports from `main.ts` or `stations.ts`)
- Even Hub container names max 16 chars; container IDs must match existing HEADER_ID=1, BODY_ID=2

---

## File Map

| File | Status | What changes |
|------|--------|-------------|
| `src/lib/types.ts` | Modify | Add `showLaunchMenu`, `defaultView` to `AppSettings`; add `AppMode` type |
| `src/glasses/display.ts` | Modify | Add `renderMenu()`, `renderDelays()` |
| `src/glasses/display.test.ts` | Modify | Tests for `renderMenu()`, `renderDelays()` |
| `src/main.ts` | Modify | Mode state machine; update input handlers; read new settings |
| `src/main.test.ts` | Modify | Tests for new mode helpers |
| `src/settings/SettingsPanel.tsx` | Modify | Add "Launch behavior" section |

---

## Task 1: Types — AppSettings and AppMode

**Files:**
- Modify: `src/lib/types.ts`

**Interfaces:**
- Produces: `AppSettings.showLaunchMenu`, `AppSettings.defaultView`, `AppMode` type — consumed by Tasks 2, 3, 4

- [ ] **Step 1: Add the new fields to `AppSettings` and `DEFAULT_SETTINGS`, and add `AppMode`**

Replace the `AppSettings` block (lines 34–46) in `src/lib/types.ts` with:

```typescript
/** User settings */
export interface AppSettings {
  refreshInterval: number  // seconds (15, 30, 60, 120)
  nearbyEnabled: boolean
  nearbyRadius: number     // miles (0.1, 0.25, 0.5, 1.0)
  hiddenRoutes: Record<string, string[]>  // stationId → route IDs to hide on glasses
  showLaunchMenu: boolean  // true = show menu on every launch; false = skip to defaultView
  defaultView: 'nearest' | 'favorites' | 'delays'  // starting view / menu pre-selection
}

export const DEFAULT_SETTINGS: AppSettings = {
  refreshInterval: 30,
  nearbyEnabled: true,
  nearbyRadius: 0.25,
  hiddenRoutes: {},
  showLaunchMenu: true,
  defaultView: 'favorites',
}

/** Top-level glasses display mode */
export type AppMode = 'menu' | 'stations' | 'delays'
```

- [ ] **Step 2: Verify TypeScript compiles with no errors**

```bash
npx tsc --noEmit
```

Expected: no output (clean compile). If there are errors, they will be in files that reference `AppSettings` — fix by providing the new fields where required (storage.ts already uses `{ ...DEFAULT_SETTINGS, ...parsed }` spread, so new fields get defaults automatically).

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add showLaunchMenu/defaultView to AppSettings and AppMode type"
```

---

## Task 2: Glasses Display — renderMenu() and renderDelays()

**Files:**
- Modify: `src/glasses/display.ts`
- Modify: `src/glasses/display.test.ts`

**Interfaces:**
- Consumes: `AppMode` from `../lib/types`; `RouteAlert` from `../data/alerts`; `Station`, `StationArrivals` from `../lib/types`
- Produces:
  - `renderMenu(cursor: number, nearbyEnabled: boolean): string`
  - `renderDelays(alerts: Map<string, RouteAlert[]>, stationEntries: Array<{ station: Station; arrivals: StationArrivals; isNearby: boolean }>, now: number): string`

### renderMenu

- [ ] **Step 1: Write the failing test for renderMenu**

Add to `src/glasses/display.test.ts` (find the existing `describe` blocks and append a new one):

```typescript
describe('renderMenu', () => {
  it('highlights the cursor option with ▶', () => {
    const out = renderMenu(1, true)
    const lines = out.split('\n')
    expect(lines.some(l => l.startsWith('▶') && l.includes('Favorites'))).toBe(true)
    expect(lines.some(l => l.startsWith(' ') && l.includes('Nearest Station'))).toBe(true)
    expect(lines.some(l => l.startsWith(' ') && l.includes('Delays'))).toBe(true)
  })

  it('dims Nearest Station when nearbyEnabled is false', () => {
    const out = renderMenu(1, false)
    expect(out).toContain('Nearest Station  (GPS off)')
  })

  it('footer says tap:enter dbl:exit', () => {
    expect(renderMenu(0, true)).toContain('tap:enter')
    expect(renderMenu(0, true)).toContain('dbl:exit')
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npm test -- display
```

Expected: FAIL — `renderMenu is not a function` (or import error).

- [ ] **Step 3: Implement renderMenu in display.ts**

Add after the `renderNoStations` function (around line 319):

```typescript
const MENU_OPTIONS = ['Nearest Station', 'Favorites', 'Delays'] as const

/**
 * Render the launch menu body.
 * cursor: 0=Nearest, 1=Favorites, 2=Delays.
 * When nearbyEnabled is false the Nearest option is shown as unselectable.
 */
export function renderMenu(cursor: number, nearbyEnabled: boolean): string {
  const lines: string[] = []
  lines.push('━'.repeat(DIVIDER_WIDTH))
  MENU_OPTIONS.forEach((label, i) => {
    const marker = i === cursor ? '▶' : ' '
    if (i === 0 && !nearbyEnabled) {
      lines.push(`${marker} Nearest Station  (GPS off)`)
    } else {
      lines.push(`${marker} ${label}`)
    }
  })
  lines.push('━'.repeat(DIVIDER_WIDTH))
  lines.push('scroll:select  tap:enter  dbl:exit')
  return lines.join('\n')
}
```

Also add `renderMenu` to the import list in `display.ts`'s own exports. Since it's exported with `export function`, no extra change is needed.

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npm test -- display
```

Expected: all renderMenu tests PASS.

### renderDelays

- [ ] **Step 5: Write the failing tests for renderDelays**

Append to the `display.test.ts` `describe('renderMenu')` block a new describe:

```typescript
describe('renderDelays', () => {
  const now = 1700000000

  it('shows No active alerts when alerts map is empty', () => {
    const out = renderDelays(new Map(), [], now)
    expect(out).toContain('No active alerts')
  })

  it('renders a service alert with route badge and header text', () => {
    const alerts: Map<string, RouteAlert[]> = new Map([
      ['R', [{ routeId: 'R', headerText: 'Minor delays systemwide', severity: 'WARNING' }]],
    ])
    const out = renderDelays(alerts, [], now)
    expect(out).toContain('[R]')
    expect(out).toContain('Minor delays systemwide')
  })

  it('shows delayed trains at stations above the 5-minute threshold', () => {
    const station: Station = {
      id: 'st1', name: 'DeKalb Av', stops: ['D24'], routes: ['B', 'Q'],
      lat: 40.6, lng: -73.97, north: 'Manhattan', south: 'Brighton Beach',
    }
    const arrivals: StationArrivals = {
      stationId: 'st1',
      north: [{ route: 'B', direction: 'N', stopId: 'D24N', arrivalTime: now + 120, terminal: 'Bay Ridge', delay: 420 }],
      south: [],
      fetchedAt: now,
    }
    const out = renderDelays(new Map(), [{ station, arrivals, isNearby: false }], now)
    expect(out).toContain('[B]')
    expect(out).toContain('DeKalb Av')
    expect(out).toContain('+7m late')
  })

  it('labels nearby stations with (nearby)', () => {
    const station: Station = {
      id: 'st2', name: 'Jackson Hts', stops: ['F12'], routes: ['F'],
      lat: 40.74, lng: -73.89, north: 'Manhattan', south: 'Jamaica',
    }
    const arrivals: StationArrivals = {
      stationId: 'st2',
      north: [{ route: 'F', direction: 'N', stopId: 'F12N', arrivalTime: now + 60, terminal: 'Jamaica', delay: 360 }],
      south: [],
      fetchedAt: now,
    }
    const out = renderDelays(new Map(), [{ station, arrivals, isNearby: true }], now)
    expect(out).toContain('(nearby)')
  })

  it('hides At your stations section when no train exceeds threshold', () => {
    const station: Station = {
      id: 'st3', name: 'Atlantic Av', stops: ['D24'], routes: ['R'],
      lat: 40.68, lng: -73.97, north: 'Manhattan', south: 'Bay Ridge',
    }
    const arrivals: StationArrivals = {
      stationId: 'st3',
      north: [{ route: 'R', direction: 'N', stopId: 'D24N', arrivalTime: now + 300, terminal: 'Whitehall', delay: 60 }],
      south: [],
      fetchedAt: now,
    }
    const out = renderDelays(new Map(), [{ station, arrivals, isNearby: false }], now)
    expect(out).not.toContain('At your stations')
  })

  it('footer says tap:refresh dbl:menu', () => {
    const out = renderDelays(new Map(), [], now)
    expect(out).toContain('tap:refresh')
    expect(out).toContain('dbl:menu')
  })
})
```

Also add these imports at the top of `display.test.ts` if not already present (check the file's existing imports):
```typescript
import type { RouteAlert } from '../data/alerts'
```

- [ ] **Step 6: Run tests to confirm they fail**

```bash
npm test -- display
```

Expected: FAIL — `renderDelays is not a function`.

- [ ] **Step 7: Implement renderDelays in display.ts**

Add after `renderMenu`:

```typescript
/**
 * Render the Delays view body.
 *
 * Top section: system-wide MTA service alerts (up to 4).
 * Bottom section: trains running ≥5 min late at the user's stations.
 * stationEntries: favorites + nearest non-favorite, each with cached arrivals
 * and an isNearby flag that controls the "(nearby)" label.
 */
export function renderDelays(
  alerts: Map<string, RouteAlert[]>,
  stationEntries: Array<{ station: Station; arrivals: StationArrivals; isNearby: boolean }>,
  now: number
): string {
  const lines: string[] = []
  lines.push('! DELAYS & ALERTS')
  lines.push('━'.repeat(DIVIDER_WIDTH))

  // ── Service alerts ──
  const allAlerts = Array.from(alerts.values()).flat().slice(0, 4)
  if (allAlerts.length === 0) {
    lines.push('  No active alerts')
  } else {
    for (const alert of allAlerts) {
      const badge = `[${alert.routeId}]`
      const maxFirst = CHARS_PER_LINE - badge.length - 1
      const header = alert.headerText
      if (header.length <= maxFirst) {
        lines.push(`${badge} ${header}`)
      } else {
        lines.push(`${badge} ${header.slice(0, maxFirst)}`)
        const rest = header.slice(maxFirst)
        const cont = rest.length > CHARS_PER_LINE - 4
          ? rest.slice(0, CHARS_PER_LINE - 5) + '.'
          : rest
        lines.push(`    ${cont}`)
      }
    }
  }

  // ── Per-station delays (≥5 min) ──
  const DELAY_THRESHOLD = 300 // seconds
  const delayed: Array<{ route: string; label: string; delayMins: number }> = []

  for (const { station, arrivals, isNearby } of stationEntries) {
    const allTrains = [...arrivals.north, ...arrivals.south]
    for (const train of allTrains) {
      if ((train.delay ?? 0) >= DELAY_THRESHOLD) {
        const stationLabel = isNearby ? `${station.name} (nearby)` : station.name
        delayed.push({
          route: train.route,
          label: stationLabel,
          delayMins: Math.round((train.delay ?? 0) / 60),
        })
      }
    }
  }

  if (delayed.length > 0) {
    lines.push('━'.repeat(DIVIDER_WIDTH))
    lines.push('  At your stations:')
    for (const d of delayed.slice(0, 6)) {
      const badge = `[${d.route}]`
      const text = `+${d.delayMins}m late`
      const nameMax = CHARS_PER_LINE - badge.length - text.length - 4
      const name = d.label.length > nameMax ? d.label.slice(0, nameMax - 1) + '.' : d.label
      lines.push(`${badge} ${name}  ${text}`)
    }
  }

  lines.push('━'.repeat(DIVIDER_WIDTH))
  const fetchStr = formatClockTime(new Date(now * 1000))
  lines.push(`${fetchStr}  tap:refresh  dbl:menu`)
  return lines.join('\n')
}
```

- [ ] **Step 8: Run tests to confirm they pass**

```bash
npm test -- display
```

Expected: all renderDelays tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/glasses/display.ts src/glasses/display.test.ts
git commit -m "feat: add renderMenu and renderDelays to display.ts"
```

---

## Task 3: Main.ts — Mode State Machine

**Files:**
- Modify: `src/main.ts`
- Modify: `src/main.test.ts`

**Interfaces:**
- Consumes: `renderMenu`, `renderDelays` from `./glasses/display`; `AppMode`, `AppSettings` from `./lib/types`; `getState`, `getCachedAlerts`, `getCachedArrivals` from `./glasses/stations`
- Produces: exported `resolveInitialMode(settings, nearbyEnabled): AppMode` and `resolveMenuCursor(defaultView, nearbyEnabled): number` for testing

### New module-level state and helpers

- [ ] **Step 1: Write failing tests for the two new pure helpers**

Add to `src/main.test.ts`:

```typescript
import { resolveInitialMode, resolveMenuCursor } from './main'

describe('resolveInitialMode', () => {
  it('returns menu when showLaunchMenu is true', () => {
    expect(resolveInitialMode({ showLaunchMenu: true, defaultView: 'favorites' })).toBe('menu')
  })
  it('returns stations for nearest/favorites defaultView when showLaunchMenu is false', () => {
    expect(resolveInitialMode({ showLaunchMenu: false, defaultView: 'nearest' })).toBe('stations')
    expect(resolveInitialMode({ showLaunchMenu: false, defaultView: 'favorites' })).toBe('stations')
  })
  it('returns delays when showLaunchMenu is false and defaultView is delays', () => {
    expect(resolveInitialMode({ showLaunchMenu: false, defaultView: 'delays' })).toBe('delays')
  })
})

describe('resolveMenuCursor', () => {
  it('maps defaultView to cursor index', () => {
    expect(resolveMenuCursor('nearest', true)).toBe(0)
    expect(resolveMenuCursor('favorites', true)).toBe(1)
    expect(resolveMenuCursor('delays', true)).toBe(2)
  })
  it('falls back to favorites (1) when defaultView is nearest but GPS is off', () => {
    expect(resolveMenuCursor('nearest', false)).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- main
```

Expected: FAIL — `resolveInitialMode is not a function`.

- [ ] **Step 3: Add the new exports and mode state to main.ts**

At the top of `main.ts`, update the display import to include the new renderers:

```typescript
import {
  renderHeader,
  renderBody,
  renderDepartureBoard,
  renderAlertSummary,
  renderLoading,
  renderNoStations,
  renderMenu,
  renderDelays,
} from './glasses/display'
```

Add `AppMode`, `AppSettings`, and `StationArrivals` to the types import:

```typescript
import type { Station, StationArrivals, AppMode, AppSettings } from './lib/types'
```

After the existing `let isRefreshing = false` line, add the new mode state:

```typescript
// ── App mode state ──
let appMode: AppMode = 'menu'
let menuCursor = 1          // 0=Nearest, 1=Favorites, 2=Delays
let nearbyEnabledCache = true  // cached for menu rendering without re-reading settings
```

Add the two pure helpers (exportable for tests) before `startGlassesMode`:

```typescript
/**
 * Determine the initial glasses mode from settings.
 * Pure function — no side effects, exported for testing.
 */
export function resolveInitialMode(
  settings: Pick<AppSettings, 'showLaunchMenu' | 'defaultView'>
): AppMode {
  if (settings.showLaunchMenu) return 'menu'
  return settings.defaultView === 'delays' ? 'delays' : 'stations'
}

/**
 * Map defaultView to a menu cursor index (0=Nearest,1=Favorites,2=Delays).
 * Falls back to Favorites when Nearest is requested but GPS is off.
 */
export function resolveMenuCursor(
  defaultView: 'nearest' | 'favorites' | 'delays',
  nearbyEnabled: boolean
): number {
  if (defaultView === 'nearest') return nearbyEnabled ? 0 : 1
  if (defaultView === 'delays') return 2
  return 1
}
```

- [ ] **Step 4: Run tests to confirm the helpers pass**

```bash
npm test -- main
```

Expected: `resolveInitialMode` and `resolveMenuCursor` tests PASS.

### Menu and Delays display functions in main.ts

- [ ] **Step 5: Add showMenu and showDelays display functions**

Add these helpers after `restoreNormalDisplay` (around line 300):

```typescript
async function showMenu(useRebuild: boolean): Promise<void> {
  appMode = 'menu'
  const body = renderMenu(menuCursor, nearbyEnabledCache)
  if (useRebuild) {
    await rebuildPage('SUBWAYLENS', body)
  } else {
    await updateHeader('SUBWAYLENS')
    await updateBody(body)
  }
}

async function showDelays(useRebuild: boolean): Promise<void> {
  appMode = 'delays'
  const now = Math.floor(Date.now() / 1000)
  const { stations, favoriteIds, arrivals } = getState()
  const alerts = getCachedAlerts()

  // Collect favorites + nearest non-favorite station (if GPS resolved)
  const nearestNonFav = stations.find(s => !favoriteIds.has(s.id)) ?? null
  const stationEntries: Array<{ station: Station; arrivals: StationArrivals; isNearby: boolean }> = []
  for (const s of stations.filter(s => favoriteIds.has(s.id))) {
    const a = arrivals.get(s.id)
    if (a) stationEntries.push({ station: s, arrivals: a, isNearby: false })
  }
  if (nearestNonFav) {
    const a = arrivals.get(nearestNonFav.id)
    if (a) stationEntries.push({ station: nearestNonFav, arrivals: a, isNearby: true })
  }

  const body = renderDelays(alerts, stationEntries, now)
  if (useRebuild) {
    await rebuildPage('! DELAYS', body)
  } else {
    await updateHeader('! DELAYS')
    await updateBody(body)
  }
}
```

### Update startGlassesMode to use the mode state machine

- [ ] **Step 6: Update startGlassesMode**

Replace the body of `startGlassesMode` with the version below. This is a complete replacement of the function — copy it in full:

```typescript
async function startGlassesMode(b: EvenAppBridge): Promise<void> {
  bridge = b
  initStorage(b)

  const settings = await getSettings()
  nearbyEnabledCache = settings.nearbyEnabled
  menuCursor = resolveMenuCursor(settings.defaultView, settings.nearbyEnabled)
  appMode = resolveInitialMode(settings)

  await loadStations()

  const station = currentStation()

  // ── Initial page ──
  if (appMode === 'menu') {
    await createInitialPage('SUBWAYLENS', renderMenu(menuCursor, nearbyEnabledCache))
  } else if (appMode === 'delays') {
    await createInitialPage('! DELAYS', renderLoading())
  } else {
    // stations mode
    if (station) {
      await createInitialPage(
        renderHeader(station, isFavorite(station.id)),
        renderLoading()
      )
    } else {
      await createInitialPage('SubwayLens', renderNoStations())
    }
  }

  // ── Warm cache ──
  if (station) {
    const seq = ++displaySeq
    await Promise.all([prefetchAllStations(), refreshAlerts()])
    if (displaySeq === seq) {
      if (appMode === 'stations') {
        const { stations, currentIndex } = getState()
        const alerts = getCachedAlerts()
        const cached = getCachedArrivals(station.id)
        if (cached) {
          const filtered = applyRouteFilter(cached, station.id)
          const bodyText = station.system
            ? renderDepartureBoard(station, filtered)
            : renderBody(station, filtered, currentIndex, stations.length, alerts)
          lastBodyText = bodyText
          await updateBody(bodyText)
        }
      } else if (appMode === 'delays') {
        await showDelays(false)
      }
    }
  }

  if (deviceStatusUnsub) deviceStatusUnsub()
  deviceStatusUnsub = b.onDeviceStatusChanged((status) => {
    lastDeviceStatus = status
  })

  if (inputUnsub) inputUnsub()
  inputUnsub = setupInput(b, {

    onScrollDown: async () => {
      if (appMode === 'menu') {
        menuCursor = (menuCursor + 1) % 3
        await updateBody(renderMenu(menuCursor, nearbyEnabledCache))
      } else if (appMode === 'stations') {
        nextStation()
        await displayCurrentStation(true)
      }
      // delays mode: no scroll action (single-page view)
    },

    onScrollUp: async () => {
      if (appMode === 'menu') {
        menuCursor = (menuCursor - 1 + 3) % 3
        await updateBody(renderMenu(menuCursor, nearbyEnabledCache))
      } else if (appMode === 'stations') {
        prevStation()
        await displayCurrentStation(true)
      }
    },

    onTap: async () => {
      if (appMode === 'menu') {
        // Skip if nearest is selected but GPS is off
        if (menuCursor === 0 && !nearbyEnabledCache) return
        if (menuCursor === 2) {
          await showDelays(true)
        } else {
          appMode = 'stations'
          await displayCurrentStation(true)
        }
        await startAutoRefresh()
      } else if (appMode === 'delays') {
        await Promise.all([prefetchAllStations(), refreshAlerts()])
        await showDelays(false)
      } else {
        // stations mode — existing tap logic
        const station = currentStation()
        const cachedArrivals = station ? getCachedArrivals(station.id) : null
        const alerts = getCachedAlerts()
        const routeIds = cachedArrivals
          ? [...cachedArrivals.north.map(t => t.route), ...cachedArrivals.south.map(t => t.route)]
          : []
        const hasAlerts = shouldShowAlertToggle(station, routeIds, alerts)
        if (hasAlerts && cachedArrivals) {
          isAlertView = !isAlertView
          if (isAlertView) {
            await updateBody(renderAlertSummary(cachedArrivals, alerts))
          } else {
            await updateBody(lastBodyText)
          }
        } else {
          isAlertView = false
          await refreshInPlace()
        }
      }
    },

    onDoubleTap: async () => {
      if (appMode === 'menu') {
        stopAutoRefresh()
        await b.shutDownPageContainer(1)
      } else {
        // Return to menu from any non-menu view
        stopAutoRefresh()
        isAlertView = false
        await showMenu(true)
      }
    },

    onForegroundEnter: () => {
      isAlertView = false
      getSettings().then((s) => {
        nearbyEnabledCache = s.nearbyEnabled
        menuCursor = resolveMenuCursor(s.defaultView, s.nearbyEnabled)
        appMode = resolveInitialMode(s)
        loadStations().then(() => {
          Promise.all([prefetchAllStations(), refreshAlerts()]).then(() => {
            if (appMode === 'menu') {
              showMenu(true)
            } else if (appMode === 'delays') {
              showDelays(true)
            } else {
              displayCurrentStation(true)
            }
          })
        })
        startAutoRefresh()
      })
    },

    onForegroundExit: handleBackground,
    onAbnormalExit: handleBackground,
  })

  await startAutoRefresh()

  window.addEventListener('subwaylens:sync', () => {
    loadStations().then(() => {
      if (appMode === 'stations') displayCurrentStation(true)
    })
  })

  window.addEventListener('subwaylens:stations-updated', () => {
    if (appMode !== 'stations') return
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
}
```

- [ ] **Step 7: Run all tests**

```bash
npm test
```

Expected: all existing tests pass; the two new `main.test.ts` helper tests pass. If any previously-passing test breaks, fix it before committing.

- [ ] **Step 8: Commit**

```bash
git add src/main.ts src/main.test.ts
git commit -m "feat: add AppMode state machine and launch menu/delays flows to main.ts"
```

---

## Task 4: Phone Settings — Launch Behavior Section

**Files:**
- Modify: `src/settings/SettingsPanel.tsx`

**Interfaces:**
- Consumes: `AppSettings.showLaunchMenu`, `AppSettings.defaultView` (from Task 1)

- [ ] **Step 1: Add the Launch Behavior section to SettingsPanel.tsx**

Replace the entire `SettingsPanel.tsx` with:

```typescript
/**
 * Settings panel — refresh interval, nearby stations toggle, nearby radius,
 * launch behavior (menu toggle + default view).
 * Uses even-toolkit SegmentedControl for multi-option pickers
 * and Toggle for the on/off switch.
 */

import { SegmentedControl, Toggle, SettingsGroup } from 'even-toolkit/web'
import type { AppSettings } from '../lib/types'

interface SettingsPanelProps {
  settings: AppSettings
  onChange: (settings: AppSettings) => void
}

const REFRESH_OPTIONS = [
  { value: '15', label: '15s' },
  { value: '30', label: '30s' },
  { value: '60', label: '60s' },
  { value: '120', label: '2m' },
]

const RADIUS_OPTIONS = [
  { value: '0.1', label: '0.1 mi' },
  { value: '0.25', label: '0.25 mi' },
  { value: '0.5', label: '0.5 mi' },
  { value: '1', label: '1.0 mi' },
]

const DEFAULT_VIEW_OPTIONS = [
  { value: 'nearest', label: 'Nearest' },
  { value: 'favorites', label: 'Favorites' },
  { value: 'delays', label: 'Delays' },
]

export function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
  const nearestDisabled = !settings.nearbyEnabled

  return (
    <div className="flex flex-col gap-3">
      {/* Refresh Interval */}
      <SettingsGroup label="Refresh interval">
        <div className="bg-surface p-4 rounded-[6px]">
          <SegmentedControl
            options={REFRESH_OPTIONS}
            value={String(settings.refreshInterval)}
            onValueChange={(val) =>
              onChange({ ...settings, refreshInterval: Number(val) })
            }
            size="small"
            className="w-full"
          />
        </div>
      </SettingsGroup>

      {/* Nearby Stations */}
      <SettingsGroup label="Nearby stations">
        <div className="bg-surface p-4 rounded-[6px] flex items-center justify-between">
          <span className="text-[15px] tracking-[-0.15px] text-text">
            Show nearby stations
          </span>
          <Toggle
            checked={settings.nearbyEnabled}
            onChange={(checked) =>
              onChange({ ...settings, nearbyEnabled: checked })
            }
          />
        </div>
      </SettingsGroup>

      {/* Nearby Radius (hidden when nearby is off) */}
      {settings.nearbyEnabled && (
        <SettingsGroup label="Nearby radius">
          <div className="bg-surface p-4 rounded-[6px]">
            <SegmentedControl
              options={RADIUS_OPTIONS}
              value={String(settings.nearbyRadius)}
              onValueChange={(val) =>
                onChange({ ...settings, nearbyRadius: Number(val) })
              }
              size="small"
              className="w-full"
            />
          </div>
        </SettingsGroup>
      )}

      {/* Launch Behavior */}
      <SettingsGroup label="Launch behavior">
        <div className="flex flex-col rounded-[6px] overflow-hidden">
          {/* Menu toggle */}
          <div className="bg-surface p-4 flex items-center justify-between border-b border-border">
            <div className="flex flex-col gap-0.5 pr-4">
              <span className="text-[15px] tracking-[-0.15px] text-text">
                Show launch menu
              </span>
              <span className="text-[12px] text-text-dim">
                Choose your starting view each time you open SubwayLens
              </span>
            </div>
            <Toggle
              checked={settings.showLaunchMenu}
              onChange={(checked) =>
                onChange({ ...settings, showLaunchMenu: checked })
              }
            />
          </div>

          {/* Default view picker — always visible */}
          <div className="bg-surface p-4 flex flex-col gap-2">
            <span className="text-[13px] text-text-dim">
              {settings.showLaunchMenu
                ? 'Menu opens with this view pre-selected'
                : 'Opens directly to this view'}
            </span>
            <SegmentedControl
              options={DEFAULT_VIEW_OPTIONS.map((opt) => ({
                ...opt,
                disabled: opt.value === 'nearest' && nearestDisabled,
              }))}
              value={
                settings.defaultView === 'nearest' && nearestDisabled
                  ? 'favorites'
                  : settings.defaultView
              }
              onValueChange={(val) =>
                onChange({
                  ...settings,
                  defaultView: val as AppSettings['defaultView'],
                })
              }
              size="small"
              className="w-full"
            />
            {nearestDisabled && (
              <span className="text-[11px] text-text-dim">
                Enable nearby stations above to use Nearest
              </span>
            )}
          </div>
        </div>
      </SettingsGroup>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/settings/SettingsPanel.tsx
git commit -m "feat: add Launch Behavior settings section (menu toggle + default view)"
```

---

## Task 5: Install, Full Test Suite, Build, Presubmission, Push

- [ ] **Step 1: Install dependencies**

```bash
npm install
```

Expected: `node_modules` populated, no peer-dep errors.

- [ ] **Step 2: Run full test suite**

```bash
npm test
```

Expected: all tests PASS. Fix any failures before proceeding.

- [ ] **Step 3: TypeScript clean compile**

```bash
npx tsc --noEmit
```

Expected: no output (clean).

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: `dist/` populated, no build errors.

- [ ] **Step 5: Validate app.json**

```bash
node -e "const a = require('./app.json'); console.log('version:', a.version, '| package_id:', a.package_id)"
```

Expected output:
```
version: 2.0.0 | package_id: com.subwaylens.app
```

- [ ] **Step 6: Pack into .ehpk**

```bash
npx evenhub pack app.json dist -o subwaylens.ehpk
```

Expected: `subwaylens.ehpk` created in the project root, no errors.

- [ ] **Step 7: Set up git branch and stage all changes**

```bash
git checkout -b v2.0.x
git add src/lib/types.ts src/glasses/display.ts src/glasses/display.test.ts src/main.ts src/main.test.ts src/settings/SettingsPanel.tsx src/settings/RouteBadge.tsx src/settings/RouteFilter.tsx src/settings/FavoritesList.tsx src/settings/StationSearch.tsx src/settings/NearbyStations.tsx src/glasses/stations.ts app.json package.json
```

- [ ] **Step 8: Commit the full v2.0.0 release**

```bash
git commit -m "$(cat <<'EOF'
feat: SubwayLens v2.0.0

- Launch menu (Nearest Station / Favorites / Delays) on app open
- Delays view: system-wide MTA alerts + 5+ min delays at your stations
- Nearest station always first in cycling order when GPS resolves (arrivals prefetched immediately)
- LIRR/MNR route badges replaced with LIRR/MNR system badge in phone UI
- Phone settings: show launch menu toggle + default view selector
EOF
)"
```

- [ ] **Step 9: Push to GitHub**

```bash
git push https://GITHUB_PAT@github.com/laolao91/subwaylens.git v2.0.x
```

Replace `GITHUB_PAT` with the token provided in the conversation. Do NOT write the token to any file.

Expected: branch `v2.0.x` appears at `https://github.com/laolao91/subwaylens`.
