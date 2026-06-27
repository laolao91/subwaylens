/**
 * Settings panel — refresh interval, nearby stations toggle, nearby radius,
 * launch behavior (menu toggle + default view).
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

const DEFAULT_VIEW_OPTIONS = [
  { value: 'nearest', label: 'Nearest' },
  { value: 'favorites', label: 'Favorites' },
  { value: 'delays', label: 'Delays' },
]

export function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
  const nearestDisabled = !settings.nearbyEnabled

  return (
    <div className="flex flex-col gap-3">
      {/* Refresh Interval */}
      <SettingsGroup label="Refresh interval">
        <div className="bg-surface p-4 rounded-[6px]">
          <SegmentedControl
            options={REFRESH_OPTIONS}
            value={String(settings.refreshInterval)}
            onValueChange={(val) =>
              onChange({ ...settings, refreshInterval: Number(val) })
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
                onChange({ ...settings, nearbyRadius: Number(val) })
              }
              size="small"
              className="w-full"
            />
          </div>
        </SettingsGroup>
      )}

      {/* Launch Behavior */}
      <SettingsGroup label="Launch behavior">
        <div className="flex flex-col rounded-[6px] overflow-hidden">
          {/* Menu toggle */}
          <div className="bg-surface p-4 flex items-center justify-between border-b border-border">
            <div className="flex flex-col gap-0.5 pr-4">
              <span className="text-[15px] tracking-[-0.15px] text-text">
                Show launch menu
              </span>
              <span className="text-[12px] text-text-dim">
                Choose your starting view each time you open SubwayLens
              </span>
            </div>
            <Toggle
              checked={settings.showLaunchMenu}
              onChange={(checked) =>
                onChange({ ...settings, showLaunchMenu: checked })
              }
            />
          </div>

          {/* Default view picker — always visible */}
          <div className="bg-surface p-4 flex flex-col gap-2">
            <span className="text-[13px] text-text-dim">
              {settings.showLaunchMenu
                ? 'Menu opens with this view pre-selected'
                : 'Opens directly to this view'}
            </span>
            <SegmentedControl
              options={DEFAULT_VIEW_OPTIONS.map((opt) => ({
                ...opt,
                disabled: opt.value === 'nearest' && nearestDisabled,
              }))}
              value={
                settings.defaultView === 'nearest' && nearestDisabled
                  ? 'favorites'
                  : settings.defaultView
              }
              onValueChange={(val) =>
                onChange({
                  ...settings,
                  defaultView: val as AppSettings['defaultView'],
                })
              }
              size="small"
              className="w-full"
            />
            {nearestDisabled && (
              <span className="text-[11px] text-text-dim">
                Enable nearby stations above to use Nearest
              </span>
            )}
          </div>
        </div>
      </SettingsGroup>
    </div>
  )
}
