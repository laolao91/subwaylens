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
}

/** A single upcoming train arrival */
export interface TrainArrival {
  route: string        // e.g. "E", "F", "7"
  direction: 'N' | 'S' // N=northbound/uptown, S=southbound/downtown
  stopId: string       // full stop ID e.g. "A03N"
  arrivalTime: number  // Unix timestamp (seconds)
  terminal: string     // last stop name
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
}

export const DEFAULT_SETTINGS: AppSettings = {
  refreshInterval: 30,
  nearbyEnabled: true,
  nearbyRadius: 0.25,
}
