import { describe, it, expect } from 'vitest'
import { renderLoading, renderNoStations, formatDirectionLine } from './display'

// Note: renderHeader and renderBody require Station / StationArrivals objects
// which pull in the full stations.json bundle. These pure-function tests cover
// the simpler renderers and serve as a regression baseline for future additions.

describe('renderLoading', () => {
  it('returns a non-empty string', () => {
    expect(renderLoading().length).toBeGreaterThan(0)
  })

  it('contains loading message', () => {
    expect(renderLoading()).toContain('Loading')
  })
})

describe('renderNoStations', () => {
  it('returns a non-empty string', () => {
    expect(renderNoStations().length).toBeGreaterThan(0)
  })

  it('instructs user to open phone settings', () => {
    const text = renderNoStations()
    expect(text).toContain('phone')
    expect(text).toContain('stations')
  })
})

describe('formatDirectionLine', () => {
  it('returns just the label when there is no borough code', () => {
    expect(formatDirectionLine('▲', 'Forest Hills-71 Av', '')).toBe(
      '▲ Forest Hills-71 Av'
    )
  })

  it('appends the borough code when it fits on the line', () => {
    expect(formatDirectionLine('▲', 'Forest Hills-71 Av', 'QNS')).toBe(
      '▲ Forest Hills-71 Av - QNS'
    )
    expect(formatDirectionLine('▼', 'Bay Ridge-95 St', 'BK')).toBe(
      '▼ Bay Ridge-95 St - BK'
    )
  })

  it('keeps the borough code when the combined line exactly hits the line limit', () => {
    // '▲ ' (2) + 30-char label + ' - QNS' (6) = 38, exactly CHARS_PER_LINE.
    const label = 'A'.repeat(30)
    const result = formatDirectionLine('▲', label, 'QNS')
    expect(result).toBe(`▲ ${label} - QNS`)
    expect(result.length).toBe(38)
  })

  it('drops the borough code rather than truncate a long station name', () => {
    // One char longer than the previous case overflows CHARS_PER_LINE (38)
    // by exactly 1 — the name wins, borough is omitted entirely.
    const label = 'A'.repeat(31)
    const result = formatDirectionLine('▲', label, 'QNS')
    expect(result).toBe(`▲ ${label}`)
    expect(result).not.toContain('QNS')
  })
})
