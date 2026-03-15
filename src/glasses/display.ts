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

/** Max trains per direction to show */
const MAX_TRAINS = 3

/** Approximate chars per line on the G2 display */
const CHARS_PER_LINE = 38

/**
 * Render the header text container content.
 * Shows station name + favorite star.
 */
export function renderHeader(station: Station, isFavorite: boolean): string {
  const star = isFavorite ? ' \u2605' : '' // ★
  const name = station.name
  // Truncate name if too long with star
  const maxNameLen = CHARS_PER_LINE - star.length
  const displayName =
    name.length > maxNameLen ? name.slice(0, maxNameLen - 2) + '..' : name
  return displayName + star
}

/**
 * Format a single train line: "[R] Terminal      N min - H:MM"
 *
 * The G2 font is NOT monospaced so padding with spaces is approximate.
 * We aim for a readable layout, not pixel-perfect alignment.
 */
function formatTrainLine(arrival: TrainArrival, now: number): string {
  const badge = `[${arrival.route}]`
  const time = formatArrival(arrival.arrivalTime, now)
  const terminal =
    arrival.terminal.length > 19
      ? arrival.terminal.slice(0, 18) + '.'
      : arrival.terminal

  // Highlight marker for trains arriving soon (< 4 min)
  // Use filled triangle ▶ (U+25B6, confirmed in G2 font) as attention indicator
  const soon = isArrivingSoon(arrival.arrivalTime, now)
  const marker = soon ? '\u25B6' : ' '

  // Build line: "▶[R] Terminal   N min - H:MM"  or  " [R] Terminal   N min - H:MM"
  const left = `${marker}${badge} ${terminal}`
  const gap = Math.max(1, CHARS_PER_LINE - left.length - time.length)
  return left + ' '.repeat(gap) + time
}

/**
 * Build a direction label from train terminals.
 * Uses the most common terminal among the trains. Falls back to station
 * static label (station.north / station.south) when no trains available.
 */
function directionLabel(trains: TrainArrival[], fallback: string): string {
  if (trains.length === 0) return fallback
  // Group routes by terminal
  const termToRoutes = new Map<string, string[]>()
  for (const t of trains) {
    const routes = termToRoutes.get(t.terminal) || []
    if (!routes.includes(t.route)) routes.push(t.route)
    termToRoutes.set(t.terminal, routes)
  }
  // Pick the most common terminal
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
 * Shows both directions with train arrivals and progress bar.
 *
 * Note: no heavy divider at the top — the simulator/hardware renders a
 * container boundary line between the header and body containers.
 */
export function renderBody(
  station: Station,
  arrivals: StationArrivals,
  stationIndex: number,
  totalStations: number
): string {
  const now = Math.floor(Date.now() / 1000)
  const lines: string[] = []

  // ── North direction ──
  const northTrains = arrivals.north.slice(0, MAX_TRAINS)
  const northLabel = directionLabel(northTrains, station.north)
  lines.push(`\u25B2 ${northLabel}`) // ▲ Direction
  if (northTrains.length === 0) {
    lines.push('  No live data')
  } else {
    for (const t of northTrains) {
      lines.push(formatTrainLine(t, now))
    }
  }

  // Dashed divider between directions
  lines.push('\u2500 '.repeat(Math.floor(CHARS_PER_LINE / 2)))

  // ── South direction ──
  const southTrains = arrivals.south.slice(0, MAX_TRAINS)
  const southLabel = directionLabel(southTrains, station.south)
  lines.push(`\u25BC ${southLabel}`) // ▼ Direction
  if (southTrains.length === 0) {
    lines.push('  No live data')
  } else {
    for (const t of southTrains) {
      lines.push(formatTrainLine(t, now))
    }
  }

  // ── Progress bar ──
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
