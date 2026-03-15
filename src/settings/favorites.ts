/**
 * Favorites list with drag-to-reorder.
 * Pure vanilla DOM — no framework.
 * Supports both HTML5 drag (desktop) and touch events (mobile WebView).
 */

import type { Station } from '../lib/types'
import { getStation } from './search'

export interface FavoritesCallbacks {
  onReorder: (ids: string[]) => void
  onRemove: (id: string) => void
}

let draggedEl: HTMLElement | null = null
let draggedId: string | null = null

/**
 * Render the favorites list into a container element.
 */
export function renderFavorites(
  container: HTMLElement,
  favoriteIds: string[],
  callbacks: FavoritesCallbacks
): void {
  container.innerHTML = ''

  if (favoriteIds.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'fav-empty'
    empty.textContent = 'No stations added yet. Search below to add.'
    container.appendChild(empty)
    return
  }

  for (const id of favoriteIds) {
    const station = getStation(id)
    if (!station) continue
    container.appendChild(createFavItem(station, callbacks))
  }

  // Set up drag-and-drop on the container
  setupDragDrop(container, favoriteIds, callbacks)
}

function createFavItem(
  station: Station,
  callbacks: FavoritesCallbacks
): HTMLElement {
  const item = document.createElement('div')
  item.className = 'fav-item'
  item.dataset.id = station.id
  item.draggable = true

  // Drag handle
  const handle = document.createElement('span')
  handle.className = 'fav-handle'
  handle.textContent = '\u22EE\u22EE' // ⋮⋮
  handle.setAttribute('aria-label', 'Drag to reorder')

  // Station info
  const info = document.createElement('div')
  info.className = 'fav-info'

  const name = document.createElement('div')
  name.className = 'fav-name'
  name.textContent = station.name

  const routes = document.createElement('div')
  routes.className = 'fav-routes'
  for (const r of station.routes) {
    const badge = document.createElement('span')
    badge.className = `route-badge route-${routeColor(r)}`
    badge.textContent = r
    routes.appendChild(badge)
  }

  info.appendChild(name)
  info.appendChild(routes)

  // Remove button
  const removeBtn = document.createElement('button')
  removeBtn.className = 'fav-remove'
  removeBtn.textContent = '\u00D7' // ×
  removeBtn.setAttribute('aria-label', `Remove ${station.name}`)
  removeBtn.addEventListener('click', (e) => {
    e.preventDefault()
    callbacks.onRemove(station.id)
  })

  item.appendChild(handle)
  item.appendChild(info)
  item.appendChild(removeBtn)

  return item
}

function setupDragDrop(
  container: HTMLElement,
  _favoriteIds: string[],
  callbacks: FavoritesCallbacks
): void {
  // HTML5 drag events (desktop browsers)
  container.addEventListener('dragstart', (e) => {
    const target = (e.target as HTMLElement).closest('.fav-item') as HTMLElement
    if (!target) return
    draggedEl = target
    draggedId = target.dataset.id || null
    target.classList.add('dragging')
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
    }
  })

  container.addEventListener('dragend', () => {
    finishDrag(container, callbacks)
  })

  container.addEventListener('dragover', (e) => {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    moveDraggedTo(container, e.clientY)
  })

  // Touch events (mobile WebViews)
  let touchStartY = 0
  let longPressTimer: ReturnType<typeof setTimeout> | null = null

  container.addEventListener('touchstart', (e) => {
    // Allow drag from handle OR long-press anywhere on the item
    const handle = (e.target as HTMLElement).closest('.fav-handle')
    const item = (e.target as HTMLElement).closest('.fav-item') as HTMLElement
    if (!item) return

    // Don't intercept taps on the remove button
    if ((e.target as HTMLElement).closest('.fav-remove')) return

    const touch = e.touches[0]
    touchStartY = touch.clientY

    const startDrag = () => {
      draggedEl = item
      draggedId = item.dataset.id || null
      item.classList.add('dragging')
      // Create floating effect
      const rect = item.getBoundingClientRect()
      item.style.position = 'fixed'
      item.style.left = rect.left + 'px'
      item.style.top = rect.top + 'px'
      item.style.width = rect.width + 'px'
      item.style.zIndex = '1000'
    }

    if (handle) {
      // Immediate drag from handle
      e.preventDefault()
      startDrag()
    } else {
      // Long-press (300ms) to drag from anywhere on the row
      longPressTimer = setTimeout(() => {
        startDrag()
      }, 300)
    }
  }, { passive: false })

  container.addEventListener('touchmove', (e) => {
    // Cancel long-press if finger moves too much
    if (longPressTimer) {
      const touch = e.touches[0]
      if (Math.abs(touch.clientY - touchStartY) > 10) {
        clearTimeout(longPressTimer)
        longPressTimer = null
      }
    }

    if (!draggedEl) return
    e.preventDefault()
    const touch = e.touches[0]

    // Move the floating element to follow the finger
    draggedEl.style.top = (touch.clientY - 30) + 'px'

    moveDraggedTo(container, touch.clientY)
  }, { passive: false })

  container.addEventListener('touchend', () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      longPressTimer = null
    }
    if (!draggedEl) return
    // Reset inline styles from floating
    draggedEl.style.position = ''
    draggedEl.style.left = ''
    draggedEl.style.top = ''
    draggedEl.style.width = ''
    draggedEl.style.zIndex = ''
    finishDrag(container, callbacks)
  })
}

function moveDraggedTo(container: HTMLElement, y: number): void {
  const afterEl = getDragAfterElement(container, y)
  if (draggedEl) {
    if (afterEl) {
      container.insertBefore(draggedEl, afterEl)
    } else {
      container.appendChild(draggedEl)
    }
  }
}

function finishDrag(
  container: HTMLElement,
  callbacks: FavoritesCallbacks
): void {
  if (draggedEl) {
    draggedEl.classList.remove('dragging')
  }
  draggedEl = null
  draggedId = null

  // Read new order from DOM
  const newOrder: string[] = []
  container.querySelectorAll('.fav-item').forEach((el) => {
    const id = (el as HTMLElement).dataset.id
    if (id) newOrder.push(id)
  })
  callbacks.onReorder(newOrder)
}

function getDragAfterElement(
  container: HTMLElement,
  y: number
): HTMLElement | null {
  const items = [
    ...container.querySelectorAll('.fav-item:not(.dragging)'),
  ] as HTMLElement[]

  let closest: HTMLElement | null = null
  let closestOffset = Number.NEGATIVE_INFINITY

  for (const item of items) {
    const box = item.getBoundingClientRect()
    const offset = y - box.top - box.height / 2
    if (offset < 0 && offset > closestOffset) {
      closestOffset = offset
      closest = item
    }
  }

  return closest
}

// ── Route color mapping ──

function routeColor(route: string): string {
  const colors: Record<string, string> = {
    '1': 'red',
    '2': 'red',
    '3': 'red',
    '4': 'green',
    '5': 'green',
    '6': 'green',
    '7': 'purple',
    A: 'blue',
    C: 'blue',
    E: 'blue',
    B: 'orange',
    D: 'orange',
    F: 'orange',
    M: 'orange',
    G: 'lime',
    J: 'brown',
    Z: 'brown',
    L: 'gray',
    N: 'yellow',
    Q: 'yellow',
    R: 'yellow',
    W: 'yellow',
    S: 'gray',
    SIR: 'blue',
  }
  return colors[route] || 'gray'
}

export { routeColor }
