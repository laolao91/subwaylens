/**
 * Live glasses preview — shows exactly what appears on the G2 display for a station.
 * Fetches MTA data from the phone side (same network permissions as glasses mode)
 * and renders using the shared renderBody / renderHeader functions.
 */

import { useState, useEffect, useRef } from 'react'
import { getStationArrivals } from '../data/arrivals'
import { fetchAlerts } from '../data/alerts'
import { renderHeader, renderBody } from '../glasses/display'
import { applyRouteFilter } from '../glasses/stations'
import type { Station, StationArrivals, AppSettings } from '../lib/types'

interface GlassesPreviewProps {
  stations: Station[]            // favorites list (in order)
  settings: AppSettings
}

export function GlassesPreview({ stations, settings }: GlassesPreviewProps) {
  const [selectedId, setSelectedId] = useState<string>(stations[0]?.id ?? '')
  const [previewLines, setPreviewLines] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const fetchRef = useRef(0)

  const selectedStation = stations.find((s) => s.id === selectedId) ?? stations[0]

  // Keep selectedId pointing at a valid station when favorites list changes
  useEffect(() => {
    if (stations.length === 0) return
    if (!stations.find((s) => s.id === selectedId)) {
      setSelectedId(stations[0].id)
    }
  }, [stations, selectedId])

  useEffect(() => {
    if (!selectedStation) return
    const token = ++fetchRef.current

    async function fetchPreview() {
      setLoading(true)
      setError(false)
      try {
        const [arrivals, alerts] = await Promise.all([
          getStationArrivals(selectedStation!),
          fetchAlerts(),
        ])
        if (fetchRef.current !== token) return
        const filtered = applyRouteFilter(arrivals, selectedStation!.id)
        const header = renderHeader(selectedStation!, false)
        const body = renderBody(selectedStation!, filtered, 0, 1, alerts)
        setPreviewLines(header + '\n' + body)
      } catch {
        if (fetchRef.current !== token) return
        setError(true)
      } finally {
        if (fetchRef.current === token) setLoading(false)
      }
    }

    fetchPreview()
    // Auto-refresh on the configured interval
    const interval = setInterval(fetchPreview, settings.refreshInterval * 1000)
    return () => clearInterval(interval)
  }, [selectedStation, settings.refreshInterval])

  if (stations.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      {/* Station picker */}
      {stations.length > 1 && (
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="text-[13px] text-text bg-surface border border-border rounded-[6px] px-3 py-2 w-full"
        >
          {stations.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      )}

      {/* G2 display simulation */}
      <div className="bg-black rounded-[6px] p-2 overflow-hidden">
        {loading && !previewLines ? (
          <pre style={{
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: '11px',
            color: '#666',
            margin: 0,
            lineHeight: '1.45',
            letterSpacing: '0.02em',
          }}>
            {'  Loading preview...'}
          </pre>
        ) : error ? (
          <pre style={{
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: '11px',
            color: '#666',
            margin: 0,
            lineHeight: '1.45',
          }}>
            {'  Could not load preview.'}
          </pre>
        ) : (
          <pre style={{
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: '11px',
            color: '#e8e8e8',
            margin: 0,
            lineHeight: '1.45',
            letterSpacing: '0.02em',
            whiteSpace: 'pre',
          }}>
            {previewLines}
          </pre>
        )}
      </div>
      <p className="text-[11px] text-text-dim text-center">
        Live preview — refreshes every {settings.refreshInterval}s
      </p>
    </div>
  )
}
