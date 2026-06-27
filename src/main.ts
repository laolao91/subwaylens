/**
 * SubwayLens — main entry point.
 *
 * Initialises the Even App bridge, sets up the glasses display,
 * and routes between glasses mode and phone settings page.
 *
 * The app runs in dual mode when inside the Even App WebView:
 * - Phone screen: settings page (search, favorites, settings)
 * - Glasses display: real-time subway arrivals
 *
 * In a regular browser (no bridge), only the settings page is shown.
 */

import {
  waitForEvenAppBridge,
  CreateStartUpPageContainer,
  TextContainerProperty,
  RebuildPageContainer,
  TextContainerUpgrade,
  DeviceConnectType,
} from '@evenrealities/even_hub_sdk'
import type { EvenAppBridge, DeviceStatus } from '@evenrealities/even_hub_sdk'

import { initStorage } from './lib/storage'
import type { Station, StationArrivals, AppMode, AppSettings } from './lib/types'
import type { RouteAlert } from './data/alerts'
import {
  loadStations,
  currentStation,
  nextStation,
  prevStation,
  refreshCurrentArrivals,
  refreshAlerts,
  getCachedAlerts,
  getCachedArrivals,
  prefetchAllStations,
  applyRouteFilter,
  isFavorite,
  getState,
} from './glasses/stations'
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
import { setupInput } from './glasses/input'
import { getSettings } from './lib/storage'
import { initSettingsPage } from './settings/settings-mount'

// ── Container IDs ──
// containerName max 16 chars per SDK spec
const HEADER_ID = 1
const HEADER_NAME = 'hdr'
const BODY_ID = 2
const BODY_NAME = 'body'

let bridge: EvenAppBridge | null = null
let refreshTimer: ReturnType<typeof setInterval> | null = null
let inputUnsub: (() => void) | null = null
let deviceStatusUnsub: (() => void) | null = null
let lastDeviceStatus: DeviceStatus | null = null

let lastBodyText = ''

// ── Alert view toggle state ──
// When alerts exist, tap switches between arrivals and alert summary.
// Switching stations always resets to arrivals view.
let isAlertView = false

// ── Display sequence counter ──
// Incremented each time a navigation or display-initiating action starts.
// Async continuations check their captured seq against the current value;
// if they differ the display has already been superseded and the write is dropped.
let displaySeq = 0

// ── Refresh gate ──
// Prevents concurrent auto-refreshes from overlapping if a fetch takes
// longer than the configured interval.
let isRefreshing = false

// ── App mode state ──
let appMode: AppMode = 'menu'
let menuCursor = 1          // 0=Nearest, 1=Favorites, 2=Delays
let nearbyEnabledCache = true  // cached for menu rendering without re-reading settings

// ── Glasses display helpers ──

/**
 * Build the two TextContainerProperty objects used by createInitialPage and
 * rebuildPage. Extracted so container dimensions are defined in one place.
 */
function buildContainers(
  headerText: string,
  bodyText: string
): [TextContainerProperty, TextContainerProperty] {
  const header = new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: 576,
    height: 28,
    borderWidth: 0,
    borderColor: 0,
    borderRadius: 0,
    paddingLength: 4,
    containerID: HEADER_ID,
    containerName: HEADER_NAME,
    content: headerText,
    isEventCapture: 0,
  })

  const body = new TextContainerProperty({
    xPosition: 0,
    yPosition: 28,
    width: 576,
    height: 260,
    borderWidth: 0,
    borderColor: 0,
    borderRadius: 0,
    paddingLength: 4,
    containerID: BODY_ID,
    containerName: BODY_NAME,
    content: bodyText,
    isEventCapture: 1,
  })

  return [header, body]
}

async function createInitialPage(
  headerText: string,
  bodyText: string
): Promise<void> {
  if (!bridge) return
  const [header, body] = buildContainers(headerText, bodyText)
  const result = await bridge.createStartUpPageContainer(
    new CreateStartUpPageContainer({
      containerTotalNum: 2,
      textObject: [header, body],
    })
  )
  if (result !== 0) {
    console.error('createStartUpPageContainer failed:', result)
  }
}

async function rebuildPage(
  headerText: string,
  bodyText: string
): Promise<void> {
  if (!bridge) return
  const [header, body] = buildContainers(headerText, bodyText)
  await bridge.rebuildPageContainer(
    new RebuildPageContainer({
      containerTotalNum: 2,
      textObject: [header, body],
    })
  )
}

async function updateBody(text: string): Promise<void> {
  if (!bridge) return
  await bridge.textContainerUpgrade(
    new TextContainerUpgrade({
      containerID: BODY_ID,
      containerName: BODY_NAME,
      contentOffset: 0,
      contentLength: 0,
      content: text,
    })
  )
}

async function updateHeader(text: string): Promise<void> {
  if (!bridge) return
  await bridge.textContainerUpgrade(
    new TextContainerUpgrade({
      containerID: HEADER_ID,
      containerName: HEADER_NAME,
      contentOffset: 0,
      contentLength: 0,
      content: text,
    })
  )
}

// ── Display update logic ──

async function displayCurrentStation(useRebuild: boolean): Promise<void> {
  // Each navigation bumps the sequence. If a slower fetch from a previous
  // station completes after we've already moved on, it checks this and aborts.
  isAlertView = false
  const seq = ++displaySeq

  const station = currentStation()
  const { stations, currentIndex } = getState()

  if (!station) {
    if (useRebuild) {
      await rebuildPage('SubwayLens', renderNoStations())
    } else {
      await updateHeader('SubwayLens')
      await updateBody(renderNoStations())
    }
    return
  }

  const headerText = renderHeader(station, isFavorite(station.id))
  const cached = getCachedArrivals(station.id)
  const alerts = getCachedAlerts()

  // Show cached data immediately (no Loading... flicker) when available,
  // then refresh in the background and update once fresh data arrives.
  if (cached) {
    const filtered = applyRouteFilter(cached, station.id)
    const initialBody = station.system
      ? renderDepartureBoard(station, filtered)
      : renderBody(station, filtered, currentIndex, stations.length, alerts)
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
  ])

  if (displaySeq !== seq) return

  const freshAlerts = getCachedAlerts()
  const filtered = applyRouteFilter(
    arrivals ?? { stationId: station.id, north: [], south: [], fetchedAt: Math.floor(Date.now() / 1000) },
    station.id
  )
  const bodyText = station.system
    ? renderDepartureBoard(station, filtered)
    : renderBody(station, filtered, currentIndex, stations.length, freshAlerts)
  lastBodyText = bodyText
  await updateBody(bodyText)
}

async function refreshInPlace(): Promise<void> {
  // Prevent concurrent refreshes from overlapping.
  if (isRefreshing) return
  isRefreshing = true

  const seq = ++displaySeq
  const station = currentStation()
  if (!station) { isRefreshing = false; return }

  try {
    const [arrivals] = await Promise.all([
      refreshCurrentArrivals(),
      refreshAlerts(),
    ])

    // Navigation occurred mid-refresh — discard stale result.
    if (displaySeq !== seq) return

    const { stations, currentIndex } = getState()
    const alerts = getCachedAlerts()
    const filtered = applyRouteFilter(
      arrivals ?? { stationId: station.id, north: [], south: [], fetchedAt: Math.floor(Date.now() / 1000) },
      station.id
    )
    const bodyText = station.system
      ? renderDepartureBoard(station, filtered)
      : renderBody(station, filtered, currentIndex, stations.length, alerts)
    await updateHeader(renderHeader(station, isFavorite(station.id)))
    lastBodyText = bodyText

    if (isAlertView && arrivals) {
      await updateBody(renderAlertSummary(arrivals, alerts))
    } else {
      await updateBody(bodyText)
    }
  } finally {
    isRefreshing = false
  }
}

async function restoreNormalDisplay(): Promise<void> {
  isAlertView = false
  if (lastBodyText) {
    await updateBody(lastBodyText)
  } else {
    await refreshInPlace()
  }
}

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

/**
 * Alerts are subway-only — commuter-rail route IDs (LIRR/MNR) are bare
 * numerics that can collide with subway route IDs in the shared alerts
 * map (e.g. LIRR "4" vs subway 4 line), so this must check station.system,
 * not just route-ID membership.
 */
export function shouldShowAlertToggle(
  station: Station | null,
  routeIds: string[],
  alerts: Map<string, RouteAlert[]>
): boolean {
  if (!station || station.system) return false
  return routeIds.some(id => alerts.has(id) && (alerts.get(id)?.length ?? 0) > 0)
}

// ── Auto-refresh ──

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
 * Map defaultView to a menu cursor index (0=Nearest, 1=Favorites, 2=Delays).
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

// ── Shared background/disconnect handler ──
// onForegroundExit and onAbnormalExit perform identical cleanup.
function handleBackground(): void {
  isAlertView = false
  stopAutoRefresh()
}

// ── Glasses mode startup ──

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

// ── Boot ──

async function main(): Promise<void> {
  try {
    const hasFlutter =
      !!(window as any).flutter_inappwebview ||
      !!(window as any).webkit?.messageHandlers?.callHandler

    initSettingsPage()

    if (hasFlutter) {
      const b = await waitForEvenAppBridge()
      await startGlassesMode(b)
    }
  } catch {
    console.warn('Glasses mode failed, settings page still available')
  }
}

main()
