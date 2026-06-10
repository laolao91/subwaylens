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
} from '@evenrealities/even_hub_sdk'
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'

import { initStorage } from './lib/storage'
import {
  loadStations,
  currentStation,
  nextStation,
  prevStation,
  refreshCurrentArrivals,
  refreshAlerts,
  refreshOutages,
  getCachedAlerts,
  getCachedArrivals,
  getOutagesForCurrentStation,
  prefetchAllStations,
  applyRouteFilter,
  isFavorite,
  getState,
} from './glasses/stations'
import {
  renderHeader,
  renderBody,
  renderAlertSummary,
  renderLoading,
  renderNoStations,
} from './glasses/display'
import { setupInput } from './glasses/input'
import { getSettings } from './lib/storage'
import { getSystem } from './data/systems'
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
      contentLength: 2000,
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
      contentLength: 1000,
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

  const headerText = renderHeader(station, isFavorite(station.id), getOutagesForCurrentStation().length > 0)
  const cached = getCachedArrivals(station.id)
  const alerts = getCachedAlerts()

  // Show cached data immediately (no Loading... flicker) when available,
  // then refresh in the background and update once fresh data arrives.
  if (cached) {
    const filtered = applyRouteFilter(cached, station.id)
    const initialBody = renderBody(station, filtered, currentIndex, stations.length, alerts, getOutagesForCurrentStation().length)
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
    refreshOutages(),
  ])

  if (displaySeq !== seq) return

  const freshAlerts = getCachedAlerts()
  const filtered = applyRouteFilter(
    arrivals ?? { stationId: station.id, north: [], south: [], fetchedAt: Math.floor(Date.now() / 1000) },
    station.id
  )
  const bodyText = renderBody(station, filtered, currentIndex, stations.length, freshAlerts, getOutagesForCurrentStation().length)
  lastBodyText = bodyText
  await updateBody(bodyText)
}

async function refreshInPlace(): Promise<void> {
  // Prevent concurrent refreshes from overlapping.
  if (isRefreshing) return
  isRefreshing = true

  // Capture (don't bump) the sequence — a refresh is not a navigation.
  // Bumping here used to cancel in-flight displayCurrentStation() renders,
  // forcing a redundant duplicate fetch (review bug #2).
  const seq = displaySeq
  const station = currentStation()
  if (!station) { isRefreshing = false; return }

  try {
    const [arrivals] = await Promise.all([
      refreshCurrentArrivals(),
      refreshAlerts(),
      refreshOutages(),
    ])

    // Navigation occurred mid-refresh — discard stale result.
    if (displaySeq !== seq) return

    const { stations, currentIndex } = getState()
    const alerts = getCachedAlerts()
    const filtered = applyRouteFilter(
      arrivals ?? { stationId: station.id, north: [], south: [], fetchedAt: Math.floor(Date.now() / 1000) },
      station.id
    )
    const bodyText = renderBody(station, filtered, currentIndex, stations.length, alerts, getOutagesForCurrentStation().length)
    await updateHeader(renderHeader(station, isFavorite(station.id), getOutagesForCurrentStation().length > 0))
    lastBodyText = bodyText

    if (isAlertView && arrivals) {
      await updateBody(renderAlertSummary(arrivals, alerts, getOutagesForCurrentStation()))
    } else {
      await updateBody(bodyText)
    }
  } finally {
    isRefreshing = false
  }
}

/**
 * Re-render the current station's body from cached arrivals.
 * Light-touch: no fetch, no nav reset. Returns false when there is
 * nothing cached to render (caller may fall back to a refresh).
 */
async function renderCurrentFromCache(): Promise<boolean> {
  const station = currentStation()
  if (!station) return false
  const cached = getCachedArrivals(station.id)
  if (!cached) return false
  const { stations, currentIndex } = getState()
  const filtered = applyRouteFilter(cached, station.id)
  const bodyText = renderBody(station, filtered, currentIndex, stations.length, getCachedAlerts(), getOutagesForCurrentStation().length)
  lastBodyText = bodyText
  await updateBody(bodyText)
  return true
}

// ── Auto-refresh ──

async function startAutoRefresh(): Promise<void> {
  stopAutoRefresh()
  const settings = await getSettings()
  // Heavy feeds (MBTA/MSP/MARTA, ≥500KB per fetch) enforce a refresh
  // floor so the default 15-30s cadence can't burn ~1.5MB/min cellular.
  const systemFloor = Math.max(
    0,
    ...getState().stations.map((s) => getSystem(s.system).minRefreshSecs)
  )
  const intervalSecs = Math.max(settings.refreshInterval, systemFloor)
  refreshTimer = setInterval(() => {
    refreshInPlace()
  }, intervalSecs * 1000)
}

function stopAutoRefresh(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
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

  await loadStations()

  const station = currentStation()
  if (station) {
    await createInitialPage(
      renderHeader(station, isFavorite(station.id), getOutagesForCurrentStation().length > 0),
      renderLoading()
    )
  } else {
    await createInitialPage('SubwayLens', renderNoStations())
  }

  if (station) {
    // Warm the cache for all favorites in parallel, then paint from cache.
    const seq = ++displaySeq
    await Promise.all([prefetchAllStations(), refreshAlerts(), refreshOutages()])
    if (displaySeq === seq) {
      const { stations, currentIndex } = getState()
      const alerts = getCachedAlerts()
      const cached = getCachedArrivals(station.id)
      if (cached) {
        const filtered = applyRouteFilter(cached, station.id)
        const bodyText = renderBody(station, filtered, currentIndex, stations.length, alerts, getOutagesForCurrentStation().length)
        lastBodyText = bodyText
        await updateBody(bodyText)
      }
    }
  }

  // Store the unsub handle so re-entry is safe (teardown before re-registering).
  if (inputUnsub) inputUnsub()
  inputUnsub = setupInput(b, {

    onScrollDown: async () => {
      nextStation()
      displayCurrentStation(true)
    },

    onScrollUp: async () => {
      prevStation()
      displayCurrentStation(true)
    },

    onTap: async () => {
      const station = currentStation()
      const cachedArrivals = station
        ? getCachedArrivals(station.id)
        : null
      const alerts = getCachedAlerts()

      // Check if any routes at this station have active alerts
      const routeIds = cachedArrivals
        ? [
            ...cachedArrivals.north.map(t => t.route),
            ...cachedArrivals.south.map(t => t.route),
          ]
        : []
      const outages = getOutagesForCurrentStation()
      const hasAlerts =
        routeIds.some(id => alerts.has(id) && (alerts.get(id)?.length ?? 0) > 0) ||
        outages.length > 0

      if (hasAlerts && cachedArrivals) {
        isAlertView = !isAlertView
        if (isAlertView) {
          await updateBody(renderAlertSummary(cachedArrivals, alerts, outages))
        } else {
          // Re-render from cache so the footer timestamp is current
          // (replaying lastBodyText verbatim showed a stale clock — bug #5).
          const rendered = await renderCurrentFromCache()
          if (!rendered) await updateBody(lastBodyText)
        }
      } else {
        isAlertView = false
        refreshInPlace()
      }
    },

    onDoubleTap: async () => {
      stopAutoRefresh()
      await b.shutDownPageContainer(1)
    },

    onForegroundEnter: () => {
      isAlertView = false
      loadStations().then(() => {
        // Warm cache for all stations before displaying, then display current.
        Promise.all([prefetchAllStations(), refreshAlerts(), refreshOutages()]).then(() =>
          displayCurrentStation(true)
        )
      })
      startAutoRefresh()
    },

    onForegroundExit: handleBackground,

    onAbnormalExit: handleBackground,
  })

  await startAutoRefresh()

  window.addEventListener('subwaylens:sync', () => {
    loadStations().then(() => displayCurrentStation(true))
    // Settings may have changed the refresh interval — restart the timer
    // so the new cadence applies immediately (review bug #1).
    startAutoRefresh()
  })

  // Nearby stations resolved in the background (GPS append) — prefetch
  // their arrivals, then re-render from cache so the progress bar picks
  // up the new station count. Light-touch: no nav reset, no alert-view exit.
  window.addEventListener('subwaylens:stations-updated', () => {
    prefetchAllStations().then(() => {
      if (isAlertView) return
      renderCurrentFromCache()
    })
  })
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
