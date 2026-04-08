/**
 * Glasses display renderer.
 *
 * Formats station arrival data into text strings for G2 text containers.
 * Uses Unicode box-drawing chars confirmed available in G2 font:
 *   ━ (U+2501) heavy horizontal
 *   ─ (U+2500) light horizontal
 *   ▲ (U+25B2) up triangle
 *   ▼ (U+25BC) down triangle
 *   ★ (U+2605) filled star
 *   ▶ (U+25B6) right triangle (arriving soon marker)
 *
 * Display: 576x288 pixels, single LVGL font (variable-width).
 * Target: ~400 chars max so text fits without overflow and scroll
 * boundary events fire immediately on gesture.
 */

import type { Station, StationArrivals, TrainArrival } from '../lib/types'
import { formatArrival, isArrivingSoon } from '../lib/time'
import { getBoroughCode } from '../data/boroughs'

/** Max trains per direction to show */
const MAX_TRAINS = 3

/** Approximate chars per line on the G2 display */
const CHARS_PER_LINE = 38

/** Fixed terminal name display width — pads short names, truncates long ones */
const TERMINAL_WIDTH = 15

/**
 * Get the current time as a short H:MMa/p string for the header clock.
 */
function getCurrentTimeStr(): string {
  const d = new Date()
  const h = d.getHours()
  const m = d.getMinutes().toString().padStart(2, '0')
  const hour12 = h % 12 || 12
  const ampm = h < 12 ? 'a' : 'p'
  return `${hour12}:${m}${ampm}`
}

/**
 * Render the header text container content.
 * Shows station name + favorite star + live clock on the right.
 */
export function renderHeader(station: Station, isFavorite: boolean): string {
  const star = isFavorite ? ' \u2605' : ''
  const timeStr = getCurrentTimeStr()
  const name = station.name
  const maxNameLen = CHARS_PER_LINE - star.length - 1 - timeStr.length
  const displayName =
    name.length > maxNameLen ? name.slice(0, maxNameLen - 2) + '..' : name
  const gap = Math.max(1, CHARS_PER_LINE - displayName.length - star.length - timeStr.length)
  return displayName + star + ' '.repeat(gap) + timeStr
}

/**
 * Format a single train line with fixed-width terminal column.
 * Terminal name always padded/truncated to TERMINAL_WIDTH chars so the
 * time column starts at a consistent horizontal position.
 *
 * Format: "▶[R] Terminal_name___  Nm H:MM"
 */
function formatTrainLine(arrival: TrainArrival, now: number): string {
  const badge = `[${arrival.route}]`
  const time = formatArrival(arrival.arrivalTime, now)

  // Fixed-width terminal: truncate or pad to TERMINAL_WIDTH
  const raw = arrival.terminal
  const terminal = raw.length > TERMINAL_WIDTH
    ? raw.slice(0, TERMINAL_WIDTH - 1) + '.'
    : raw.padEnd(TERMINAL_WIDTH, ' ')

  const soon = isArrivingSoon(arrival.arrivalTime, now)
  const marker = soon ? '\u25B6' : ' '

  // marker(1) + badge(3-4) + space(1) + terminal(15) + space(1) + time
  const left = `${marker}${badge} ${terminal}`
  const gap = Math.max(1, CHARS_PER_LINE - left.length - time.length)
  return left + ' '.repeat(gap) + time
}

/**
 * Build a direction label from train terminals.
 */
function directionLabel(trains: TrainArrival[], fallback: string): string {
  if (trains.length === 0) return fallback
  const termToRoutes = new Map<string, string[]>()
  for (const t of trains) {
    const routes = termToRoutes.get(t.terminal) || []
    if (!routes.includes(t.route)) routes.push(t.route)
    termToRoutes.set(t.terminal, routes)
  }
  let best = ''
  let bestCount = 0
  for (const [term, routes] of termToRoutes) {
    if (routes.length > bestCount) {
      best = term
      bestCount = routes.length
    }
  }
  return best
}

/**
 * Render the body text container content.
 * Shows both directions with train arrivals, progress bar, and control hint.
 */
export function renderBody(
  station: Station,
  arrivals: StationArrivals,
  stationIndex: number,
  totalStations: number
): string {
  const now = Math.floor(Date.now() / 1000)
  const lines: string[] = []

  // North direction
  const northTrains = arrivals.north.slice(0, MAX_TRAINS)
  const northLabel = directionLabel(northTrains, station.north)
  lines.push(`\u25B2 ${northLabel}`)

  const northBorough = getBoroughCode(northLabel)
  if (northBorough) {
    lines.push(northBorough)
  }

  if (northTrains.length === 0) {
    lines.push('  No live data')
  } else {
    for (const t of northTrains) {
      lines.push(formatTrainLine(t, now))
    }
  }

  // Solid heavy divider between directions
  lines.push('\u2501'.repeat(CHARS_PER_LINE))

  // South direction
  const southTrains = arrivals.south.slice(0, MAX_TRAINS)
  const southLabel = directionLabel(southTrains, station.south)
  lines.push(`\u25BC ${southLabel}`)

  const southBorough = getBoroughCode(southLabel)
  if (southBorough) {
    lines.push(southBorough)
  }

  if (southTrains.length === 0) {
    lines.push('  No live data')
  } else {
    for (const t of southTrains) {
      lines.push(formatTrainLine(t, now))
    }
  }

  // Progress bar
  if (totalStations > 1) {
    const pos = `${stationIndex + 1}/${totalStations}`
    const barTotal = CHARS_PER_LINE - pos.length - 1
    const filled = Math.max(
      1,
      Math.round((barTotal * (stationIndex + 1)) / totalStations)
    )
    const empty = barTotal - filled
    const bar = '\u2501'.repeat(filled) + '\u2500'.repeat(empty)
    lines.push(bar + ' ' + pos)
  }

  // Control hint
  lines.push('tap:refresh  dbl:exit')

  return lines.join('\n')
}

/**
 * Render the exit confirmation interstitial.
 * Shown after the first double-tap. Second double-tap exits;
 * any scroll or tap cancels back to the normal view.
 */
export function renderExitConfirm(): string {
  const lines: string[] = []
  lines.push('')
  lines.push('  Double-tap again to exit.')
  lines.push('')
  lines.push('  Scroll or tap to cancel.')
  lines.push('')
  return lines.join('\n')
}

/**
 * Render a loading screen for the body container.
 */
export function renderLoading(): string {
  const lines: string[] = []
  lines.push('')
  lines.push('  Loading arrivals...')
  lines.push('')
  return lines.join('\n')
}

/**
 * Render an empty state when no stations are configured.
 */
export function renderNoStations(): string {
  const lines: string[] = []
  lines.push('')
  lines.push('  No stations added.')
  lines.push('')
  lines.push('  Open settings on your')
  lines.push('  phone to add stations.')
  return lines.join('\n')
}
