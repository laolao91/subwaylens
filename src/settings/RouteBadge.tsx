/**
 * MTA route badge — colored circle with route letter.
 * Uses official MTA brand colors (not even-toolkit Badge variants).
 */

const ROUTE_COLORS: Record<string, string> = {
  '1': 'red', '2': 'red', '3': 'red',
  '4': 'green', '5': 'green', '6': 'green',
  '7': 'purple',
  A: 'blue', C: 'blue', E: 'blue',
  B: 'orange', D: 'orange', F: 'orange', M: 'orange',
  G: 'lime',
  J: 'brown', Z: 'brown',
  L: 'gray',
  N: 'yellow', Q: 'yellow', R: 'yellow', W: 'yellow',
  S: 'gray', SIR: 'blue',
}

export function routeColor(route: string): string {
  return ROUTE_COLORS[route] || 'gray'
}

interface RouteBadgeProps {
  route: string
}

export function RouteBadge({ route }: RouteBadgeProps) {
  return (
    <span className={`route-badge route-${routeColor(route)}`}>
      {route}
    </span>
  )
}

interface RouteBadgesProps {
  routes: string[]
}

export function RouteBadges({ routes }: RouteBadgesProps) {
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {routes.map((r) => (
        <RouteBadge key={r} route={r} />
      ))}
    </div>
  )
}