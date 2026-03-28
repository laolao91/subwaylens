/**
 * Nearby Stations — GPS-detected stations within configured radius.
 * Shows when "Show nearby stations" is enabled in settings.
 * Uses getCurrentPosition() + nearbyStations() from geo.ts.
 */

import { useState, useEffect, useCallback } from 'react'
import { Button } from 'even-toolkit/web'
import { getCurrentPosition, nearbyStations } from '../lib/geo'
import { RouteBadges } from './RouteBadge'
import stationsData from '../data/stations.json'
import type { Station } from '../lib/types'

const allStations = stationsData as Station[]

interface NearbyStationsProps {
  enabled: boolean
  radius: number
  favoriteIds: string[]
  onAdd: (id: string) => void
}

type GpsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'denied' }
  | { status: 'unavailable' }
  | { status: 'done'; results: Array<{ station: Station; distance: number }> }

export function NearbyStations({ enabled, radius, favoriteIds, onAdd }: NearbyStationsProps) {
  const [gpsState, setGpsState] = useState<GpsState>({ status: 'idle' })

  const detect = useCallback(async () => {
    setGpsState({ status: 'loading' })

    if (!navigator.geolocation) {
      setGpsState({ status: 'unavailable' })
      return
    }

    const pos = await getCurrentPosition()
    if (!pos) {
      setGpsState({ status: 'denied' })
      return
    }

    const results = nearbyStations(pos, allStations, radius)
    setGpsState({ status: 'done', results })
  }, [radius])

  useEffect(() => {
    if (enabled) {
      detect()
    } else {
      setGpsState({ status: 'idle' })
    }
  }, [enabled, detect])

  if (!enabled) return null

  if (gpsState.status === 'idle') return null

  if (gpsState.status === 'loading') {
    return (
      <div className="bg-surface rounded-[6px] p-6 text-center">
        <p className="text-[15px] tracking-[-0.15px] text-text-dim">
          Detecting location...
        </p>
      </div>
    )
  }

  if (gpsState.status === 'unavailable') {
    return (
      <div className="bg-surface rounded-[6px] p-6 text-center">
        <p className="text-[15px] tracking-[-0.15px] text-text-dim">
          Location services not available on this device.
        </p>
      </div>
    )
  }

  if (gpsState.status === 'denied') {
    return (
      <div className="bg-surface rounded-[6px] p-6 text-center">
        <p className="text-[15px] tracking-[-0.15px] text-text-dim">
          Location access was denied.
        </p>
        <p className="text-[13px] tracking-[-0.13px] text-text-dim mt-2">
          Enable location in your browser or device settings, then tap Retry.
        </p>
        <button
          onClick={detect}
          className="mt-3 text-[14px] tracking-[-0.14px] text-accent cursor-pointer bg-transparent border-0"
        >
          Retry
        </button>
      </div>
    )
  }

  // status === 'done'
  const { results } = gpsState

  if (results.length === 0) {
    return (
      <div className="bg-surface rounded-[6px] p-6 text-center">
        <p className="text-[15px] tracking-[-0.15px] text-text-dim">
          No stations within {radius} mi.
        </p>
        <p className="text-[13px] tracking-[-0.13px] text-text-dim mt-2">
          Try increasing the nearby radius in Settings below.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-[6px] overflow-hidden">
      {results.map(({ station, distance }) => {
        const isFav = favoriteIds.includes(station.id)
        return (
          <div key={station.id} className="flex items-center gap-3 bg-surface p-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-[15px] tracking-[-0.15px] text-text">
                  {station.name}
                </span>
                <span className="text-[12px] tracking-[-0.12px] text-text-dim shrink-0">
                  {distance.toFixed(2)} mi
                </span>
              </div>
              <RouteBadges routes={station.routes} />
            </div>
            {isFav ? (
              <span className="shrink-0 text-text-dim text-[17px] w-8 h-8 flex items-center justify-center">
                &#x2713;
              </span>
            ) : (
              <Button
                variant="highlight"
                size="icon"
                className="shrink-0 w-11 h-11"
                onClick={() => onAdd(station.id)}
                aria-label={`Add ${station.name}`}
              >
                +
              </Button>
            )}
          </div>
        )
      })}
    </div>
  )
}
