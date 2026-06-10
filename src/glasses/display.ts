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
import { formatArrival, isArrivingSoon, minutesUntil } from '../lib/time'
import { TERMINAL_ABBREVS } from '../data/terminal-abbrevs'
import { getBoroughCode } from '../data/boroughs'
import type { RouteAlert } from '../data/alerts'
import { alertsForRoutes, routeHasAlert } from '../data/alerts'
import type { EquipmentOutage } from '../data/outages'
import { getSystem } from '../data/systems'
import { routeDisplayName } from '../data/pack-registry'
import { scheduledHeadway } from '../data/headways'

/** Max trains per direction to show */
const MAX_TRAINS = 3

/** Approximate chars per line on the G2 display */
const CHARS_PER_LINE = 38

/**
 * Width for ━ (U+2501) divider and progress bar lines.
 * ━ renders slightly wider than a regular character in the G2 LVGL font,
 * so CHARS_PER_LINE worth of them wraps onto a second visual line (the
 * "double line" artifact). This value keeps every ━ line safely on one row.
 */
const DIVIDER_WIDTH = 26

/** Fixed terminal name display width — pads short names, truncates long ones */
const TERMINAL_WIDTH = 15

/**
 * Format a Date as a compact H:MMa/p string (e.g. "10:24a", "3:07p").
 * Used for both the live header clock and the last-refreshed timestamp.
 */
function formatClockTime(date: Date): string {
  const h = date.getHours()
  const m = date.getMinutes().toString().padStart(2, '0')
  const hour12 = h % 12 || 12
  const ampm = h < 12 ? 'a' : 'p'
  return `${hour12}:${m}${ampm}`
}

/**
 * Get the current time as a short H:MMa/p string for the header clock.
 */
function getCurrentTimeStr(): string {
  return formatClockTime(new Date())
}

/**
 * Render the header text container content.
 * Shows station name + favorite star + live clock on the right.
 */
export function renderHeader(
  station: Station,
  isFavorite: boolean,
  hasOutage = false
): string {
  // Equipment outage marker: one char, zero rows (design decision —
  // outage details live in the tap-to-view alert summary).
  const star = (isFavorite ? ' ★' : '') + (hasOutage ? '!' : '')
  const timeStr = getCurrentTimeStr()
  // Commuter-rail stations get a system tag so "Penn Station" is
  // unambiguously the LIRR vs MNR board.
  const system = getSystem(station.system)
  const tag = system.layout === 'departure-board' ? ` ${system.id.toUpperCase()}` : ''
  const name = station.name + tag
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
 * Appends '!' to route badge if the route has an active alert.
 * Shows "+Xm late" instead of terminal name when GTFS-RT reports a delay > 60s.
 *
 * Format: "▶[R!] Terminal_name__  Nm - H:MM"
 *    or:  " [R!] +3m late______   Nm - H:MM"
 */
function formatTrainLine(
  arrival: TrainArrival,
  now: number,
  alerts: Map<string, RouteAlert[]>
): string {
  const hasAlert = routeHasAlert(alerts, arrival.route)
  const badge = hasAlert ? `[${arrival.route}!]` : `[${arrival.route}]`
  const time = formatArrival(arrival.arrivalTime, now)

  let terminalDisplay: string
  if (arrival.delay && arrival.delay > 60) {
    const delayMins = Math.round(arrival.delay / 60)
    const raw = `+${delayMins}m late`
    terminalDisplay = raw.length > TERMINAL_WIDTH
      ? raw.slice(0, TERMINAL_WIDTH - 1) + '.'
      : raw.padEnd(TERMINAL_WIDTH, ' ')
  } else {
    // Abbreviation lookup first, then fixed-width pad/truncate
    const raw = TERMINAL_ABBREVS[arrival.terminal] ?? arrival.terminal
    terminalDisplay = raw.length > TERMINAL_WIDTH
      ? raw.slice(0, TERMINAL_WIDTH - 1) + '.'
      : raw.padEnd(TERMINAL_WIDTH, ' ')
  }

  const soon = isArrivingSoon(arrival.arrivalTime, now)
  const marker = soon ? '▶' : ' '

  const left = `${marker}${badge} ${terminalDisplay}`
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
 * Schedule-fallback lines for a direction with no live trains.
 * NYC subway only: "every ~N min (sched)" per route from the bundled
 * headway table. Returns ['  No live data'] for other systems and
 * ['  No scheduled service'] when nothing runs at this hour.
 * Stateless per render — live data replaces it on the next good fetch.
 */
function noLiveDataLines(station: Station): { lines: string[]; usedSched: boolean } {
  if (station.system && station.system !== 'nyc-subway') {
    return { lines: ['  No live data'], usedSched: false }
  }
  const lines: string[] = []
  for (const route of station.routes.slice(0, MAX_TRAINS)) {
    const h = scheduledHeadway(route)
    if (h !== null) lines.push(` [${route}] every ~${h} min (sched)`)
  }
  if (lines.length === 0) return { lines: ['  No scheduled service'], usedSched: false }
  return { lines, usedSched: true }
}

/**
 * Collect all route IDs present in an arrivals object.
 */
function routeIdsFromArrivals(arrivals: StationArrivals): string[] {
  const ids = new Set<string>()
  for (const t of arrivals.north) ids.add(t.route)
  for (const t of arrivals.south) ids.add(t.route)
  return Array.from(ids)
}

/**
 * Render the body text container content.
 * Shows both directions with train arrivals, progress bar, and control hint.
 * When alerts exist for routes at this station, footer hint changes to
 * reflect tap-to-view-alerts behavior.
 */
export function renderBody(
  station: Station,
  arrivals: StationArrivals,
  stationIndex: number,
  totalStations: number,
  alerts: Map<string, RouteAlert[]>,
  outageCount = 0
): string {
  const system = getSystem(station.system)
  if (system.layout === 'departure-board') {
    return renderDepartureBoard(station, arrivals, stationIndex, totalStations)
  }

  const now = Math.floor(Date.now() / 1000)
  const lines: string[] = []

  // Non-subway directional systems carry route IDs that need display
  // mapping (e.g. MBTA "Green-B" stays, but MSP "901" → "Blue").
  const mapRoute = (t: TrainArrival): TrainArrival =>
    station.system && station.system !== 'nyc-subway'
      ? { ...t, route: routeDisplayName(station.system, t.route) }
      : t

  let usedSched = false

  // North direction
  const northTrains = arrivals.north.slice(0, MAX_TRAINS).map(mapRoute)
  const northLabel = directionLabel(northTrains, station.north)
  lines.push(`▲ ${northLabel}`)

  const northBorough = getBoroughCode(northLabel)
  if (northBorough) lines.push(northBorough)

  if (northTrains.length === 0) {
    const fallback = noLiveDataLines(station)
    lines.push(...fallback.lines)
    usedSched = usedSched || fallback.usedSched
  } else {
    for (const t of northTrains) {
      lines.push(formatTrainLine(t, now, alerts))
    }
  }

  // Solid heavy divider between directions
  lines.push('━'.repeat(DIVIDER_WIDTH))

  // South direction
  const southTrains = arrivals.south.slice(0, MAX_TRAINS).map(mapRoute)
  const southLabel = directionLabel(southTrains, station.south)
  lines.push(`▼ ${southLabel}`)

  const southBorough = getBoroughCode(southLabel)
  if (southBorough) lines.push(southBorough)

  if (southTrains.length === 0) {
    const fallback = noLiveDataLines(station)
    lines.push(...fallback.lines)
    usedSched = usedSched || fallback.usedSched
  } else {
    for (const t of southTrains) {
      lines.push(formatTrainLine(t, now, alerts))
    }
  }

  // Progress bar
  if (totalStations > 1) {
    const pos = `${stationIndex + 1}/${totalStations}`
    const barTotal = DIVIDER_WIDTH - pos.length - 1
    const filled = Math.max(
      1,
      Math.round((barTotal * (stationIndex + 1)) / totalStations)
    )
    const empty = barTotal - filled
    const bar = '━'.repeat(filled) + '─'.repeat(empty)
    lines.push(bar + ' ' + pos)

  }

  // Footer: schedule-fallback warning beats stale warning beats normal hint.
  // Equipment outages count as notices — they flip the hint to tap:alerts.
  const routeIds = routeIdsFromArrivals(arrivals)
  const hasAlerts = routeIds.some(id => routeHasAlert(alerts, id)) || outageCount > 0
  const ageSecs = now - arrivals.fetchedAt
  if (usedSched) {
    lines.push(hasAlerts
      ? '! sched est.  tap:alerts  dbl:exit'
      : '! sched est.  tap:refresh  dbl:exit')
  } else if (ageSecs > 120) {
    const ageMin = Math.floor(ageSecs / 60)
    lines.push(hasAlerts
      ? `! ${ageMin}m old  tap:alerts  dbl:exit`
      : `! ${ageMin}m old  tap:refresh  dbl:exit`)
  } else {
    const fetchStr = formatClockTime(new Date(arrivals.fetchedAt * 1000))
    lines.push(hasAlerts ? `${fetchStr}  tap:alerts  dbl:exit` : `${fetchStr}  tap:refresh  dbl:exit`)
  }

  return lines.join('\n')
}

// ── Departure board (commuter rail: LIRR / Metro-North) ──

/** Max departures shown on a departure board (single list, no direction split). */
const MAX_DEPARTURES = 6

/** Departure-board terminal column width (narrower than subway: track column needs room). */
const BOARD_TERMINAL_WIDTH = 12

/**
 * Abbreviate a branch/route display name to a 4-char badge.
 * Multi-word: first letter + first 3 of second word ("Port Jefferson" → "PJEF").
 * Single word: first 4 ("Ronkonkoma" → "RONK").
 */
export function branchAbbrev(display: string): string {
  const words = display.toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(/\s+/).filter(Boolean)
  if (words.length === 0) return '????'
  if (words.length >= 2) return (words[0][0] + words[1].slice(0, 3))
  return words[0].slice(0, 4)
}

/**
 * Render the commuter-rail departure board: one time-sorted list with
 * branch badges and track numbers. Tracks are dim "--" until the MTARR
 * extension posts them (~10 min before departure at terminals).
 *
 *   DEPARTURES
 *   ▶[RONK] Ronkonkoma   Trk 18  12m-10:36
 *    [BABL] +4m late     Trk --  19m-10:43
 *   ━━━━━━━━━━━━━━━ 3/5
 *   10:23a  tap:refresh  dbl:exit
 */
function renderDepartureBoard(
  station: Station,
  arrivals: StationArrivals,
  stationIndex: number,
  totalStations: number
): string {
  const now = Math.floor(Date.now() / 1000)
  const systemId = station.system ?? 'nyc-subway'
  const lines: string[] = []

  lines.push('DEPARTURES')

  // Arrivals collection put everything in `north` for departure-board systems.
  const departures = arrivals.north.slice(0, MAX_DEPARTURES)

  if (departures.length === 0) {
    lines.push('  No live data')
  } else {
    for (const t of departures) {
      const badge = `[${branchAbbrev(routeDisplayName(systemId, t.route))}]`
      // Delay notice replaces the terminal name, same convention as subway.
      const rawTerminal = t.delay && t.delay > 60
        ? `+${Math.round(t.delay / 60)}m late`
        : t.terminal
      const terminal = rawTerminal.length > BOARD_TERMINAL_WIDTH
        ? rawTerminal.slice(0, BOARD_TERMINAL_WIDTH - 1) + '.'
        : rawTerminal.padEnd(BOARD_TERMINAL_WIDTH, ' ')
      const track = t.track ? `Trk ${t.track}`.padEnd(6, ' ').slice(0, 6) : 'Trk --'
      const mins = minutesUntil(t.arrivalTime, now)
      const clock = formatArrival(t.arrivalTime, now).split(' - ')[1] ?? ''
      const time = mins === 0 ? `NOW ${clock}` : `${mins}m-${clock}`
      const marker = isArrivingSoon(t.arrivalTime, now) ? '▶' : ' '

      const left = `${marker}${badge} ${terminal} ${track}`
      const gap = Math.max(1, CHARS_PER_LINE - left.length - time.length)
      lines.push(left + ' '.repeat(gap) + time)
    }
  }

  // Progress bar — same as the directional layout
  if (totalStations > 1) {
    const pos = `${stationIndex + 1}/${totalStations}`
    const barTotal = DIVIDER_WIDTH - pos.length - 1
    const filled = Math.max(1, Math.round((barTotal * (stationIndex + 1)) / totalStations))
    const bar = '━'.repeat(filled) + '─'.repeat(barTotal - filled)
    lines.push(bar + ' ' + pos)
  }

  // Footer — no alert toggle for railroads (alerts feed is subway-only)
  const ageSecs = now - arrivals.fetchedAt
  if (ageSecs > 120) {
    lines.push(`! ${Math.floor(ageSecs / 60)}m old  tap:refresh  dbl:exit`)
  } else {
    const fetchStr = formatClockTime(new Date(arrivals.fetchedAt * 1000))
    lines.push(`${fetchStr}  tap:refresh  dbl:exit`)
  }

  return lines.join('\n')
}

// ── Glance mode (high-readability big numbers) ──

/**
 * 3-row ASCII block digits. Plain ASCII (underscore/pipe/space) is the
 * only glyph set guaranteed in the G2 LVGL font — SDK 0.0.10 exposes no
 * per-container font size, so "big" text is built from rows.
 */
const DIGIT_ROWS: Record<string, [string, string, string]> = {
  '0': [' _ ', '| |', '|_|'],
  '1': ['   ', '  |', '  |'],
  '2': [' _ ', ' _|', '|_ '],
  '3': [' _ ', ' _|', ' _|'],
  '4': ['   ', '|_|', '  |'],
  '5': [' _ ', '|_ ', ' _|'],
  '6': [' _ ', '|_ ', '|_|'],
  '7': [' _ ', '  |', '  |'],
  '8': [' _ ', '|_|', '|_|'],
  '9': [' _ ', '|_|', ' _|'],
  '-': ['   ', ' _ ', '   '],
}

/** Render a short string ("12", "--") as three rows of block digits. */
export function bigNumberRows(text: string): [string, string, string] {
  const rows: [string, string, string] = ['', '', '']
  for (const ch of text) {
    const glyph = DIGIT_ROWS[ch] ?? ['   ', '   ', '   ']
    for (let i = 0; i < 3; i++) rows[i] += glyph[i] + ' '
  }
  return rows
}

/**
 * Glance mode body: one giant next-train countdown per direction
 * (or per departure list for commuter rail). 9 lines total.
 *
 *   ▲ Uptown [1]
 *      _
 *     | |  min      ← 3-row digits
 *     |_|
 *   ▼ Downtown [2]
 *   ...
 *   tap:detail  dbl:exit
 */
export function renderGlanceBody(
  station: Station,
  arrivals: StationArrivals
): string {
  const now = Math.floor(Date.now() / 1000)
  const systemId = station.system ?? 'nyc-subway'
  const system = getSystem(station.system)
  const lines: string[] = []

  const sections: Array<{ arrow: string; label: string; next?: TrainArrival }> =
    system.layout === 'departure-board'
      ? [{
          arrow: '▶',
          label: 'Next departure',
          next: arrivals.north[0],
        }]
      : [
          {
            arrow: '▲',
            label: directionLabel(arrivals.north.slice(0, MAX_TRAINS), station.north),
            next: arrivals.north[0],
          },
          {
            arrow: '▼',
            label: directionLabel(arrivals.south.slice(0, MAX_TRAINS), station.south),
            next: arrivals.south[0],
          },
        ]

  for (const sec of sections) {
    const badge = sec.next
      ? ` [${routeDisplayName(systemId, sec.next.route)}]`
      : ''
    lines.push(`${sec.arrow} ${sec.label}${badge}`)
    const minsText = sec.next
      ? String(Math.min(99, minutesUntil(sec.next.arrivalTime, now)))
      : '--'
    const rows = bigNumberRows(minsText)
    lines.push(`  ${rows[0]}`)
    lines.push(`  ${rows[1]}  min`)
    lines.push(`  ${rows[2]}`)
  }

  lines.push('tap:detail  dbl:exit')
  return lines.join('\n')
}

/**
 * Render the alert summary view.
 * Shown when user taps while alerts are active.
 * Max 4 alerts displayed; each truncated to fit ~80 chars total per entry.
 */
export function renderAlertSummary(
  arrivals: StationArrivals,
  alerts: Map<string, RouteAlert[]>,
  outages: EquipmentOutage[] = []
): string {
  const lines: string[] = []
  lines.push('! SERVICE ALERTS')
  lines.push('━'.repeat(DIVIDER_WIDTH))

  // Equipment outages render first — they're station-specific while
  // route alerts may apply system-wide. Cap entries so the combined
  // view stays within the display budget.
  const outageEntries = outages.slice(0, 2)
  for (const o of outageEntries) {
    const badge = o.equipmentType === 'EL' ? '[ELEV]' : '[ESC]'
    const desc = o.serving || 'out of service'
    const maxFirst = CHARS_PER_LINE - badge.length - 1
    if (desc.length <= maxFirst) {
      lines.push(`${badge} ${desc}`)
    } else {
      lines.push(`${badge} ${desc.slice(0, maxFirst)}`)
      const rest = desc.slice(maxFirst)
      lines.push(`    ${rest.length > CHARS_PER_LINE - 5 ? rest.slice(0, CHARS_PER_LINE - 6) + '.' : rest}`)
    }
  }

  const routeIds = routeIdsFromArrivals(arrivals)
  const activeAlerts = alertsForRoutes(alerts, routeIds).slice(0, 4 - outageEntries.length)

  if (activeAlerts.length === 0 && outageEntries.length === 0) {
    lines.push('  No active alerts.')
  } else {
    for (const alert of activeAlerts) {
      const badge = `[${alert.routeId}]`
      // Split header text across two lines if needed
      const maxFirst = CHARS_PER_LINE - badge.length - 1
      const header = alert.headerText
      if (header.length <= maxFirst) {
        lines.push(`${badge} ${header}`)
      } else {
        lines.push(`${badge} ${header.slice(0, maxFirst)}`)
        const rest = header.slice(maxFirst)
        const cont = rest.length > CHARS_PER_LINE - 4
          ? rest.slice(0, CHARS_PER_LINE - 5) + '.'
          : rest
        lines.push(`    ${cont}`)
      }
    }
  }

  lines.push('━'.repeat(DIVIDER_WIDTH))
  lines.push('tap:trains  dbl:exit')

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
