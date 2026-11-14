import { useRef } from 'react'

// Swipe left / right on a touch screen. Mostly-vertical drags (scrolling) are ignored.
export default function useSwipe({ onLeft, onRight, min = 56 }) {
  const start = useRef(null)
  return {
    onTouchStart: (e) => {
      if (e.touches.length !== 1) { start.current = null; return }
      const t = e.touches[0]
      start.current = { x: t.clientX, y: t.clientY, at: Date.now() }
    },
    onTouchEnd: (e) => {
      const s = start.current
      start.current = null
      if (!s || !e.changedTouches.length) return
      const t = e.changedTouches[0]
      const dx = t.clientX - s.x
      const dy = t.clientY - s.y
      if (Math.abs(dx) >= min && Math.abs(dx) > Math.abs(dy) * 1.6 && Date.now() - s.at < 900) {
        if (dx < 0) onLeft(); else onRight()
      }
    },
    onTouchCancel: () => { start.current = null },
  }
}
