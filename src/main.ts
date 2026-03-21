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
  isFavorite,
  getState,
} from './glasses/stations'
import {
  renderHeader,
  renderBody,
  renderLoading,
  renderNoStations,
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

// ── Glasses display helpers ──

/**
 * Create the initial two-container page layout.
 * Header: station name + star (small strip at top).
 * Body: directions, trains, progress bar (fills rest of screen).
 */
async function createInitialPage(
  headerText: string,
  bodyText: string
): Promise<void> {
  if (!bridge) return

  const header = new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: 576,
    height: 28,
    borderWidth: 0,
    borderColor: 0,
    borderRdaius: 0,
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
    borderRdaius: 0,
    paddingLength: 4,
    containerID: BODY_ID,
    containerName: BODY_NAME,
    content: bodyText,
    isEventCapture: 1,
  })

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

/**
 * Full page rebuild (used when switching stations).
 */
async function rebuildPage(
  headerText: string,
  bodyText: string
): Promise<void> {
  if (!bridge) return

  const header = new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: 576,
    height: 28,
    borderWidth: 0,
    borderColor: 0,
    borderRdaius: 0,
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
    borderRdaius: 0,
    paddingLength: 4,
    containerID: BODY_ID,
    containerName: BODY_NAME,
    content: bodyText,
    isEventCapture: 1,
  })

  await bridge.rebuildPageContainer(
    new RebuildPageContainer({
      containerTotalNum: 2,
      textObject: [header, body],
    })
  )
}

/**
 * Update just the body text (smooth, no flicker on real hardware).
 */
async function updateBody(text: string): Promise<void> {
  if (!bridge) return
  await bridge.textContainerUpgrade(
    new TextContainerUpgrade({
      containerID: BODY_ID,
      containerName: BODY_NAME,
      contentOffset: 0,
      contentLength: 2000, // max allowed by textContainerUpgrade
      content: text,
    })
  )
}

/**
 * Update just the header text.
 */
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

/**
 * Refresh and display the current station's arrivals.
 */
async function displayCurrentStation(useRebuild: boolean): Promise<void> {
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

  // Show loading state
  if (useRebuild) {
    await rebuildPage(headerText, renderLoading())
  } else {
    await updateHeader(headerText)
    await updateBody(renderLoading())
  }

  // Fetch arrivals
  const arrivals = await refreshCurrentArrivals()
  if (!arrivals) return

  const bodyText = renderBody(station, arrivals, currentIndex, stations.length)
  await updateBody(bodyText)
}

/**
 * Refresh in-place (no rebuild, just update body text).
 */
async function refreshInPlace(): Promise<void> {
  const station = currentStation()
  if (!station) return

  const arrivals = await refreshCurrentArrivals()
  if (!arrivals) return

  const { stations, currentIndex } = getState()
  const bodyText = renderBody(station, arrivals, currentIndex, stations.length)
  await updateBody(bodyText)
}

// ── Auto-refresh ──

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

// ── Glasses mode startup ──

async function startGlassesMode(b: EvenAppBridge): Promise<void> {
  bridge = b

  initStorage(b)

  // Load station list (favorites + nearby)
  await loadStations()

  // Create initial page
  const station = currentStation()
  if (station) {
    await createInitialPage(
      renderHeader(station, isFavorite(station.id)),
      renderLoading()
    )
  } else {
    await createInitialPage('SubwayLens', renderNoStations())
  }

  // Fetch and display arrivals
  if (station) {
    const arrivals = await refreshCurrentArrivals()
    if (arrivals) {
      const { stations, currentIndex } = getState()
      await updateBody(
        renderBody(station, arrivals, currentIndex, stations.length)
      )
    }
  }

  // Set up input handling
  setupInput(b, {
    onScrollDown: () => {
      nextStation()
      displayCurrentStation(true) // rebuild for station switch
    },
    onScrollUp: () => {
      prevStation()
      displayCurrentStation(true)
    },
    onTap: () => {
      refreshInPlace() // manual refresh
    },
    onDoubleTap: async () => {
      // Exit app
      stopAutoRefresh()
      await b.shutDownPageContainer(0)
    },
    onForegroundEnter: () => {
      // Reload stations (user may have changed favorites in settings)
      loadStations().then(() => displayCurrentStation(true))
      startAutoRefresh()
    },
    onForegroundExit: () => {
      stopAutoRefresh()
    },
  })

  // Start auto-refresh
  await startAutoRefresh()

  // Listen for sync from settings page (user tapped "Send to Glasses")
  window.addEventListener('subwaylens:sync', () => {
    loadStations().then(() => displayCurrentStation(true))
  })
}

// ── Boot ──

async function main(): Promise<void> {
  try {
    // Check if we're inside the Even App WebView by looking for the
    // Flutter native handler. The SDK always injects a bridge object,
    // but the Flutter handler only exists inside the real Even App.
    const hasFlutter =
      !!(window as any).flutter_inappwebview ||
      !!(window as any).webkit?.messageHandlers?.callHandler

    // Always show the settings page on the phone screen.
    // In the Even App WebView, this is the config UI the user sees.
    // In a regular browser, this is the only UI.
    initSettingsPage()

    if (hasFlutter) {
      const b = await waitForEvenAppBridge()
      await startGlassesMode(b)
    }
  } catch {
    // Bridge error — settings page is already initialized above
    console.warn('Glasses mode failed, settings page still available')
  }
}

main()
