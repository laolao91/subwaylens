/** A station complex from our bundled station data */
export interface Station {
  id: string
  name: string
  stops: string[]    // base GTFS stop IDs (e.g. ["A03", "127"])
  routes: string[]   // route letters (e.g. ["A", "C", "E"])
  lat: number
  lng: number
  north: string      // direction label (e.g. "Uptown", "Manhattan")
  south: string      // direction label (e.g. "Downtown", "Brooklyn")
  system?: 'lirr' | 'mnr'  // absent = NYC subway; commuter-rail systems set this
}

/** A single upcoming train arrival */
export interface TrainArrival {
  route: string        // e.g. "E", "F", "7"
  direction: 'N' | 'S' // N=northbound/uptown, S=southbound/downtown
  stopId: string       // full stop ID e.g. "A03N"
  arrivalTime: number  // Unix timestamp (seconds)
  terminal: string     // last stop name
  delay?: number       // seconds behind schedule (from GTFS-RT, absent when on time)
  track?: string       // LIRR/MNR track assignment from the MTARR GTFS-RT extension; absent for subway or unposted tracks
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
  showLaunchMenu: boolean  // true = show menu on every launch; false = skip to defaultView
  defaultView: 'nearest' | 'favorites' | 'delays'  // starting view / menu pre-selection
}

export const DEFAULT_SETTINGS: AppSettings = {
  refreshInterval: 30,
  nearbyEnabled: true,
  nearbyRadius: 0.25,
  hiddenRoutes: {},
  showLaunchMenu: true,
  defaultView: 'favorites',
}

/** Top-level glasses display mode */
export type AppMode = 'menu' | 'stations' | 'delays'
