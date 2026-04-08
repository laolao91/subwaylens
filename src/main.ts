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
  renderExitConfirm,
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

// ── Exit confirmation state ──
// Double-tap shows a confirmation screen; a second double-tap within
// EXIT_CONFIRM_MS exits the app. Any scroll or tap cancels.
const EXIT_CONFIRM_MS = 3000
let exitConfirmPending = false
let exitConfirmTimer: ReturnType<typeof setTimeout> | null = null
let lastBodyText = ''

function clearExitConfirm(): void {
  exitConfirmPending = false
  if (exitConfirmTimer) {
    clearTimeout(exitConfirmTimer)
    exitConfirmTimer = null
  }
}

// ── Glasses display helpers ──

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

  if (useRebuild) {
    await rebuildPage(headerText, renderLoading())
  } else {
    await updateHeader(headerText)
    await updateBody(renderLoading())
  }

  const arrivals = await refreshCurrentArrivals()
  if (!arrivals) return

  const bodyText = renderBody(station, arrivals, currentIndex, stations.length)
  lastBodyText = bodyText
  await updateBody(bodyText)
}

async function refreshInPlace(): Promise<void> {
  const station = currentStation()
  if (!station) return

  const arrivals = await refreshCurrentArrivals()
  if (!arrivals) return

  const { stations, currentIndex } = getState()
  const bodyText = renderBody(station, arrivals, currentIndex, stations.length)
  lastBodyText = bodyText
  await updateBody(bodyText)
}

async function restoreNormalDisplay(): Promise<void> {
  if (lastBodyText) {
    await updateBody(lastBodyText)
  } else {
    await refreshInPlace()
  }
}

// ── Auto-refresh ──

async function startAutoRefresh(): Promise<void> {
  stopAutoRefresh()
  const settings = await getSettings()
  refreshTimer = setInterval(() => {
    if (!exitConfirmPending) {
      refreshInPlace()
    }
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

  await loadStations()

  const station = currentStation()
  if (station) {
    await createInitialPage(
      renderHeader(station, isFavorite(station.id)),
      renderLoading()
    )
  } else {
    await createInitialPage('SubwayLens', renderNoStations())
  }

  if (station) {
    const arrivals = await refreshCurrentArrivals()
    if (arrivals) {
      const { stations, currentIndex } = getState()
      const bodyText = renderBody(station, arrivals, currentIndex, stations.length)
      lastBodyText = bodyText
      await updateBody(bodyText)
    }
  }

  setupInput(b, {
    onScrollDown: async () => {
      if (exitConfirmPending) {
        clearExitConfirm()
        await restoreNormalDisplay()
        return
      }
      nextStation()
      displayCurrentStation(true)
    },
    onScrollUp: async () => {
      if (exitConfirmPending) {
        clearExitConfirm()
        await restoreNormalDisplay()
        return
      }
      prevStation()
      displayCurrentStation(true)
    },
    onTap: async () => {
      if (exitConfirmPending) {
        clearExitConfirm()
        await restoreNormalDisplay()
        return
      }
      refreshInPlace()
    },
    onDoubleTap: async () => {
      if (exitConfirmPending) {
        clearExitConfirm()
        stopAutoRefresh()
        await b.shutDownPageContainer(0)
      } else {
        exitConfirmPending = true
        await updateBody(renderExitConfirm())
        exitConfirmTimer = setTimeout(async () => {
          exitConfirmPending = false
          exitConfirmTimer = null
          await restoreNormalDisplay()
        }, EXIT_CONFIRM_MS)
      }
    },
    onForegroundEnter: () => {
      loadStations().then(() => displayCurrentStation(true))
      startAutoRefresh()
    },
    onForegroundExit: () => {
      clearExitConfirm()
      stopAutoRefresh()
    },
  })

  await startAutoRefresh()

  window.addEventListener('subwaylens:sync', () => {
    loadStations().then(() => displayCurrentStation(true))
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
