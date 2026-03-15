/**
 * Phone settings page — vanilla DOM (no framework).
 *
 * Sections:
 * 1. My stations (favorites with drag reorder)
 * 2. Send to Glasses sync button
 * 3. Add station (search)
 * 4. Settings (refresh interval, nearby stations, nearby radius)
 */

import {
  getFavorites,
  saveFavorites,
  addFavorite,
  removeFavorite,
  getSettings,
  saveSettings,
} from '../lib/storage'
import type { AppSettings, Station } from '../lib/types'
import { DEFAULT_SETTINGS } from '../lib/types'
import { searchStations, getStation } from './search'
import { renderFavorites, routeColor } from './favorites'

let currentFavorites: string[] = []
let currentSettings: AppSettings = { ...DEFAULT_SETTINGS }

export function initSettingsPage(): void {
  const app = document.getElementById('app')
  if (!app) return

  app.innerHTML = buildHTML()
  attachListeners()

  // Load saved data
  loadData()
}

function buildHTML(): string {
  return `
    <div class="settings-page">
      <header class="settings-header">
        <h1>SubwayLens</h1>
        <p class="settings-subtitle">MTA Subway Arrivals for G2</p>
      </header>

      <section class="settings-section">
        <h2>My Stations</h2>
        <div id="favorites-list" class="favorites-list"></div>
      </section>

      <div class="sync-bar">
        <button id="sync-glasses" class="sync-button">Send to Glasses</button>
      </div>

      <section class="settings-section">
        <h2>Add Station</h2>
        <div class="search-box">
          <input
            type="text"
            id="station-search"
            placeholder="Search stations..."
            autocomplete="off"
            spellcheck="false"
          />
        </div>
        <div id="search-results" class="search-results"></div>
      </section>

      <section class="settings-section">
        <h2>Settings</h2>

        <div class="setting-row">
          <label>Refresh interval</label>
          <div class="setting-options" id="refresh-options">
            <button data-val="15">15s</button>
            <button data-val="30">30s</button>
            <button data-val="60">60s</button>
            <button data-val="120">2m</button>
          </div>
        </div>

        <div class="setting-row">
          <label>Nearby stations</label>
          <div class="setting-options" id="nearby-toggle">
            <button data-val="true">On</button>
            <button data-val="false">Off</button>
          </div>
        </div>

        <div class="setting-row" id="radius-row">
          <label>Nearby radius</label>
          <div class="setting-options" id="radius-options">
            <button data-val="0.1">0.1 mi</button>
            <button data-val="0.25">0.25 mi</button>
            <button data-val="0.5">0.5 mi</button>
            <button data-val="1">1.0 mi</button>
          </div>
        </div>
      </section>

      <footer class="settings-footer">
        <p>Changes auto-save. Tap "Send to Glasses" to update display.</p>
      </footer>
    </div>
  `
}

async function loadData(): Promise<void> {
  currentFavorites = await getFavorites()
  currentSettings = await getSettings()
  refreshFavoritesList()
  refreshSettingsUI()
}

// ── Favorites ──

function refreshFavoritesList(): void {
  const container = document.getElementById('favorites-list')
  if (!container) return
  renderFavorites(container, currentFavorites, {
    onReorder: async (ids) => {
      currentFavorites = ids
      await saveFavorites(ids)
    },
    onRemove: async (id) => {
      currentFavorites = await removeFavorite(id)
      refreshFavoritesList()
    },
  })
}

// ── Search ──

let searchDebounce: ReturnType<typeof setTimeout> | null = null

function attachListeners(): void {
  const searchInput = document.getElementById(
    'station-search'
  ) as HTMLInputElement
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      if (searchDebounce) clearTimeout(searchDebounce)
      searchDebounce = setTimeout(() => {
        performSearch(searchInput.value)
      }, 200)
    })
  }

  // Sync to glasses button
  document.getElementById('sync-glasses')?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('subwaylens:sync'))
    const btn = document.getElementById('sync-glasses') as HTMLButtonElement
    if (btn) {
      btn.textContent = 'Sent!'
      btn.classList.add('synced')
      setTimeout(() => {
        btn.textContent = 'Send to Glasses'
        btn.classList.remove('synced')
      }, 2000)
    }
  })

  // Settings buttons
  document.getElementById('refresh-options')?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button')
    if (!btn) return
    currentSettings.refreshInterval = parseInt(btn.dataset.val || '30', 10)
    saveSettings(currentSettings)
    refreshSettingsUI()
  })

  document.getElementById('nearby-toggle')?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button')
    if (!btn) return
    currentSettings.nearbyEnabled = btn.dataset.val === 'true'
    saveSettings(currentSettings)
    refreshSettingsUI()
  })

  document.getElementById('radius-options')?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button')
    if (!btn) return
    currentSettings.nearbyRadius = parseFloat(btn.dataset.val || '0.25')
    saveSettings(currentSettings)
    refreshSettingsUI()
  })
}

function performSearch(query: string): void {
  const resultsContainer = document.getElementById('search-results')
  if (!resultsContainer) return

  if (!query.trim()) {
    resultsContainer.innerHTML = ''
    return
  }

  const results = searchStations(query, 15)
  resultsContainer.innerHTML = ''

  if (results.length === 0) {
    const noResults = document.createElement('div')
    noResults.className = 'search-empty'
    noResults.textContent = 'No stations found'
    resultsContainer.appendChild(noResults)
    return
  }

  for (const station of results) {
    resultsContainer.appendChild(createSearchResult(station))
  }
}

function createSearchResult(station: Station): HTMLElement {
  const item = document.createElement('div')
  item.className = 'search-item'

  const info = document.createElement('div')
  info.className = 'search-info'

  const name = document.createElement('div')
  name.className = 'search-name'
  name.textContent = station.name

  const routes = document.createElement('div')
  routes.className = 'search-routes'
  for (const r of station.routes) {
    const badge = document.createElement('span')
    badge.className = `route-badge route-${routeColor(r)}`
    badge.textContent = r
    routes.appendChild(badge)
  }

  info.appendChild(name)
  info.appendChild(routes)

  const addBtn = document.createElement('button')
  addBtn.className = 'search-add'
  const isAlreadyFav = currentFavorites.includes(station.id)
  if (isAlreadyFav) {
    addBtn.textContent = '\u2713' // ✓
    addBtn.disabled = true
    addBtn.classList.add('added')
  } else {
    addBtn.textContent = '+'
    addBtn.addEventListener('click', async () => {
      currentFavorites = await addFavorite(station.id)
      refreshFavoritesList()
      // Update button state
      addBtn.textContent = '\u2713'
      addBtn.disabled = true
      addBtn.classList.add('added')
    })
  }

  item.appendChild(info)
  item.appendChild(addBtn)
  return item
}

// ── Settings UI ──

function refreshSettingsUI(): void {
  // Refresh interval buttons
  setActiveButton('refresh-options', String(currentSettings.refreshInterval))

  // Nearby toggle
  setActiveButton('nearby-toggle', String(currentSettings.nearbyEnabled))

  // Nearby radius
  setActiveButton('radius-options', String(currentSettings.nearbyRadius))

  // Show/hide radius row based on nearby toggle
  const radiusRow = document.getElementById('radius-row')
  if (radiusRow) {
    radiusRow.style.display = currentSettings.nearbyEnabled ? '' : 'none'
  }
}

function setActiveButton(containerId: string, value: string): void {
  const container = document.getElementById(containerId)
  if (!container) return
  container.querySelectorAll('button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.val === value)
  })
}
