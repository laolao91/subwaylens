import { useState, useEffect, useCallback } from 'react'
import {
  AppShell,
  ScreenHeader,
  Button,
  Toast,
} from 'even-toolkit/web'
import {
  getFavorites,
  saveFavorites,
  addFavorite,
  removeFavorite,
  getSettings,
  saveSettings,
} from '../lib/storage'
import type { AppSettings } from '../lib/types'
import { DEFAULT_SETTINGS } from '../lib/types'
import { FavoritesList } from './FavoritesList'
import { StationSearch } from './StationSearch'
import { SettingsPanel } from './SettingsPanel'

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="flex items-center justify-between mb-3 mt-6">
      <span className="text-[20px] tracking-[-0.6px] text-text" style={{ fontWeight: 500 }}>
        {children}
      </span>
    </div>
  )
}

export function SettingsApp() {
  const [favoriteIds, setFavoriteIds] = useState<string[]>([])
  const [settings, setSettings] = useState<AppSettings>({ ...DEFAULT_SETTINGS })
  const [loading, setLoading] = useState(true)
  const [toastVisible, setToastVisible] = useState(false)
  const [toastExiting, setToastExiting] = useState(false)

  useEffect(() => {
    async function load() {
      const [favs, s] = await Promise.all([getFavorites(), getSettings()])
      setFavoriteIds(favs)
      setSettings(s)
      setLoading(false)
    }
    load()
  }, [])

  const handleReorder = useCallback(async (ids: string[]) => {
    setFavoriteIds(ids)
    await saveFavorites(ids)
  }, [])

  const handleRemove = useCallback(async (id: string) => {
    const next = await removeFavorite(id)
    setFavoriteIds(next)
  }, [])

  const handleAdd = useCallback(async (id: string) => {
    const next = await addFavorite(id)
    setFavoriteIds(next)
  }, [])

  const handleSettingsChange = useCallback(async (next: AppSettings) => {
    setSettings(next)
    await saveSettings(next)
  }, [])

  const handleSync = useCallback(() => {
    window.dispatchEvent(new CustomEvent('subwaylens:sync'))
    setToastExiting(false)
    setToastVisible(true)
    setTimeout(() => {
      setToastExiting(true)
      setTimeout(() => {
        setToastVisible(false)
        setToastExiting(false)
      }, 300)
    }, 1700)
  }, [])

  if (loading) {
    return (
      <div className="h-dvh flex items-center justify-center bg-bg">
        <span className="text-[15px] tracking-[-0.15px] text-text-dim">Loading...</span>
      </div>
    )
  }

  const header = (
    <div className="px-3">
      <ScreenHeader
        title="SubwayLens"
        subtitle="MTA Subway Arrivals for G2"
      />
    </div>
  )

  return (
    <AppShell header={header}>
      <div className="px-3 pb-8">
        <div className="flex items-center justify-between mb-3 mt-6">
          <span className="text-[20px] tracking-[-0.6px] text-text" style={{ fontWeight: 500 }}>
            My Stations
          </span>
          <Button variant="highlight" size="sm" onClick={handleSync}>
            Send to Glasses
          </Button>
        </div>
        <FavoritesList
          favoriteIds={favoriteIds}
          onReorder={handleReorder}
          onRemove={handleRemove}
        />

        <SectionLabel>Add Station</SectionLabel>
        <StationSearch
          favoriteIds={favoriteIds}
          onAdd={handleAdd}
        />

        <SectionLabel>Settings</SectionLabel>
        <SettingsPanel
          settings={settings}
          onChange={handleSettingsChange}
        />

        <p className="text-[11px] tracking-[-0.11px] text-text-dim text-center mt-8">
          v1.1.0 &#x00B7; Changes auto-save. Tap &#x201C;Send to Glasses&#x201D; to update display.
        </p>
      </div>

      {toastVisible && (
        <div className={`fixed bottom-6 left-4 right-4 z-50 ${toastExiting ? 'toast-exit' : 'toast-enter'}`}>
          <Toast message="Sent to glasses!" variant="info" />
        </div>
      )}
    </AppShell>
  )
}
