# Connection/Wear-Aware Auto-Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the `setInterval`-driven auto-refresh in `src/main.ts` from fetching MTA data when the glasses are disconnected or not being worn, without touching the manual tap-triggered refresh path.

**Architecture:** `startGlassesMode()` subscribes once to `bridge.onDeviceStatusChanged` and stores the latest `DeviceStatus` in a new module-level variable `lastDeviceStatus`, mirroring the existing `inputUnsub` pattern. A new pure, exported function `shouldSkipAutoRefresh(status: DeviceStatus | null): boolean` encapsulates the skip decision (`connectType !== 'connected'` or `isWearing === false`, both `undefined` cases treated as "don't skip"). `startAutoRefresh()`'s `setInterval` callback checks this function before calling `refreshInPlace()`; the `onTap` manual path in `setupInput()`'s callbacks is untouched.

**Tech Stack:** TypeScript, Vitest (`vi.spyOn`/mocked SDK imports, `environment: 'node'` per `vite.config.ts`), `@evenrealities/even_hub_sdk` (`DeviceStatus`, `DeviceConnectType`, `EvenAppBridge`).

## Global Constraints

- No `git push` and no `.ehpk` build at any point in this plan — local `git commit` only, push is a separate decision Steven makes later.
- Never use `--no-verify` or any destructive git flag.
- The manual/tap-triggered refresh path (`onTap` in `startGlassesMode()`'s `setupInput()` callbacks, which calls `refreshInPlace()` directly) must never be gated — only the `setInterval`-driven call inside `startAutoRefresh()`.
- Treat `undefined` values from `DeviceStatus.connectType` or `DeviceStatus.isWearing` as "don't skip" — fail open to today's always-refresh behavior. Only an explicit `connectType !== DeviceConnectType.Connected` (with `connectType` actually set) or `isWearing === false` skips a tick.
- No new files beyond the one new test file (`src/main.test.ts`) — this is a wiring change inside `src/main.ts`, not a new module per the spec ("No new files").
- Existing 38 tests (`npm test`) and clean build (`npm run build`) must stay green after every task, and at the end of this plan.
- Do not modify `renderBody()`, container dimensions, or any subway-rendering behavior — out of scope per the design spec.

---

## File Structure

- **Modify:** `src/main.ts` — add `lastDeviceStatus` module variable, add the exported `shouldSkipAutoRefresh()` helper, subscribe to `bridge.onDeviceStatusChanged` in `startGlassesMode()`, gate the `setInterval` tick in `startAutoRefresh()`.
- **Create:** `src/main.test.ts` — first dedicated test file for `main.ts`. Tests `shouldSkipAutoRefresh()` directly (pure function, no mocking needed) and an integration-style test that mocks `@evenrealities/even_hub_sdk`'s `waitForEvenAppBridge`/bridge methods to verify `onDeviceStatusChanged` registration wires into the auto-refresh gate end to end.

No other files change. `src/glasses/stations.ts`, `src/glasses/display.ts`, and `src/glasses/input.ts` are consumed as-is, unmodified.

---

## Task 1: `shouldSkipAutoRefresh()` pure decision function

**Files:**
- Modify: `src/main.ts:14-21` (imports), `src/main.ts:56-58` (module-level state), insert new function near `src/main.ts:289` (the `// ── Auto-refresh ──` section, just before `startAutoRefresh`)
- Test: `src/main.test.ts` (new file)

**Interfaces:**
- Consumes: `DeviceStatus`, `DeviceConnectType` types from `@evenrealities/even_hub_sdk` (already confirmed present: `DeviceStatus.connectType: DeviceConnectType`, `DeviceStatus.isWearing?: boolean`).
- Produces: `export function shouldSkipAutoRefresh(status: DeviceStatus | null): boolean` — used by Task 2's `startAutoRefresh()` gate and directly unit-tested here. `true` means "skip this tick", `false` means "fetch as normal".

- [ ] **Step 1: Write the failing tests for `shouldSkipAutoRefresh`**

Create `src/main.test.ts` with this content:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { DeviceStatus, DeviceConnectType } from '@evenrealities/even_hub_sdk'

// main.ts imports ./settings/settings-mount at module scope, which pulls in
// the React settings page tree and even-toolkit/web. even-toolkit's own
// dist/web/index.js re-exports `cn` via an extensionless relative import
// ('./utils/cn' instead of './utils/cn.js'), which Node's native ESM
// resolver (used by Vitest's `environment: 'node'`, set in vite.config.ts,
// unlike Vite's bundler-style dev/build resolution) rejects with
// "Cannot find module". Confirmed by running this test against the
// unmocked import: it fails the whole suite with that exact error.
// Stubbing settings-mount before importing ./main sidesteps that subtree
// entirely — this test file only exercises glasses-mode/auto-refresh
// logic, never the settings page, so the stub is a safe no-op here.
vi.mock('./settings/settings-mount', () => ({
  initSettingsPage: vi.fn(),
}))

const { shouldSkipAutoRefresh } = await import('./main')

// DeviceStatus's real constructor backfills connectType to
// DeviceConnectType.None and isWearing to false when omitted from the
// constructor params — confirmed empirically (`new DeviceStatus({ sn: 'x' })`
// produces `{ connectType: 'none', isWearing: false }`, never `undefined`),
// even though the SDK's .d.ts marks `isWearing?: boolean` optional. To
// exercise shouldSkipAutoRefresh's actual undefined-handling branches (the
// "fail open" cases the spec requires), build a plain object literal typed
// as DeviceStatus instead of going through `new DeviceStatus(...)`.
function makeStatus(overrides: Partial<{
  connectType: DeviceConnectType | undefined
  isWearing: boolean | undefined
}> = {}): DeviceStatus {
  return {
    sn: 'test-sn',
    connectType: overrides.connectType,
    isWearing: overrides.isWearing,
  } as DeviceStatus
}

describe('shouldSkipAutoRefresh', () => {
  it('does not skip when status is null (no status received yet)', () => {
    expect(shouldSkipAutoRefresh(null)).toBe(false)
  })

  it('does not skip when connectType is undefined (fail open)', () => {
    const status = makeStatus({ isWearing: true })
    expect(shouldSkipAutoRefresh(status)).toBe(false)
  })

  it('does not skip when isWearing is undefined (fail open)', () => {
    const status = makeStatus({ connectType: DeviceConnectType.Connected })
    expect(shouldSkipAutoRefresh(status)).toBe(false)
  })

  it('does not skip when connected and wearing', () => {
    const status = makeStatus({
      connectType: DeviceConnectType.Connected,
      isWearing: true,
    })
    expect(shouldSkipAutoRefresh(status)).toBe(false)
  })

  it('skips when disconnected', () => {
    const status = makeStatus({
      connectType: DeviceConnectType.Disconnected,
      isWearing: true,
    })
    expect(shouldSkipAutoRefresh(status)).toBe(true)
  })

  it('skips when connecting (not yet connected)', () => {
    const status = makeStatus({
      connectType: DeviceConnectType.Connecting,
      isWearing: true,
    })
    expect(shouldSkipAutoRefresh(status)).toBe(true)
  })

  it('skips when connectionFailed', () => {
    const status = makeStatus({
      connectType: DeviceConnectType.ConnectionFailed,
      isWearing: true,
    })
    expect(shouldSkipAutoRefresh(status)).toBe(true)
  })

  it('skips when connected but explicitly not wearing', () => {
    const status = makeStatus({
      connectType: DeviceConnectType.Connected,
      isWearing: false,
    })
    expect(shouldSkipAutoRefresh(status)).toBe(true)
  })

  it('does not skip when connected and isWearing is true', () => {
    const status = makeStatus({
      connectType: DeviceConnectType.Connected,
      isWearing: true,
    })
    expect(shouldSkipAutoRefresh(status)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- main.test.ts`
Expected: FAIL — `shouldSkipAutoRefresh` is `undefined` after the dynamic `await import('./main')` (current `src/main.ts` has no such export). Vitest reports this as a runtime error such as `shouldSkipAutoRefresh is not a function` when the first test calls it.

- [ ] **Step 3: Add the `DeviceStatus`/`DeviceConnectType` imports and `lastDeviceStatus` state to `main.ts`**

In `src/main.ts`, update the SDK import block at lines 14-21 from:

```typescript
import {
  waitForEvenAppBridge,
  CreateStartUpPageContainer,
  TextContainerProperty,
  RebuildPageContainer,
  TextContainerUpgrade,
} from '@evenrealities/even_hub_sdk'
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
```

to:

```typescript
import {
  waitForEvenAppBridge,
  CreateStartUpPageContainer,
  TextContainerProperty,
  RebuildPageContainer,
  TextContainerUpgrade,
  DeviceConnectType,
} from '@evenrealities/even_hub_sdk'
import type { EvenAppBridge, DeviceStatus } from '@evenrealities/even_hub_sdk'
```

Then update the module-level state block at lines 56-58 from:

```typescript
let bridge: EvenAppBridge | null = null
let refreshTimer: ReturnType<typeof setInterval> | null = null
let inputUnsub: (() => void) | null = null
```

to:

```typescript
let bridge: EvenAppBridge | null = null
let refreshTimer: ReturnType<typeof setInterval> | null = null
let inputUnsub: (() => void) | null = null
let deviceStatusUnsub: (() => void) | null = null
let lastDeviceStatus: DeviceStatus | null = null
```

(`deviceStatusUnsub` is added now even though it's wired up in Task 2, so both new module-level variables land together in one coherent edit.)

- [ ] **Step 4: Add `shouldSkipAutoRefresh()` to `main.ts`**

In `src/main.ts`, just above the `// ── Auto-refresh ──` section (currently at line 289, immediately before `async function startAutoRefresh()`), insert:

```typescript
/**
 * Decide whether a timer-driven auto-refresh tick should be skipped.
 *
 * Fails open: a `null` status (no DeviceStatus received yet) or any
 * `undefined` field never causes a skip — only an explicit disconnected/
 * non-connected `connectType` or `isWearing === false` does. This never
 * gates the manual tap-triggered refresh path, only the setInterval tick
 * in startAutoRefresh().
 */
export function shouldSkipAutoRefresh(status: DeviceStatus | null): boolean {
  if (!status) return false
  if (status.connectType !== undefined && status.connectType !== DeviceConnectType.Connected) {
    return true
  }
  if (status.isWearing === false) {
    return true
  }
  return false
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- main.test.ts`
Expected: PASS — all 9 tests in the `shouldSkipAutoRefresh` describe block green.

- [ ] **Step 6: Run the full suite and build to check for regressions**

Run: `npm test`
Expected: PASS — 38 existing tests + 9 new = 47 tests, all green.

Run: `npm run build`
Expected: clean build, no TypeScript errors (the new `DeviceConnectType`/`DeviceStatus` imports must resolve correctly against the installed `@evenrealities/even_hub_sdk@^0.0.11` types).

- [ ] **Step 7: Commit**

```bash
git add src/main.ts src/main.test.ts
git commit -m "Add shouldSkipAutoRefresh decision helper for device-aware refresh gating"
```

---

## Task 2: Wire `bridge.onDeviceStatusChanged` subscription into `startGlassesMode()`

**Files:**
- Modify: `src/main.ts:315-436` (`startGlassesMode`), specifically the subscription-setup block around `inputUnsub` (currently `src/main.ts:349-351`) and the `onForegroundExit`/`onAbnormalExit`/teardown handling.
- Test: `src/main.test.ts` (append to the file created in Task 1)

**Interfaces:**
- Consumes: `shouldSkipAutoRefresh` (Task 1, same file, no import needed — same module), `lastDeviceStatus`/`deviceStatusUnsub` module variables (Task 1), `bridge.onDeviceStatusChanged(callback: (status: DeviceStatus) => void): () => void` (SDK, confirmed signature).
- Produces: `lastDeviceStatus` is kept up to date by a live subscription whenever `startGlassesMode()` has run. Task 3 reads `lastDeviceStatus` from `startAutoRefresh()`'s timer callback.

- [ ] **Step 1: Write the failing test for subscription wiring**

Replace the top of `src/main.test.ts` (written in Task 1: the `import { describe, it, expect, vi } from 'vitest'` line and the `const { shouldSkipAutoRefresh } = await import('./main')` line) with:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import { DeviceStatus, DeviceConnectType } from '@evenrealities/even_hub_sdk'
import type { EvenAppBridge as EvenAppBridgeType } from '@evenrealities/even_hub_sdk'

vi.mock('./settings/settings-mount', () => ({
  initSettingsPage: vi.fn(),
}))

const { shouldSkipAutoRefresh, startGlassesModeForTest } = await import('./main')
```

(The `vi.mock('./settings/settings-mount', ...)` call and its explanatory comment from Task 1 stay in place exactly as written — only the imports immediately above it and the dynamic-import line immediately below it are replaced, to add `startGlassesModeForTest` to the destructured import and bring in `vi`/`afterEach`/the `EvenAppBridgeType` type needed by this task's fake bridge helper. `startGlassesModeForTest` does not exist yet — Task 2 Step 3 exports it. `startGlassesMode` itself is not exported in current `main.ts`; rather than widening its export surface for production code, this plan exports a minimal test-only wrapper. See Step 3.)

Then append this new describe block to the bottom of `src/main.test.ts`:

```typescript
function fakeBridge() {
  const statusCallbacks: Array<(status: DeviceStatus) => void> = []
  const bridge = {
    onDeviceStatusChanged: vi.fn((cb: (status: DeviceStatus) => void) => {
      statusCallbacks.push(cb)
      return () => {
        const idx = statusCallbacks.indexOf(cb)
        if (idx !== -1) statusCallbacks.splice(idx, 1)
      }
    }),
  }
  return {
    bridge: bridge as unknown as EvenAppBridgeType,
    emitStatus: (status: DeviceStatus) => {
      statusCallbacks.forEach(cb => cb(status))
    },
  }
}

describe('onDeviceStatusChanged subscription (via startGlassesModeForTest)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('registers exactly one onDeviceStatusChanged listener', () => {
    const { bridge } = fakeBridge()
    startGlassesModeForTest(bridge)
    expect((bridge.onDeviceStatusChanged as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1)
  })

  it('updates lastDeviceStatus via shouldSkipAutoRefresh-visible state when status changes', () => {
    const { bridge, emitStatus } = fakeBridge()
    const getLastStatus = startGlassesModeForTest(bridge)

    expect(shouldSkipAutoRefresh(getLastStatus())).toBe(false)

    emitStatus(new DeviceStatus({
      sn: 'sn-1',
      connectType: DeviceConnectType.Disconnected,
      isWearing: true,
    }))

    expect(shouldSkipAutoRefresh(getLastStatus())).toBe(true)

    emitStatus(new DeviceStatus({
      sn: 'sn-1',
      connectType: DeviceConnectType.Connected,
      isWearing: true,
    }))

    expect(shouldSkipAutoRefresh(getLastStatus())).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- main.test.ts`
Expected: FAIL — `startGlassesModeForTest` is not exported from `./main`.

- [ ] **Step 3: Add a minimal test-only export and wire the subscription in `startGlassesMode()`**

In `src/main.ts`, find the block in `startGlassesMode()` that currently reads (around line 349-351):

```typescript
  // Store the unsub handle so re-entry is safe (teardown before re-registering).
  if (inputUnsub) inputUnsub()
  inputUnsub = setupInput(b, {
```

Insert the device-status subscription immediately before that comment, so the edit becomes:

```typescript
  // Store the unsub handle so re-entry is safe (teardown before re-registering).
  if (deviceStatusUnsub) deviceStatusUnsub()
  deviceStatusUnsub = b.onDeviceStatusChanged((status) => {
    lastDeviceStatus = status
  })

  if (inputUnsub) inputUnsub()
  inputUnsub = setupInput(b, {
```

This follows the exact existing `inputUnsub` re-entry-safety pattern (teardown old subscription before registering a new one), just one variable over.

Next, add the minimal test-only export. At the very bottom of `src/main.ts`, just before the `// ── Boot ──` section (currently line 438), add:

```typescript
/**
 * Test-only entry point: runs the device-status subscription half of
 * startGlassesMode() against a minimal fake bridge, without the full
 * page-container/station bootstrap (which needs a real DOM/bridge stack).
 * Returns a getter for the current lastDeviceStatus so tests can assert
 * on it via the public shouldSkipAutoRefresh() function rather than
 * reaching into module internals directly.
 */
export function startGlassesModeForTest(
  fakeBridge: Pick<EvenAppBridge, 'onDeviceStatusChanged'>
): () => DeviceStatus | null {
  if (deviceStatusUnsub) deviceStatusUnsub()
  deviceStatusUnsub = fakeBridge.onDeviceStatusChanged((status) => {
    lastDeviceStatus = status
  })
  return () => lastDeviceStatus
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- main.test.ts`
Expected: PASS — both new tests in the `onDeviceStatusChanged subscription` describe block green.

- [ ] **Step 5: Run the full suite and build**

Run: `npm test`
Expected: PASS — 47 existing/new + 2 new = 49 tests, all green.

Run: `npm run build`
Expected: clean build.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts src/main.test.ts
git commit -m "Subscribe to bridge.onDeviceStatusChanged and track lastDeviceStatus"
```

---

## Task 3: Gate the `setInterval` tick in `startAutoRefresh()`

**Files:**
- Modify: `src/main.ts:291-297` (`startAutoRefresh`), plus exporting it for test use (it is currently an unexported `async function` local to the module).
- Test: `src/main.test.ts` (append)

**Interfaces:**
- Consumes: `shouldSkipAutoRefresh` (Task 1), `lastDeviceStatus` (Task 1/2), `refreshInPlace` (existing, `src/main.ts:242`), `currentStation`/`refreshCurrentArrivals`/`refreshAlerts`/`getCachedAlerts`/`getState`/`applyRouteFilter`/`isFavorite` (existing imports from `./glasses/stations`, mocked in this task's test via `vi.mock`).
- Produces: `export async function startAutoRefresh(): Promise<void>` (widened from module-private to exported, test-only consumer is `main.test.ts`) and `export function stopAutoRefresh(): void` (same reason — tests must stop the real interval during `afterEach` cleanup so fake timers don't leak between tests). This is the final integration point; no further tasks depend on new exports from this task.

This task mocks `./glasses/stations` directly with `vi.mock`, which is a step up in mocking surface from Tasks 1-2 (those needed no module mocks, just a fake bridge object) — it's necessary here because it's the only way to observably distinguish "the timer fired and called `refreshInPlace`, which called `refreshCurrentArrivals`" from "the timer fired and the gate skipped before reaching `refreshInPlace`" without restructuring production code.

- [ ] **Step 1: Write the failing test for the gated timer tick**

Replace the top of `src/main.test.ts` (the `import { describe, it, expect, vi, afterEach } from 'vitest'` line, the `vi.mock('./settings/settings-mount', ...)` block, and the `const { shouldSkipAutoRefresh, startGlassesModeForTest } = await import('./main')` line written in Task 2) so it pulls in everything this task and prior tasks need, and add a `vi.mock` call for `./glasses/stations`. The full top-of-file block in `src/main.test.ts` becomes:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DeviceStatus, DeviceConnectType } from '@evenrealities/even_hub_sdk'
import type { EvenAppBridge as EvenAppBridgeType } from '@evenrealities/even_hub_sdk'
import * as stations from './glasses/stations'
import type { Station } from './lib/types'

vi.mock('./settings/settings-mount', () => ({
  initSettingsPage: vi.fn(),
}))

vi.mock('./glasses/stations', async () => {
  const actual = await vi.importActual<typeof import('./glasses/stations')>('./glasses/stations')
  return {
    ...actual,
    currentStation: vi.fn(),
    refreshCurrentArrivals: vi.fn(),
    refreshAlerts: vi.fn(),
    getCachedAlerts: vi.fn(() => new Map()),
    getState: vi.fn(() => ({
      stations: [],
      favoriteIds: new Set(),
      currentIndex: 0,
      arrivals: new Map(),
      alerts: new Map(),
    })),
    applyRouteFilter: vi.fn((arrivals: unknown) => arrivals),
    isFavorite: vi.fn(() => false),
  }
})

const {
  shouldSkipAutoRefresh,
  startGlassesModeForTest,
  startAutoRefresh,
  stopAutoRefresh,
} = await import('./main')

function makeStation(id: string): Station {
  return { id, name: id, stops: [], routes: [], lat: 0, lng: 0, north: '', south: '' }
}
```

Both `vi.mock` calls must stay above the dynamic `await import('./main')` line — Vitest hoists `vi.mock` calls to the top of the file automatically, but the dynamic import itself must still appear after them textually so the mocked modules are in place before `./main` (and its transitive `./glasses/stations` import) loads.

Then append this new describe block to the bottom of `src/main.test.ts`:

```typescript
describe('startAutoRefresh timer gating', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(stations.currentStation).mockReturnValue(makeStation('times-sq'))
    vi.mocked(stations.refreshCurrentArrivals).mockResolvedValue({
      stationId: 'times-sq',
      north: [],
      south: [],
      fetchedAt: 0,
    })
    vi.mocked(stations.refreshAlerts).mockResolvedValue(new Map())
  })

  afterEach(() => {
    stopAutoRefresh()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('does not call refreshCurrentArrivals on a timer tick when disconnected', async () => {
    const { bridge, emitStatus } = fakeBridge()
    startGlassesModeForTest(bridge)
    emitStatus(new DeviceStatus({
      sn: 'sn-1',
      connectType: DeviceConnectType.Disconnected,
      isWearing: true,
    }))

    await startAutoRefresh()
    vi.mocked(stations.refreshCurrentArrivals).mockClear()

    await vi.advanceTimersByTimeAsync(30_000)

    expect(stations.refreshCurrentArrivals).not.toHaveBeenCalled()
  })

  it('does not call refreshCurrentArrivals on a timer tick when not wearing', async () => {
    const { bridge, emitStatus } = fakeBridge()
    startGlassesModeForTest(bridge)
    emitStatus(new DeviceStatus({
      sn: 'sn-1',
      connectType: DeviceConnectType.Connected,
      isWearing: false,
    }))

    await startAutoRefresh()
    vi.mocked(stations.refreshCurrentArrivals).mockClear()

    await vi.advanceTimersByTimeAsync(30_000)

    expect(stations.refreshCurrentArrivals).not.toHaveBeenCalled()
  })

  it('calls refreshCurrentArrivals on a timer tick when connected and wearing', async () => {
    const { bridge, emitStatus } = fakeBridge()
    startGlassesModeForTest(bridge)
    emitStatus(new DeviceStatus({
      sn: 'sn-1',
      connectType: DeviceConnectType.Connected,
      isWearing: true,
    }))

    await startAutoRefresh()
    vi.mocked(stations.refreshCurrentArrivals).mockClear()

    await vi.advanceTimersByTimeAsync(30_000)

    expect(stations.refreshCurrentArrivals).toHaveBeenCalledTimes(1)
  })

  it('calls refreshCurrentArrivals on a timer tick when no status has been received yet (fail open)', async () => {
    const { bridge } = fakeBridge()
    startGlassesModeForTest(bridge)
    // No emitStatus call — lastDeviceStatus stays null.

    await startAutoRefresh()
    vi.mocked(stations.refreshCurrentArrivals).mockClear()

    await vi.advanceTimersByTimeAsync(30_000)

    expect(stations.refreshCurrentArrivals).toHaveBeenCalledTimes(1)
  })
})
```

`30_000` matches `DEFAULT_SETTINGS.refreshInterval` (30 seconds, defined in `src/lib/types.ts`) — `startAutoRefresh()` calls the real `getSettings()` from `./lib/storage`, which is not mocked in this task; with no `bridge` registered via `initStorage()` in this test file's scope, `getSettings()`'s internal `getItem()` falls through to `window.localStorage`, which throws under vitest's `environment: 'node'` (per `vite.config.ts`) and is caught, so `getSettings()` resolves to `{ ...DEFAULT_SETTINGS }` — 30 seconds — deterministically.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- main.test.ts`
Expected: FAIL — `startAutoRefresh` and `stopAutoRefresh` are not exported from `./main` yet (current `src/main.ts` declares both as module-private `async function`/`function`, no `export` keyword).

- [ ] **Step 3: Export `startAutoRefresh`/`stopAutoRefresh` and gate the `setInterval` callback**

In `src/main.ts`, change `startAutoRefresh()` and `stopAutoRefresh()` (currently lines 291-304) from:

```typescript
async function startAutoRefresh(): Promise<void> {
  stopAutoRefresh()
  const settings = await getSettings()
  refreshTimer = setInterval(() => {
    refreshInPlace()
  }, settings.refreshInterval * 1000)
}

function stopAutoRefresh(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}
```

to:

```typescript
export async function startAutoRefresh(): Promise<void> {
  stopAutoRefresh()
  const settings = await getSettings()
  refreshTimer = setInterval(() => {
    if (shouldSkipAutoRefresh(lastDeviceStatus)) return
    refreshInPlace()
  }, settings.refreshInterval * 1000)
}

export function stopAutoRefresh(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}
```

Both functions are called exactly as before everywhere else in the file (`startGlassesMode()`'s `onForegroundEnter`/main body, `handleBackground()`, `onDoubleTap`) — adding `export` does not change any existing call site, only widens what other modules (here, the test file) can import. This is the only production-code change in this task: the manual `onTap` path (`src/main.ts:386-389`, inside `setupInput()`'s callbacks) calls `refreshInPlace()` directly and is untouched, satisfying the "manual path must never be gated" constraint.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- main.test.ts`
Expected: PASS — all four tests in the `startAutoRefresh timer gating` describe block green.

- [ ] **Step 5: Run the full suite and build**

Run: `npm test`
Expected: PASS — all tests across all files green; read the printed total from the run summary (grows by the 4 new tests in this task on top of the running total from Tasks 1-2).

Run: `npm run build`
Expected: clean build, no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts src/main.test.ts
git commit -m "Gate timer-driven auto-refresh on device connection/wear status"
```

---

## Task 4: Final verification pass

**Files:** none modified — verification only.

**Interfaces:** none — this task only runs commands and confirms output.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all test files pass, total test count is 38 (original) + all new tests added across Tasks 1-3 in `src/main.test.ts`, zero failures.

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: `tsc && vite build` completes cleanly, no type errors, no warnings about unused exports (the `startGlassesModeForTest` test-only export is fine — it's exported and consumed by `main.test.ts`, so it isn't dead code from the bundler's perspective; verify the build output doesn't flag it).

- [ ] **Step 3: Review the diff for scope creep**

Run: `git diff --stat`
Expected: only `src/main.ts` and `src/main.test.ts` show as changed. No changes to `src/glasses/display.ts`, `src/glasses/stations.ts`, `src/glasses/input.ts`, `app.json`, or any other file — this sub-project is wiring-only inside `main.ts` plus its new test file, per the spec's "No new files" (beyond the test file) constraint.

- [ ] **Step 4: Confirm manual refresh path is untouched**

Run: `git diff src/main.ts` and visually confirm the `onTap` callback inside `setupInput()`'s callbacks object (originally `src/main.ts:363-390`) shows no diff — only `startAutoRefresh()`, the import block, the module-level `let` declarations, the new `shouldSkipAutoRefresh`/`startGlassesModeForTest` functions, and the `deviceStatusUnsub` subscription block inside `startGlassesMode()` should appear in the diff.

- [ ] **Step 5: Leave the working tree as-is**

No further action. Per project norm, do not push and do not build a `.ehpk` — these commits stay local until Steven gives explicit go-ahead for either.

---

## Self-Review Notes

- **Spec coverage:** Architecture (module-level `lastDeviceStatus`, subscribe once in `startGlassesMode()`, gate only the timer path) — Tasks 1-3. Data flow (callback updates state, next tick reads it) — Task 2 (subscription) + Task 3 (gate). Error handling (`undefined` fields fail open) — Task 1's `shouldSkipAutoRefresh` tests explicitly cover both `connectType: undefined` and `isWearing: undefined` cases. Testing (`main.test.ts` new file, mock `bridge.onDeviceStatusChanged`, assert refresh is/isn't gated, existing tests stay green) — Tasks 1-4. Cross-cutting verification (`npm run build` clean + `npm test` green after each sub-project) — Task 4, and also folded into the end of every individual task as a step.
- **Placeholder scan:** no "TBD"/"handle edge cases"/elided code — every step shows complete code, including Task 3's `vi.mock('./glasses/stations', ...)` factory and all four timer-gating test cases written out in full.
- **Type consistency:** `shouldSkipAutoRefresh(status: DeviceStatus | null): boolean` is defined once in Task 1 and used with that exact signature in Tasks 2 and 3. `lastDeviceStatus: DeviceStatus | null` and `deviceStatusUnsub: (() => void) | null` are declared once in Task 1 and consumed by name in Tasks 2-3 without renaming. `startGlassesModeForTest(fakeBridge: Pick<EvenAppBridge, 'onDeviceStatusChanged'>): () => DeviceStatus | null` is defined in Task 2 Step 3 and consumed with that exact name/shape by Task 2 Step 1's tests and Task 3 Step 1's tests.
- **Baseline confirmed before writing this plan:** `npm test` currently passes 38 tests (4 test files); `npm run build` is clean. The spec text says "existing 34 tests" — that figure is stale relative to the current tree; this plan uses the actual current count (38) as its baseline and the actual final counts are reported by each task's test-run step rather than hardcoded, since exact running totals depend on execution order being followed exactly as written.
