import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DeviceStatus, DeviceConnectType } from '@evenrealities/even_hub_sdk'
import type { EvenAppBridge as EvenAppBridgeType } from '@evenrealities/even_hub_sdk'
import * as stations from './glasses/stations'
import type { Station } from './lib/types'

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
