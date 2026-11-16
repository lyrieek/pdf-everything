import { useRef, useState } from 'preact/hooks'
import { clampScrollTop, computeThumbMetrics } from '../lib/pdfLayout'

interface VirtualScrollbarProps {
  totalHeight: number
  viewportHeight: number
  scrollTop: number
  pageCount?: number
  hasOverflow?: boolean
  onScroll: (top: number) => void
}

export function VirtualScrollbar({
  totalHeight,
  viewportHeight,
  scrollTop,
  pageCount = 1,
  hasOverflow = false,
  onScroll,
}: VirtualScrollbarProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y: number; top: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  // Keep the geometry aligned with the track's header and footer insets.
  const trackHeight = Math.max(viewportHeight - 88, 0)
  const { thumbHeight, thumbTop, maxScrollTop, scrollable } = computeThumbMetrics(
    totalHeight,
    viewportHeight,
    scrollTop,
    trackHeight,
  )
  const trackRange = Math.max(trackHeight - thumbHeight, 0)
  const progress = maxScrollTop > 0 ? clampScrollTop(scrollTop, maxScrollTop) / maxScrollTop : 0

  if (viewportHeight <= 0 || (!scrollable && pageCount <= 1 && !hasOverflow)) return null

  const finishDrag = () => {
    drag.current = null
    setDragging(false)
  }

  return (
    <aside className={`virtual-scrollbar${dragging ? ' is-dragging' : ''}`}>
      <div className="virtual-scrollbar-heading" aria-hidden="true">
        <span className="virtual-scrollbar-icon" />
        <span>MINIMAP</span>
        <span className="virtual-scrollbar-count">{pageCount.toString().padStart(2, '0')}</span>
      </div>
      <div
        ref={trackRef}
        className="virtual-scrollbar-track"
        role="scrollbar"
        tabIndex={0}
        aria-label="PDF scroll position"
        aria-controls="pdf-scroll-container"
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={maxScrollTop}
        aria-valuenow={Math.round(clampScrollTop(scrollTop, maxScrollTop))}
        aria-disabled={!scrollable}
        onPointerDown={(e) => {
          if (!scrollable || e.button !== 0) return
          e.preventDefault()
          const track = trackRef.current!
          track.focus({ preventScroll: true })
          track.setPointerCapture(e.pointerId)
          const onThumb = (e.target as HTMLElement).closest('.virtual-scrollbar-thumb')
          const top = onThumb
            ? scrollTop
            : clampScrollTop(
                ((e.clientY - track.getBoundingClientRect().top - thumbHeight / 2) /
                  (trackRange || 1)) *
                  maxScrollTop,
                maxScrollTop,
              )
          drag.current = { y: e.clientY, top }
          setDragging(true)
          if (!onThumb) onScroll(top)
        }}
        onPointerMove={(e) => {
          if (!drag.current || trackRange <= 0) return
          onScroll(
            clampScrollTop(
              drag.current.top + ((e.clientY - drag.current.y) / trackRange) * maxScrollTop,
              maxScrollTop,
            ),
          )
        }}
        onPointerUp={(e) => {
          if (trackRef.current?.hasPointerCapture(e.pointerId)) {
            trackRef.current.releasePointerCapture(e.pointerId)
          }
          finishDrag()
        }}
        onPointerCancel={finishDrag}
        onLostPointerCapture={finishDrag}
        onWheel={(e) => {
          if (e.ctrlKey || e.metaKey) return
          e.preventDefault()
          const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? viewportHeight : 1
          onScroll(clampScrollTop(scrollTop + e.deltaY * unit, maxScrollTop))
        }}
        onKeyDown={(e) => {
          const delta = {
            ArrowUp: -40,
            ArrowDown: 40,
            PageUp: -viewportHeight * 0.9,
            PageDown: viewportHeight * 0.9,
            Home: -Infinity,
            End: Infinity,
          }[e.key]
          if (delta === undefined) return
          e.preventDefault()
          e.stopPropagation()
          onScroll(clampScrollTop(scrollTop + delta, maxScrollTop))
        }}
      >
        <div className="virtual-scrollbar-map" aria-hidden="true">
          {Array.from({ length: Math.min(Math.max(pageCount, 1), 24) }, (_, index) => (
            <div className="virtual-scrollbar-sheet" key={index} />
          ))}
        </div>
        <div
          className="virtual-scrollbar-thumb"
          style={{ height: `${thumbHeight}px`, top: `${thumbTop}px` }}
          aria-hidden="true"
        >
          <span className="virtual-scrollbar-grip" />
        </div>
      </div>
      <div className="virtual-scrollbar-footer" aria-hidden="true">
        <span className="virtual-scrollbar-status" />
        <span>{Math.round(progress * 100)}%</span>
      </div>
    </aside>
  )
}
