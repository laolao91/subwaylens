/**
 * Transit system registry.
 *
 * Every system SubwayLens can display, with its realtime feeds, layout,
 * and parsing strategy. One *region* is active at a time (settings.regionId);
 * a region groups the systems shown together (NYC = subway + LIRR + MNR).
 *
 * All feeds verified keyless 2026-06-09 (see docs/DESIGN-v1.7.0.md).
 *
 * directionStrategy:
 *   'stop-suffix'  — MTA subway: direction encoded in the stop ID suffix (A03N/A03S)
 *   'direction-id' — standard GTFS: direction from trip.directionId (0→N, 1→S)
 *
 * layout:
 *   'directional'     — two direction sections (▲/▼), the classic subway view
 *   'departure-board' — single time-sorted list with track numbers (commuter rail)
 */

export interface TransitSystem {
  id: string
  regionId: string
  name: string
  layout: 'directional' | 'departure-board'
  directionStrategy: 'stop-suffix' | 'direction-id'
  /** Realtime GTFS-RT trip-update feed URLs. Empty for nyc-subway (per-route via feed-urls.ts). */
  feedUrls: string[]
  /** Route IDs to include (mixed bus+rail feeds); undefined = all routes. */
  routeFilter?: string[]
  /** Floor for the auto-refresh interval — 60 for heavy feeds (≥500KB). */
  minRefreshSecs: number
  /** True when track numbers ride the MTARR extension (LIRR/MNR). */
  hasTrackData?: boolean
}

export interface TransitRegion {
  id: string
  name: string
  systems: string[]
}

export const SYSTEMS: TransitSystem[] = [
  {
    id: 'nyc-subway',
    regionId: 'nyc',
    name: 'NYC Subway',
    layout: 'directional',
    directionStrategy: 'stop-suffix',
    feedUrls: [], // resolved per-route via feed-urls.ts
    minRefreshSecs: 15,
  },
  {
    id: 'lirr',
    regionId: 'nyc',
    name: 'Long Island Rail Road',
    layout: 'departure-board',
    directionStrategy: 'direction-id',
    feedUrls: ['https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr%2Fgtfs-lirr'],
    minRefreshSecs: 15,
    hasTrackData: true,
  },
  {
    id: 'mnr',
    regionId: 'nyc',
    name: 'Metro-North Railroad',
    layout: 'departure-board',
    directionStrategy: 'direction-id',
    feedUrls: ['https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/mnr%2Fgtfs-mnr'],
    minRefreshSecs: 15,
    hasTrackData: true,
  },
  {
    id: 'bart',
    regionId: 'sf',
    name: 'BART',
    layout: 'directional',
    directionStrategy: 'direction-id',
    feedUrls: ['https://api.bart.gov/gtfsrt/tripupdate.aspx'],
    minRefreshSecs: 15,
  },
  {
    id: 'septa-rail',
    regionId: 'philly',
    name: 'SEPTA Regional Rail',
    layout: 'departure-board',
    directionStrategy: 'direction-id',
    feedUrls: ['https://www3.septa.org/gtfsrt/septarail-pa-us/Trip/rtTripUpdates.pb'],
    minRefreshSecs: 15,
  },
  {
    id: 'rtd',
    regionId: 'denver',
    name: 'Denver RTD Rail',
    layout: 'directional',
    directionStrategy: 'direction-id',
    feedUrls: ['https://nodejs-prod.rtd-denver.com/api/download/gtfs-rt/TripUpdate.pb'],
    // Rail lines only — feed also carries every RTD bus route.
    routeFilter: ['A', 'B', 'D', 'E', 'G', 'H', 'L', 'N', 'R', 'W'],
    minRefreshSecs: 15,
  },
  {
    id: 'mbta',
    regionId: 'boston',
    name: 'MBTA',
    layout: 'directional',
    directionStrategy: 'direction-id',
    feedUrls: ['https://cdn.mbta.com/realtime/TripUpdates.pb'],
    // Subway + light rail + commuter rail; excludes bus routes (numeric IDs).
    // Populated from the generated station pack's route set at load time —
    // see registerSystemRouteFilter().
    minRefreshSecs: 60,
  },
  {
    id: 'msp',
    regionId: 'msp',
    name: 'Metro Transit (MSP)',
    layout: 'directional',
    directionStrategy: 'direction-id',
    feedUrls: ['https://svc.metrotransit.org/mtgtfs/tripupdates.pb'],
    minRefreshSecs: 60,
  },
  {
    id: 'marta',
    regionId: 'atlanta',
    name: 'MARTA Rail',
    layout: 'directional',
    directionStrategy: 'direction-id',
    feedUrls: ['https://gtfs-rt.itsmarta.com/TMGTFSRealTimeWebService/tripupdate/tripupdates.pb'],
    minRefreshSecs: 60,
  },
]

export const REGIONS: TransitRegion[] = [
  { id: 'nyc', name: 'New York (Subway · LIRR · Metro-North)', systems: ['nyc-subway', 'lirr', 'mnr'] },
  { id: 'sf', name: 'SF Bay Area (BART)', systems: ['bart'] },
  { id: 'boston', name: 'Boston (MBTA rail)', systems: ['mbta'] },
  { id: 'philly', name: 'Philadelphia (SEPTA Regional Rail)', systems: ['septa-rail'] },
  { id: 'denver', name: 'Denver (RTD rail)', systems: ['rtd'] },
  { id: 'atlanta', name: 'Atlanta (MARTA rail)', systems: ['marta'] },
  { id: 'msp', name: 'Minneapolis-St Paul (METRO)', systems: ['msp'] },
]

const systemById = new Map(SYSTEMS.map((s) => [s.id, s]))

/** Look up a system; stations without a system field are NYC subway. */
export function getSystem(id: string | undefined): TransitSystem {
  return systemById.get(id ?? 'nyc-subway') ?? systemById.get('nyc-subway')!
}

export function getRegion(id: string): TransitRegion {
  return REGIONS.find((r) => r.id === id) ?? REGIONS[0]
}

/**
 * Route filters discovered from generated station packs at load time.
 * For mixed bus+rail feeds where the rail route set lives in the pack
 * (MBTA, MSP) rather than hardcoded above.
 */
export function registerSystemRouteFilter(systemId: string, routes: string[]): void {
  const sys = systemById.get(systemId)
  if (sys && !sys.routeFilter) sys.routeFilter = routes
}
