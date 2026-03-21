/**
 * Settings panel — refresh interval, nearby stations toggle, nearby radius.
 * Uses even-toolkit SegmentedControl for multi-option pickers
 * and Toggle for the on/off switch.
 */

import { SegmentedControl, Toggle, SettingsGroup } from 'even-toolkit/web'
import type { AppSettings } from '../lib/types'

interface SettingsPanelProps {
  settings: AppSettings
  onChange: (settings: AppSettings) => void
}

const REFRESH_OPTIONS = [
  { value: '15', label: '15s' },
  { value: '30', label: '30s' },
  { value: '60', label: '60s' },
  { value: '120', label: '2m' },
]

const RADIUS_OPTIONS = [
  { value: '0.1', label: '0.1 mi' },
  { value: '0.25', label: '0.25 mi' },
  { value: '0.5', label: '0.5 mi' },
  { value: '1', label: '1.0 mi' },
]

export function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* Refresh Interval */}
      <SettingsGroup label="Refresh interval">
        <div className="bg-surface p-4 rounded-[6px]">
          <SegmentedControl
            options={REFRESH_OPTIONS}
            value={String(settings.refreshInterval)}
            onValueChange={(val) =>
              onChange({ ...settings, refreshInterval: parseInt(val, 10) })
            }
            size="small"
            className="w-full"
          />
        </div>
      </SettingsGroup>

      {/* Nearby Stations */}
      <SettingsGroup label="Nearby stations">
        <div className="bg-surface p-4 rounded-[6px] flex items-center justify-between">
          <span className="text-[15px] tracking-[-0.15px] text-text">
            Show nearby stations
          </span>
          <Toggle
            checked={settings.nearbyEnabled}
            onChange={(checked) =>
              onChange({ ...settings, nearbyEnabled: checked })
            }
          />
        </div>
      </SettingsGroup>

      {/* Nearby Radius (hidden when nearby is off) */}
      {settings.nearbyEnabled && (
        <SettingsGroup label="Nearby radius">
          <div className="bg-surface p-4 rounded-[6px]">
            <SegmentedControl
              options={RADIUS_OPTIONS}
              value={String(settings.nearbyRadius)}
              onValueChange={(val) =>
                onChange({ ...settings, nearbyRadius: parseFloat(val) })
              }
              size="small"
              className="w-full"
            />
          </div>
        </SettingsGroup>
      )}
    </div>
  )
}