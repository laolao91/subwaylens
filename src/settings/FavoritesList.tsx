import { useState, useRef, useCallback } from 'react'
import { EmptyState } from 'even-toolkit/web'
import { getStation } from './search'
import { RouteBadges } from './RouteBadge'

interface FavoritesListProps {
  favoriteIds: string[]
  onReorder: (ids: string[]) => void
  onRemove: (id: string) => void
}

export function FavoritesList({ favoriteIds, onReorder, onRemove }: FavoritesListProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [floatY, setFloatY] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const touchStartY = useRef(0)
  const itemRects = useRef<DOMRect[]>([])
  const isDragging = useRef(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const snapshotRects = useCallback(() => {
    if (!containerRef.current) return
    const items = containerRef.current.querySelectorAll('[data-fav-idx]')
    itemRects.current = Array.from(items).map((el) => el.getBoundingClientRect())
  }, [])

  const getHoverIndex = useCallback((clientY: number): number => {
    const rects = itemRects.current
    for (let i = 0; i < rects.length; i++) {
      const mid = rects[i].top + rects[i].height / 2
      if (clientY < mid) return i
    }
    return rects.length - 1
  }, [])

  const finishDrag = useCallback((fromIdx: number, toIdx: number) => {
    if (fromIdx !== toIdx) {
      const next = [...favoriteIds]
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      onReorder(next)
    }
    setDragIndex(null)
    setDragOverIndex(null)
    isDragging.current = false
  }, [favoriteIds, onReorder])

  const onTouchStart = useCallback((e: React.TouchEvent, idx: number) => {
    const target = e.target as HTMLElement
    if (target.closest('[data-delete-btn]')) return
    const touch = e.touches[0]
    touchStartY.current = touch.clientY
    const isHandle = !!target.closest('[data-drag-handle]')
    const startDrag = () => {
      snapshotRects()
      setDragIndex(idx)
      setDragOverIndex(idx)
      setFloatY(touch.clientY)
      isDragging.current = true
    }
    if (isHandle) {
      e.preventDefault()
      startDrag()
    } else {
      longPressTimer.current = setTimeout(startDrag, 300)
    }
  }, [snapshotRects])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    if (longPressTimer.current && !isDragging.current) {
      if (Math.abs(touch.clientY - touchStartY.current) > 10) {
        clearTimeout(longPressTimer.current)
        longPressTimer.current = null
      }
      return
    }
    if (!isDragging.current || dragIndex === null) return
    e.preventDefault()
    setFloatY(touch.clientY)
    setDragOverIndex(getHoverIndex(touch.clientY))
  }, [dragIndex, getHoverIndex])

  const onTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    if (isDragging.current && dragIndex !== null && dragOverIndex !== null) {
      finishDrag(dragIndex, dragOverIndex)
    } else {
      setDragIndex(null)
      setDragOverIndex(null)
      isDragging.current = false
    }
  }, [dragIndex, dragOverIndex, finishDrag])

  const onMouseDown = useCallback((e: React.MouseEvent, idx: number) => {
    const target = e.target as HTMLElement
    if (!target.closest('[data-drag-handle]')) return
    e.preventDefault()
    snapshotRects()
    setDragIndex(idx)
    setDragOverIndex(idx)
    setFloatY(e.clientY)
    isDragging.current = true
    const onMouseMove = (me: MouseEvent) => {
      setFloatY(me.clientY)
      setDragOverIndex(getHoverIndex(me.clientY))
    }
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      setDragIndex((fromIdx) => {
        setDragOverIndex((toIdx) => {
          if (fromIdx !== null && toIdx !== null) {
            finishDrag(fromIdx, toIdx)
          }
          return null
        })
        return null
      })
      isDragging.current = false
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [snapshotRects, getHoverIndex, finishDrag])

  if (favoriteIds.length === 0) {
    return (
      <EmptyState
        title="No stations added"
        description="Search below to add your favorite stations."
        className="bg-surface rounded-[6px]"
      />
    )
  }

  const displayIds = [...favoriteIds]
  if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
    const [moved] = displayIds.splice(dragIndex, 1)
    displayIds.splice(dragOverIndex, 0, moved)
  }

  return (
    <div
      ref={containerRef}
      className="rounded-[6px] overflow-hidden"
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {displayIds.map((id, visualIdx) => {
        const station = getStation(id)
        if (!station) return null
        const originalIdx = favoriteIds.indexOf(id)
        const isBeingDragged = dragIndex !== null && id === favoriteIds[dragIndex]
        return (
          <div
            key={id}
            data-fav-idx={visualIdx}
            className={`drag-item ${isBeingDragged ? 'dragging' : ''}`}
            onTouchStart={(e) => onTouchStart(e, originalIdx)}
            onMouseDown={(e) => onMouseDown(e, originalIdx)}
            style={isBeingDragged ? { position: 'relative', zIndex: 1000 } : undefined}
          >
            <div className="flex items-center gap-3 bg-surface p-4">
              <span
                data-drag-handle
                className="text-text-dim text-[15px] cursor-grab select-none shrink-0"
                style={{ letterSpacing: '-2px', touchAction: 'none' }}
              >
                &#x22EE;&#x22EE;
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] tracking-[-0.15px] text-text">{station.name}</div>
                <RouteBadges routes={station.routes} />
              </div>
              <button
                data-delete-btn
                onClick={() => onRemove(id)}
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-[6px] text-text-dim cursor-pointer"
                style={{ fontSize: '20px' }}
                aria-label={`Remove ${station.name}`}
              >
                &#x00D7;
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
