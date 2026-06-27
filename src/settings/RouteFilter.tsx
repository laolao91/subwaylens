/**
 * Per-station route filter chip row.
 * Renders each of the station's routes as a tappable badge.
 * Hidden routes appear faded; active routes appear at full opacity.
 */

import { routeColor, SystemBadge } from './RouteBadge'

interface RouteFilterProps {
  routes: string[]
  hiddenRoutes: string[]
  onToggle: (route: string) => void
  system?: 'lirr' | 'mnr'
}

export function RouteFilter({ routes, hiddenRoutes, onToggle, system }: RouteFilterProps) {
  if (system === 'lirr' || system === 'mnr') {
    return <SystemBadge system={system} />
  }

  const hiddenSet = new Set(hiddenRoutes)

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {routes.map((route) => {
        const hidden = hiddenSet.has(route)
        return (
          <button
            key={route}
            onClick={() => onToggle(route)}
            title={hidden ? `Show ${route} train` : `Hide ${route} train`}
            className={`route-badge route-${routeColor(route)} transition-opacity select-none cursor-pointer border-0 p-0`}
            style={{ opacity: hidden ? 0.25 : 1 }}
            aria-pressed={!hidden}
            aria-label={`${route} train ${hidden ? '(hidden)' : '(visible)'}`}
          >
            {route}
          </button>
        )
      })}
      {routes.length > 1 && (
        <span className="text-[11px] text-text-dim self-center ml-1">
          tap to hide
        </span>
      )}
    </div>
  )
}
