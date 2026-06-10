/**
 * Alert parsing tests against a captured live feed
 * (src/data/__fixtures__/alerts.pb, 2026-06-10).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fetchAlerts, clearAlertsCache, alertsForRoutes } from './alerts'

const raw = new Uint8Array(readFileSync(join(__dirname, '__fixtures__', 'alerts.pb')))

beforeEach(() => {
  clearAlertsCache()
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    arrayBuffer: async () => raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
  })) as unknown as typeof fetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchAlerts (live fixture)', () => {
  it('parses alerts keyed by route with non-empty headers', async () => {
    const alerts = await fetchAlerts()
    expect(alerts.size).toBeGreaterThan(0)
    for (const [routeId, list] of alerts) {
      expect(routeId.length).toBeGreaterThan(0)
      for (const a of list) {
        expect(a.headerText.length).toBeGreaterThan(0)
        expect(a.headerText.length).toBeLessThanOrEqual(60)
      }
      break
    }
  })

  it('sorts each route list by ascending severity (effect)', async () => {
    const alerts = await fetchAlerts()
    for (const list of alerts.values()) {
      for (let i = 1; i < list.length; i++) {
        expect(list[i].effect).toBeGreaterThanOrEqual(list[i - 1].effect)
      }
    }
  })

  it('uses the cache on a second call (no second fetch)', async () => {
    await fetchAlerts()
    await fetchAlerts()
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
  })

  it('alertsForRoutes dedupes to one alert per route', async () => {
    const alerts = await fetchAlerts()
    const ids = [...alerts.keys()]
    const result = alertsForRoutes(alerts, ids)
    const seen = new Set(result.map((a) => a.routeId))
    expect(seen.size).toBe(result.length)
  })
})
