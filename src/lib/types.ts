/** A station complex from our bundled station data */
export interface Station {
  id: string
  /**
   * Transit system this station belongs to ('nyc-subway', 'lirr', 'bart', ...).
   * Optional for backwards compat — bundled NYC subway data predates the
   * field; absent means 'nyc-subway'.
   */
  system?: string
  name: string
  stops: string[]    // stop IDs as they appear in the realtime feed (MTA subway: base IDs like "A03")
  routes: string[]   // route IDs (e.g. ["A", "C", "E"] or ["Blue", "Green"])
  lat: number
  lng: number
  north: string      // direction label (subway: "Uptown"; standard GTFS: direction_id 0 label)
  south: string      // direction label (subway: "Downtown"; standard GTFS: direction_id 1 label)
}

/** A single upcoming train arrival */
export interface TrainArrival {
  route: string        // e.g. "E", "F", "7"
  direction: 'N' | 'S' // N=northbound/dir0, S=southbound/dir1; departure-board systems use 'N' only
  stopId: string       // full stop ID e.g. "A03N"
  arrivalTime: number  // Unix timestamp (seconds)
  terminal: string     // last stop name
  delay?: number       // seconds behind schedule (from GTFS-RT, absent when on time)
  track?: string       // LIRR/MNR track assignment (e.g. "18"), absent until posted
}

/** Arrivals grouped for a station */
export interface StationArrivals {
  stationId: string
  north: TrainArrival[]
  south: TrainArrival[]
  fetchedAt: number
}

/** User settings */
export interface AppSettings {
  refreshInterval: number  // seconds (15, 30, 60, 120)
  nearbyEnabled: boolean
  nearbyRadius: number     // miles (0.1, 0.25, 0.5, 1.0)
  hiddenRoutes: Record<string, string[]>  // stationId → route IDs to hide on glasses
  regionId: string         // active transit region ('nyc', 'sf', 'boston', ...), default 'nyc'
}

export const DEFAULT_SETTINGS: AppSettings = {
  refreshInterval: 30,
  nearbyEnabled: true,
  nearbyRadius: 0.25,
  hiddenRoutes: {},
  regionId: 'nyc',
}
