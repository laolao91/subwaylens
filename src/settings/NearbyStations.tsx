/**
 * Nearby Stations — GPS-detected stations within configured radius.
 * Shows when "Show nearby stations" is enabled in settings.
 * Uses getCurrentPosition() + nearbyStations() from geo.ts.
 */

import { useState, useEffect, useCallback } from 'react'
import { Button } from 'even-toolkit/web'
import { getCurrentPositionDetailed, nearbyStations } from '../lib/geo'
import { RouteBadges } from './RouteBadge'
import { allStations } from '../data/stations'
import type { Station } from '../lib/types'

interface NearbyStationsProps {
  enabled: boolean
  radius: number
  favoriteIds: string[]
  onAdd: (id: string) => void
}

type GpsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'denied' }      // PERMISSION_DENIED (may fire spuriously on Android)
  | { status: 'unavailable' } // no GPS hardware or network location
  | { status: 'timeout' }     // device didn't respond in time
  | { status: 'done'; results: Array<{ station: Station; distance: number }> }

export function NearbyStations({ enabled, radius, favoriteIds, onAdd }: NearbyStationsProps) {
  const [gpsState, setGpsState] = useState<GpsState>({ status: 'idle' })

  const detect = useCallback(async () => {
    setGpsState({ status: 'loading' })

    // No upfront navigator.geolocation check here — getCurrentPositionDetailed()
    // tries the Even Hub bridge first and only needs navigator.geolocation for
    // its own fallback path, so bailing out early here would skip the bridge
    // path entirely on any device where navigator.geolocation is unavailable
    // but the bridge works fine.
    const pos = await getCurrentPositionDetailed()
    if (pos === 'permission-denied') {
      setGpsState({ status: 'denied' })
      return
    }
    if (pos === 'unavailable') {
      setGpsState({ status: 'unavailable' })
      return
    }
    if (pos === 'timeout') {
      setGpsState({ status: 'timeout' })
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
        <p className="text-[13px] tracking-[-0.13px] text-text-dim mt-2">
          Make sure location services are enabled in device settings.
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

  if (gpsState.status === 'timeout') {
    return (
      <div className="bg-surface rounded-[6px] p-6 text-center">
        <p className="text-[15px] tracking-[-0.15px] text-text-dim">
          Location request timed out.
        </p>
        <p className="text-[13px] tracking-[-0.13px] text-text-dim mt-2">
          Check your location settings and try again.
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

  if (gpsState.status === 'denied') {
    return (
      <div className="bg-surface rounded-[6px] p-6 text-center">
        <p className="text-[15px] tracking-[-0.15px] text-text-dim">
          Location permission required.
        </p>
        <p className="text-[13px] tracking-[-0.13px] text-text-dim mt-2">
          If you've already granted it, try force-quitting and reopening the EvenHub app.
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
          <div key={station.id} className="flex items-center gap-3 bg-surface p-4 border-b border-border last:border-b-0">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-[15px] tracking-[-0.15px] text-text">
                  {station.name}
                </span>
                <span className="text-[11px] tracking-[-0.11px] text-text-dim bg-surface-light border border-border px-2 py-0.5 rounded-full shrink-0">
                  {distance.toFixed(2)} mi
                </span>
              </div>
              <RouteBadges routes={station.routes} />
            </div>
            {isFav ? (
              <span className="shrink-0 text-positive text-[17px] w-8 h-8 flex items-center justify-center">
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
