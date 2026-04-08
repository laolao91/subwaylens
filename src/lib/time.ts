/**
 * Time formatting helpers for glasses display.
 *
 * Format: "Nm H:MM" — compact form saves ~4 chars per train line.
 * "NOW H:MM" shown when a train is under 1 minute away.
 */

/**
 * Format an arrival as "Nm H:MM" (e.g. "3m 10:24").
 * Returns "NOW H:MM" if less than 1 minute away.
 */
export function formatArrival(arrivalTime: number, now?: number): string {
  const currentTime = now ?? Math.floor(Date.now() / 1000)
  const diffSec = arrivalTime - currentTime
  const mins = Math.max(0, Math.round(diffSec / 60))

  const date = new Date(arrivalTime * 1000)
  const h = date.getHours()
  const m = date.getMinutes().toString().padStart(2, '0')
  const hour12 = h % 12 || 12
  const clock = `${hour12}:${m}`

  if (mins === 0) return `NOW ${clock}`
  return `${mins}m - ${clock}`
}

/**
 * Get just the minutes-until value.
 */
export function minutesUntil(arrivalTime: number, now?: number): number {
  const currentTime = now ?? Math.floor(Date.now() / 1000)
  return Math.max(0, Math.round((arrivalTime - currentTime) / 60))
}

/**
 * Check if a train is arriving soon (< 4 minutes).
 */
export function isArrivingSoon(arrivalTime: number, now?: number): boolean {
  return minutesUntil(arrivalTime, now) < 4
}
