import { useLayoutEffect, useRef, useState } from 'react'

// The hand-drawn pencil loop from the Calendar-3 template (the circled photo on its contact sheet).
// Put <Pencil /> inside any element (the element must be position: relative, class "hp" does that).
// It measures that element and draws a loop that fits it, so the pencil line keeps one thickness
// on a small date and on a wide class row. Like a grease pencil, the loop overshoots where it started.
// styles.css draws it: on hover for ".hp", or always for ".circled".
const LOOP =
  'M 28 92 C 30 30, 130 8, 210 18 C 272 26, 292 70, 284 112 C 274 168, 190 190, 110 184 C 40 178, 8 140, 22 84 C 30 54, 70 30, 124 21'

// Each loop is tilted a little differently so no two look stamped.
const TILTS = [-3, 2, -5, 3, -2, 4, -4]
export const tiltFor = (i) => TILTS[Math.abs(Math.round(i)) % TILTS.length]

const cache = new Map()
function pathFor(w, h) {
  const key = `${w}x${h}`
  if (!cache.has(key)) {
    let n = 0
    cache.set(key, LOOP.replace(/\d+(?:\.\d+)?/g, (v) => String(Math.round(Number(v) * (n++ % 2 ? h / 200 : w / 300) * 10) / 10)))
  }
  return cache.get(key)
}

// seed: picks the tilt. sw: line thickness in px. fx / fy: how far past the element the loop reaches
// (share of its width / height), never less than 5px and never more than maxX / maxY px.
export default function Pencil({ seed = 0, sw = 3, fx = 0.11, fy = 0.15, maxX = 22, maxY = 14, maxW = 0, center = false }) {
  const ref = useRef(null)
  const [box, setBox] = useState(null)

  useLayoutEffect(() => {
    const host = ref.current && ref.current.parentElement
    if (!host) return undefined
    const read = () => {
      const w = host.offsetWidth
      const h = host.offsetHeight
      setBox((b) => (b && b.w === w && b.h === h ? b : { w, h }))
    }
    read()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(read)
    ro.observe(host)
    return () => ro.disconnect()
  }, [])

  if (!box || !box.w || !box.h) return <svg ref={ref} className="pencil" aria-hidden="true" />

  // maxW: on a very wide element (a class row in day view) the loop circles only its first part, like a name.
  // center: circle the middle of the element instead (a day heading).
  const bw = maxW && box.w > maxW ? maxW : box.w
  const ox = Math.min(maxX, Math.max(5, bw * fx))
  const oy = Math.min(maxY, Math.max(5, box.h * fy))
  // The drawn line reaches about 95% of the box on each side, so the box is a little larger than the reach.
  const W = Math.round((bw + 2 * ox) / 0.946)
  const H = Math.round((box.h + 2 * oy) / 0.91)
  return (
    <svg
      ref={ref}
      className="pencil"
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
      style={{ width: W, height: H, left: ((center ? box.w : bw) - W) / 2, top: (box.h - H) / 2, '--sw': sw, transform: `rotate(${tiltFor(seed)}deg)` }}
    >
      <path pathLength="1" d={pathFor(W, H)} />
    </svg>
  )
}
