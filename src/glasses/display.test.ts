import { describe, it, expect } from 'vitest'
import { renderLoading, renderNoStations, renderExitConfirm } from './display'

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

describe('renderExitConfirm', () => {
  it('returns a non-empty string', () => {
    expect(renderExitConfirm().length).toBeGreaterThan(0)
  })

  it('mentions double-tap', () => {
    expect(renderExitConfirm().toLowerCase()).toContain('double-tap')
  })

  it('mentions cancel', () => {
    expect(renderExitConfirm().toLowerCase()).toContain('cancel')
  })
})
