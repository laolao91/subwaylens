import { describe, it, expect, vi } from 'vitest'
import { DeviceStatus, DeviceConnectType } from '@evenrealities/even_hub_sdk'

// main.ts imports ./settings/settings-mount at module scope, which pulls in
// the React settings page tree and even-toolkit/web. even-toolkit's own
// dist/web/index.js re-exports `cn` via an extensionless relative import
// ('./utils/cn' instead of './utils/cn.js'), which Node's native ESM
// resolver (used by Vitest's `environment: 'node'`, set in vite.config.ts,
// unlike Vite's bundler-style dev/build resolution) rejects with
// "Cannot find module". Confirmed by running this test against the
// unmocked import: it fails the whole suite with that exact error.
// Stubbing settings-mount before importing ./main sidesteps that subtree
// entirely — this test file only exercises glasses-mode/auto-refresh
// logic, never the settings page, so the stub is a safe no-op here.
vi.mock('./settings/settings-mount', () => ({
  initSettingsPage: vi.fn(),
}))

const { shouldSkipAutoRefresh } = await import('./main')

// DeviceStatus's real constructor backfills connectType to
// DeviceConnectType.None and isWearing to false when omitted from the
// constructor params — confirmed empirically (`new DeviceStatus({ sn: 'x' })`
// produces `{ connectType: 'none', isWearing: false }`, never `undefined`),
// even though the SDK's .d.ts marks `isWearing?: boolean` optional. To
// exercise shouldSkipAutoRefresh's actual undefined-handling branches (the
// "fail open" cases the spec requires), build a plain object literal typed
// as DeviceStatus instead of going through `new DeviceStatus(...)`.
function makeStatus(overrides: Partial<{
  connectType: DeviceConnectType | undefined
  isWearing: boolean | undefined
}> = {}): DeviceStatus {
  return {
    sn: 'test-sn',
    connectType: overrides.connectType,
    isWearing: overrides.isWearing,
  } as DeviceStatus
}

describe('shouldSkipAutoRefresh', () => {
  it('does not skip when status is null (no status received yet)', () => {
    expect(shouldSkipAutoRefresh(null)).toBe(false)
  })

  it('does not skip when connectType is undefined (fail open)', () => {
    const status = makeStatus({ isWearing: true })
    expect(shouldSkipAutoRefresh(status)).toBe(false)
  })

  it('does not skip when isWearing is undefined (fail open)', () => {
    const status = makeStatus({ connectType: DeviceConnectType.Connected })
    expect(shouldSkipAutoRefresh(status)).toBe(false)
  })

  it('does not skip when connected and wearing', () => {
    const status = makeStatus({
      connectType: DeviceConnectType.Connected,
      isWearing: true,
    })
    expect(shouldSkipAutoRefresh(status)).toBe(false)
  })

  it('skips when disconnected', () => {
    const status = makeStatus({
      connectType: DeviceConnectType.Disconnected,
      isWearing: true,
    })
    expect(shouldSkipAutoRefresh(status)).toBe(true)
  })

  it('skips when connecting (not yet connected)', () => {
    const status = makeStatus({
      connectType: DeviceConnectType.Connecting,
      isWearing: true,
    })
    expect(shouldSkipAutoRefresh(status)).toBe(true)
  })

  it('skips when connectionFailed', () => {
    const status = makeStatus({
      connectType: DeviceConnectType.ConnectionFailed,
      isWearing: true,
    })
    expect(shouldSkipAutoRefresh(status)).toBe(true)
  })

  it('skips when connected but explicitly not wearing', () => {
    const status = makeStatus({
      connectType: DeviceConnectType.Connected,
      isWearing: false,
    })
    expect(shouldSkipAutoRefresh(status)).toBe(true)
  })

  it('does not skip when connected and isWearing is true', () => {
    const status = makeStatus({
      connectType: DeviceConnectType.Connected,
      isWearing: true,
    })
    expect(shouldSkipAutoRefresh(status)).toBe(false)
  })
})
