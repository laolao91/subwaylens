/**
 * Input event handler for G2 glasses.
 *
 * Handles all documented SDK quirks:
 * - CLICK_EVENT=0 becomes undefined in fromJson (check both)
 * - Events come from textEvent, sysEvent, OR listEvent depending on
 *   container type and simulator vs real hardware
 * - SCROLL_TOP/BOTTOM are boundary events, not raw gestures
 * - 300ms cooldown to prevent duplicate scroll actions
 */

import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { OsEventTypeList } from '@evenrealities/even_hub_sdk'

export interface InputCallbacks {
  onScrollUp: () => void
  onScrollDown: () => void
  onTap: () => void
  onDoubleTap: () => void
  onForegroundEnter?: () => void
  onForegroundExit?: () => void
}

const SCROLL_COOLDOWN_MS = 300

/**
 * Determine the event type from any event source, handling the CLICK_EVENT=0
 * -> undefined quirk.
 */
function resolveEventType(
  eventType: number | undefined | null
): OsEventTypeList | null {
  // CLICK_EVENT is 0, which fromJson normalises to undefined
  if (eventType === undefined || eventType === null) {
    return OsEventTypeList.CLICK_EVENT
  }
  if (
    eventType === OsEventTypeList.CLICK_EVENT ||
    eventType === OsEventTypeList.SCROLL_TOP_EVENT ||
    eventType === OsEventTypeList.SCROLL_BOTTOM_EVENT ||
    eventType === OsEventTypeList.DOUBLE_CLICK_EVENT ||
    eventType === OsEventTypeList.FOREGROUND_ENTER_EVENT ||
    eventType === OsEventTypeList.FOREGROUND_EXIT_EVENT
  ) {
    return eventType
  }
  return null
}

/**
 * Register input event listeners on the bridge.
 * Returns an unsubscribe function.
 */
export function setupInput(
  bridge: EvenAppBridge,
  callbacks: InputCallbacks
): () => void {
  let lastScrollTime = 0

  function handleEvent(eventType: OsEventTypeList | null): void {
    if (eventType === null) return

    const now = Date.now()

    switch (eventType) {
      case OsEventTypeList.SCROLL_TOP_EVENT: {
        // Scroll up -> previous station
        if (now - lastScrollTime < SCROLL_COOLDOWN_MS) return
        lastScrollTime = now
        callbacks.onScrollUp()
        break
      }
      case OsEventTypeList.SCROLL_BOTTOM_EVENT: {
        // Scroll down -> next station
        if (now - lastScrollTime < SCROLL_COOLDOWN_MS) return
        lastScrollTime = now
        callbacks.onScrollDown()
        break
      }
      case OsEventTypeList.CLICK_EVENT: {
        callbacks.onTap()
        break
      }
      case OsEventTypeList.DOUBLE_CLICK_EVENT: {
        callbacks.onDoubleTap()
        break
      }
      case OsEventTypeList.FOREGROUND_ENTER_EVENT: {
        callbacks.onForegroundEnter?.()
        break
      }
      case OsEventTypeList.FOREGROUND_EXIT_EVENT: {
        callbacks.onForegroundExit?.()
        break
      }
    }
  }

  const unsub = bridge.onEvenHubEvent((event) => {
    // Events can come from any of these sources depending on
    // container type and simulator vs real hardware.
    // Handle ALL three to be safe.
    if (event.textEvent) {
      handleEvent(resolveEventType(event.textEvent.eventType))
    }
    if (event.sysEvent) {
      handleEvent(resolveEventType(event.sysEvent.eventType))
    }
    if (event.listEvent) {
      handleEvent(resolveEventType(event.listEvent.eventType))
    }
  })

  return unsub
}
