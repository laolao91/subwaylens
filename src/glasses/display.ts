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
import { routeDisplayName } from '../data/arrivals-commuter'

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

/** Max departures shown on a departure board (single list, no direction split). */
const MAX_DEPARTURES = 6

/** Departure-board terminal column width when route badges are short (<=3 chars). */
const BOARD_TERMINAL_WIDTH_WIDE = 15

/** Departure-board terminal column width when any route badge exceeds 3 chars
 *  (track column needs the extra room — same rule validated in the v1.7.0 mockup). */
const BOARD_TERMINAL_WIDTH_NARROW = 12

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
export function renderHeader(station: Station, isFavorite: boolean): string {
  const star = isFavorite ? ' ★' : ''
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
 * Format a direction-arrow line, appending the borough code only if it
 * fits within CHARS_PER_LINE. Preserves the full station/terminal name
 * over the borough tag when space is tight, rather than truncating it.
 */
export function formatDirectionLine(
  arrow: string,
  label: string,
  borough: string
): string {
  const base = `${arrow} ${label}`
  if (!borough) return base
  const withBorough = `${base} - ${borough}`
  return withBorough.length <= CHARS_PER_LINE ? withBorough : base
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
  alerts: Map<string, RouteAlert[]>
): string {
  const now = Math.floor(Date.now() / 1000)
  const lines: string[] = []

  // North direction
  const northTrains = arrivals.north.slice(0, MAX_TRAINS)
  const northLabel = directionLabel(northTrains, station.north)
  lines.push(formatDirectionLine('▲', northLabel, getBoroughCode(northLabel)))

  if (northTrains.length === 0) {
    lines.push('  No live data')
  } else {
    for (const t of northTrains) {
      lines.push(formatTrainLine(t, now, alerts))
    }
  }

  // Light divider between directions (thinner than the heavy ━ used
  // for the progress bar's filled portion, where weight is meaningful).
  lines.push('─'.repeat(DIVIDER_WIDTH))

  // South direction
  const southTrains = arrivals.south.slice(0, MAX_TRAINS)
  const southLabel = directionLabel(southTrains, station.south)
  lines.push(formatDirectionLine('▼', southLabel, getBoroughCode(southLabel)))

  if (southTrains.length === 0) {
    lines.push('  No live data')
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

  // Footer: stale warning when data is > 2 min old; otherwise normal control hint.
  const routeIds = routeIdsFromArrivals(arrivals)
  const hasAlerts = routeIds.some(id => routeHasAlert(alerts, id))
  const ageSecs = Math.floor(Date.now() / 1000) - arrivals.fetchedAt
  if (ageSecs > 120) {
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

/**
 * Render the alert summary view.
 * Shown when user taps while alerts are active.
 * Max 4 alerts displayed; each truncated to fit ~80 chars total per entry.
 */
export function renderAlertSummary(
  arrivals: StationArrivals,
  alerts: Map<string, RouteAlert[]>
): string {
  const lines: string[] = []
  lines.push('! SERVICE ALERTS')
  lines.push('━'.repeat(DIVIDER_WIDTH))

  const routeIds = routeIdsFromArrivals(arrivals)
  const activeAlerts = alertsForRoutes(alerts, routeIds).slice(0, 4)

  if (activeAlerts.length === 0) {
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

const MENU_OPTIONS = ['Nearest Station', 'Favorites', 'Delays'] as const

/**
 * Render the launch menu body.
 * cursor: 0=Nearest, 1=Favorites, 2=Delays.
 * When nearbyEnabled is false the Nearest option is shown as unselectable.
 */
export function renderMenu(cursor: number, nearbyEnabled: boolean): string {
  const lines: string[] = []
  lines.push('━'.repeat(DIVIDER_WIDTH))
  MENU_OPTIONS.forEach((label, i) => {
    const marker = i === cursor ? '▶' : ' '
    if (i === 0 && !nearbyEnabled) {
      lines.push(`${marker} Nearest Station  (GPS off)`)
    } else {
      lines.push(`${marker} ${label}`)
    }
  })
  lines.push('━'.repeat(DIVIDER_WIDTH))
  lines.push('scroll:select  tap:enter  dbl:exit')
  return lines.join('\n')
}

/**
 * Render the Delays view body.
 *
 * Top section: system-wide MTA service alerts (up to 4).
 * Bottom section: trains running ≥5 min late at the user's stations.
 * stationEntries: favorites + nearest non-favorite, each with cached arrivals
 * and an isNearby flag that controls the "(nearby)" label.
 */
export function renderDelays(
  alerts: Map<string, RouteAlert[]>,
  stationEntries: Array<{ station: Station; arrivals: StationArrivals; isNearby: boolean }>,
  now: number
): string {
  const lines: string[] = []
  lines.push('! DELAYS & ALERTS')
  lines.push('━'.repeat(DIVIDER_WIDTH))

  const DELAY_THRESHOLD = 300

  // ── Service alerts ──
  const allAlerts = Array.from(alerts.values()).flat().slice(0, 4)
  if (allAlerts.length === 0) {
    lines.push('  No active alerts')
  } else {
    for (const alert of allAlerts) {
      const badge = `[${alert.routeId}]`
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

  // ── Per-station delays (≥5 min) ──
  const delayed: Array<{ route: string; label: string; delayMins: number }> = []
  for (const { station, arrivals, isNearby } of stationEntries) {
    const allTrains = [...arrivals.north, ...arrivals.south]
    for (const train of allTrains) {
      if ((train.delay ?? 0) >= DELAY_THRESHOLD) {
        const stationLabel = isNearby ? `${station.name} (nearby)` : station.name
        delayed.push({
          route: train.route,
          label: stationLabel,
          delayMins: Math.round((train.delay ?? 0) / 60),
        })
      }
    }
  }

  if (delayed.length > 0) {
    lines.push('━'.repeat(DIVIDER_WIDTH))
    lines.push('  At your stations:')
    for (const d of delayed.slice(0, 6)) {
      const badge = `[${d.route}]`
      const text = `+${d.delayMins}m late`
      const nameMax = CHARS_PER_LINE - badge.length - text.length - 4
      const name = d.label.length > nameMax ? d.label.slice(0, nameMax - 1) + '.' : d.label
      lines.push(`${badge} ${name}  ${text}`)
    }
  }

  lines.push('━'.repeat(DIVIDER_WIDTH))
  const fetchStr = formatClockTime(new Date(now * 1000))
  lines.push(`${fetchStr}  tap:refresh  dbl:menu`)
  return lines.join('\n')
}

/**
 * Abbreviate a branch/route display name to a compact badge.
 * Multi-word: first letter + first 3 of second word ("Port Jefferson" → "PJEF").
 * Single word: first 4 ("Ronkonkoma" → "RONK").
 */
function branchAbbrev(display: string): string {
  const words = display.toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(/\s+/).filter(Boolean)
  if (words.length === 0) return '????'
  if (words.length >= 2) return words[0][0] + words[1].slice(0, 3)
  return words[0].slice(0, 4)
}

/**
 * Render the commuter-rail departure board: one time-sorted list with
 * branch badges and track numbers. Tracks show "Trk --" until the MTARR
 * extension posts them (~10 min before departure at terminals). The
 * terminal column shrinks from 15 to 12 chars when any visible badge
 * exceeds 3 chars, making room for the track field — same rule as the
 * validated v1.7.0 mockup:
 *
 *   Penn Station LIRR ★           10:24a
 *   DEPARTURES
 *   ▶[RONK] Ronkonkoma   Trk 18  12m-10:36
 *    [PJEF] Pt Jefferson Trk 20  +4m late
 *    [BABL] Babylon      Trk 15  19m-10:43
 *    [HEMP] Hempstead    Trk --  24m-10:48
 *   ━━━━━━━━━━━━━━━ 3/5
 *   10:23a  tap:refresh  dbl:exit
 *
 * Sorts by arrivalTime ascending before display — callers (e.g. the live
 * fetch path in arrivals-commuter.ts) already sort, but this function
 * sorts defensively so the rendered order is correct regardless of input.
 */
export function renderDepartureBoard(
  station: Station,
  arrivals: StationArrivals
): string {
  const now = Math.floor(Date.now() / 1000)
  const system = station.system === 'mnr' ? 'mnr' : 'lirr'
  const lines: string[] = []

  lines.push('DEPARTURES')

  const departures = [...arrivals.north]
    .sort((a, b) => a.arrivalTime - b.arrivalTime)
    .slice(0, MAX_DEPARTURES)

  if (departures.length === 0) {
    lines.push('  No live data')
  } else {
    const badges = departures.map((t) => branchAbbrev(routeDisplayName(system, t.route)))
    const terminalWidth = badges.some((b) => b.length > 3)
      ? BOARD_TERMINAL_WIDTH_NARROW
      : BOARD_TERMINAL_WIDTH_WIDE

    departures.forEach((t, i) => {
      const badge = `[${badges[i]}]`
      const rawTerminal = t.delay && t.delay > 60
        ? `+${Math.round(t.delay / 60)}m late`
        : t.terminal
      const terminal = rawTerminal.length > terminalWidth
        ? rawTerminal.slice(0, terminalWidth - 1) + '.'
        : rawTerminal.padEnd(terminalWidth, ' ')
      const track = t.track ? `Trk ${t.track}`.padEnd(6, ' ').slice(0, 6) : 'Trk --'
      const mins = minutesUntil(t.arrivalTime, now)
      const clock = formatArrival(t.arrivalTime, now).split(' - ')[1] ?? formatArrival(t.arrivalTime, now).replace('NOW ', '')
      const time = mins === 0 ? `NOW ${clock}` : `${mins}m-${clock}`
      const marker = isArrivingSoon(t.arrivalTime, now) ? '▶' : ' '

      const left = `${marker}${badge} ${terminal} ${track}`
      const gap = Math.max(1, CHARS_PER_LINE - left.length - time.length)
      lines.push(left + ' '.repeat(gap) + time)
    })
  }

  // Footer — no alert toggle for commuter rail (alerts feed is subway-only).
  const ageSecs = now - arrivals.fetchedAt
  if (ageSecs > 120) {
    lines.push(`! ${Math.floor(ageSecs / 60)}m old  tap:refresh  dbl:exit`)
  } else {
    const fetchStr = formatClockTime(new Date(arrivals.fetchedAt * 1000))
    lines.push(`${fetchStr}  tap:refresh  dbl:exit`)
  }

  return lines.join('\n')
}
