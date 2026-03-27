import { useState, useCallback, useRef } from 'react'
import { Button, Input } from 'even-toolkit/web'
import { searchStations } from './search'
import { RouteBadges } from './RouteBadge'
import type { Station } from '../lib/types'

interface StationSearchProps {
  favoriteIds: string[]
  onAdd: (id: string) => void
}

export function StationSearch({ favoriteIds, onAdd }: StationSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Station[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value
      setQuery(val)

      if (debounceRef.current) clearTimeout(debounceRef.current)

      if (!val.trim()) {
        setResults([])
        return
      }

      debounceRef.current = setTimeout(() => {
        setResults(searchStations(val, 15))
      }, 200)
    },
    []
  )

  const handleAdd = useCallback((id: string) => {
    onAdd(id)
    // Clear search after adding
    setQuery('')
    setResults([])
  }, [onAdd])

  return (
    <div>
      <Input
        value={query}
        onChange={handleChange}
        placeholder="Search stations..."
        type="search"
        autoComplete="off"
        spellCheck={false}
      />

      {query.trim() && results.length === 0 && (
        <p className="text-[13px] tracking-[-0.13px] text-text-dim text-center py-6">
          No stations found
        </p>
      )}

      {results.length > 0 && (
        <div className="rounded-[6px] overflow-hidden mt-3">
          {results.map((station) => {
            const isFav = favoriteIds.includes(station.id)
            return (
              <div key={station.id} className="flex items-center gap-3 bg-surface p-4">
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] tracking-[-0.15px] text-text">{station.name}</div>
                  <RouteBadges routes={station.routes} />
                </div>
                {isFav ? (
                  <span className="shrink-0 text-text-dim text-[17px] w-8 h-8 flex items-center justify-center">&#x2713;</span>
                ) : (
                  <Button
                    variant="highlight"
                    size="icon"
                    className="shrink-0 w-11 h-11"
                    onClick={() => handleAdd(station.id)}
                    aria-label={`Add ${station.name}`}
                  >
                    +
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
