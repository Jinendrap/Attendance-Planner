import { useEffect, useRef } from 'react'

// Makes the phone / browser Back button close a window (class window, menu...) instead of leaving the app.
// While `open` is true we add one history entry; Back removes it and calls close().
export default function useBackClose(open, close) {
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    if (!open) return undefined
    window.history.pushState({ layer: true }, '')
    const onPop = () => closeRef.current()
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      // Closed by a button (not by Back): remove our extra entry if it is still on top.
      if (window.history.state && window.history.state.layer) window.history.back()
    }
  }, [open])
}
