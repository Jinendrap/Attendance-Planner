import { useEffect, useRef, useState } from 'react'
import { Logo } from './Logo.jsx'
import { BRAND } from './brand.js'

const ANCHOR_Y = -280 // the band is fixed far above the screen, so its ends never show
const L = 450 // band length (px)
const N = 12 // pieces the band is made of
const SEG = L / N
const STRETCH = 150 // how far the band can be pulled past its length
const G = 3400 // gravity (px/s²)
const CLIP = 30 // clip length
const CARD_L = 130 // hinge to the middle of the card
const BAND_W = 46
const WORD = `${BRAND.name.toUpperCase()} • ${BRAND.tagline.toUpperCase()} • `.repeat(8)

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
// Sideways limit so the card (which hangs further along the band) stays mostly on screen.
const wallAt = (r) => Math.max(40, ((window.innerWidth / 2 - 40) * Math.max(r, L)) / (Math.max(r, L) + CLIP + CARD_L))

// A hanging ID card on a stretchy, bendy band. Grab it anywhere, pull it and let go:
// the card flies away first, then the app un-blurs.
export default function IdIntro({ profile, onDone }) {
  const bandRef = useRef(null)
  const edgeRef = useRef(null)
  const stitchRef = useRef(null)
  const textPathRef = useRef(null)
  const clipRef = useRef(null)
  const cardRef = useRef(null)
  const hint = useRef(null)
  const s = useRef(null)
  const [gone, setGone] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [out, setOut] = useState(false)

  const name = (profile && profile.full_name) || 'Student'
  const lines = [profile && profile.course, profile && profile.college].filter(Boolean)
  const code = (profile && profile.semester_name) || BRAND.name

  if (!s.current) {
    const pts = Array.from({ length: N + 1 }, (_, i) => ({ x: 0, y: (i / N) * (L - 90), px: 0, py: (i / N) * (L - 90) }))
    s.current = { x: 0, y: L - 90, vx: 0, vy: 0, pvx: 0, pvy: 0, phi: 0, pv: 0, pts, drag: false, gx: 0, gy: 0, lx: 0, ly: 0, lt: 0, done: false }
  }

  function trigger() {
    const st = s.current
    if (st.done) return
    st.done = true
    setGone(true) // 1. the card and band whip away
    setTimeout(() => setUnlocked(true), 380) // 2. then the screen un-blurs
    setTimeout(() => setOut(true), 900)
    setTimeout(onDone, 1250)
  }

  useEffect(() => {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { onDone(); return undefined }
    const st = s.current
    let raf = 0
    let last = performance.now()

    const physics = (dt) => {
      if (!st.drag) {
        let ax = 0
        let ay = G
        const r = Math.hypot(st.x, st.y)
        if (r > L) {
          const nx = st.x / r
          const ny = st.y / r
          const f = -520 * (r - L) - 18 * (st.vx * nx + st.vy * ny)
          ax += f * nx
          ay += f * ny
        }
        ax -= 0.6 * st.vx
        ay -= 0.6 * st.vy
        st.vx += ax * dt
        st.vy += ay * dt
        st.x += st.vx * dt
        st.y += st.vy * dt
        const wall = wallAt(Math.hypot(st.x, st.y))
        if (Math.abs(st.x) > wall) { st.x = Math.sign(st.x) * wall; st.vx *= -0.45 }
        if (st.y < 60) { st.y = 60; st.vy *= -0.3 }
      }
      // The card swings on its clip like a real pendulum, pushed around by the movement of the clip.
      const hax = clamp((st.vx - st.pvx) / dt, -3 * G, 3 * G)
      const hay = clamp((st.vy - st.pvy) / dt, -3 * G, 3 * G)
      st.pvx = st.vx
      st.pvy = st.vy
      const gy = Math.max(300, G - hay)
      const psi = Math.atan2(hax, gy)
      st.pv += (-(Math.hypot(hax, gy) / CARD_L) * Math.sin(st.phi - psi) - 3.4 * st.pv) * dt
      st.phi = clamp(st.phi + st.pv * dt, -1.5, 1.5)
    }

    const rope = (dt) => {
      const p = st.pts
      for (let i = 1; i < N; i++) {
        const q = p[i]
        const vx = (q.x - q.px) * 0.985
        const vy = (q.y - q.py) * 0.985
        q.px = q.x; q.py = q.y
        q.x += vx
        q.y += vy + 1500 * dt * dt
      }
      p[0].x = 0; p[0].y = 0
      p[N].x = st.x; p[N].y = st.y
      for (let it = 0; it < 12; it++) {
        for (let i = 0; i < N; i++) {
          const a = p[i]
          const b = p[i + 1]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const d = Math.hypot(dx, dy) || 0.0001
          const diff = (d - SEG) / d
          const wa = i === 0 ? 0 : 1
          const wb = i + 1 === N ? 0 : 1
          const tot = wa + wb
          if (!tot) continue
          a.x += (dx * diff * wa) / tot; a.y += (dy * diff * wa) / tot
          b.x -= (dx * diff * wb) / tot; b.y -= (dy * diff * wb) / tot
        }
      }
    }

    const draw = () => {
      const W = window.innerWidth
      const p = st.pts
      const X = (v) => (W / 2 + v).toFixed(1)
      const Y = (v) => (ANCHOR_Y + v).toFixed(1)
      let d = `M${X(p[0].x)} ${Y(p[0].y)}`
      for (let i = 1; i < N; i++) {
        const mx = (p[i].x + p[i + 1].x) / 2
        const my = (p[i].y + p[i + 1].y) / 2
        d += ` Q${X(p[i].x)} ${Y(p[i].y)} ${X(mx)} ${Y(my)}`
      }
      d += ` L${X(p[N].x)} ${Y(p[N].y)}`
      if (bandRef.current) bandRef.current.setAttribute('d', d)
      if (edgeRef.current) edgeRef.current.setAttribute('d', d)
      if (stitchRef.current) stitchRef.current.setAttribute('d', d)
      if (textPathRef.current) textPathRef.current.setAttribute('d', d)
      // direction of the last piece of band
      const th = Math.atan2(p[N].x - p[N - 1].x, p[N].y - p[N - 1].y)
      const ax = W / 2 + st.x
      const ay = ANCHOR_Y + st.y
      if (clipRef.current) {
        clipRef.current.style.left = `${ax}px`
        clipRef.current.style.top = `${ay}px`
        clipRef.current.style.transform = `translate(-50%, -6px) rotate(${-th}rad)`
      }
      if (cardRef.current) {
        cardRef.current.style.left = `${ax + CLIP * Math.sin(th)}px`
        cardRef.current.style.top = `${ay + CLIP * Math.cos(th)}px`
        cardRef.current.style.transform = `translate(-50%, -12px) rotate(${st.phi}rad)`
      }
    }

    const tick = (now) => {
      const dt = Math.min(0.034, (now - last) / 1000)
      last = now
      physics(dt / 2); physics(dt / 2)
      rope(dt)
      draw()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    const onKey = (e) => { if (e.key === 'Escape') trigger() }
    window.addEventListener('keydown', onKey)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const anchor = () => ({ ax: window.innerWidth / 2, ay: ANCHOR_Y })
  const down = (e) => {
    const st = s.current
    e.currentTarget.setPointerCapture(e.pointerId)
    const a = anchor()
    st.drag = true
    st.gx = e.clientX - a.ax - st.x
    st.gy = e.clientY - a.ay - st.y
    st.lx = st.x; st.ly = st.y; st.lt = performance.now(); st.vx = 0; st.vy = 0
    if (hint.current) hint.current.style.opacity = 0
  }
  const move = (e) => {
    const st = s.current
    if (!st.drag) return
    const a = anchor()
    let nx = e.clientX - a.ax - st.gx
    let ny = e.clientY - a.ay - st.gy
    const r = Math.hypot(nx, ny)
    if (r > L) { const rr = L + STRETCH * Math.tanh((r - L) / STRETCH); nx *= rr / r; ny *= rr / r }
    if (ny < 60) ny = 60
    const wall = wallAt(Math.hypot(nx, ny))
    if (Math.abs(nx) > wall) nx = Math.sign(nx) * wall
    const now = performance.now()
    const dt = Math.max(0.008, (now - st.lt) / 1000)
    st.vx = 0.6 * st.vx + 0.4 * ((nx - st.lx) / dt)
    st.vy = 0.6 * st.vy + 0.4 * ((ny - st.ly) / dt)
    st.x = nx; st.y = ny; st.lx = nx; st.ly = ny; st.lt = now
  }
  const up = () => {
    const st = s.current
    if (!st.drag) return
    st.drag = false
    const speed = Math.hypot(st.vx, st.vy)
    st.vx = clamp(st.vx, -2600, 2600)
    st.vy = clamp(st.vy, -2600, 2600)
    if (Math.hypot(st.x, st.y) - L > 40 || speed > 1400) trigger()
  }

  return (
    <div className={`idintro ${unlocked ? 'unlock' : ''} ${gone ? 'gone' : ''} ${out ? 'out' : ''}`} role="dialog" aria-label="Welcome">
      <div className="idlayer">
        <svg className="idband" aria-hidden="true">
          <path ref={edgeRef} fill="none" stroke="rgba(0,0,0,.28)" strokeWidth={BAND_W + 3} strokeLinecap="butt" />
          <path ref={bandRef} fill="none" stroke="#4a6e7e" strokeWidth={BAND_W} strokeLinecap="butt" />
          <path ref={stitchRef} fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="1.5" strokeDasharray="7 6" />
          <path ref={textPathRef} id="idband-path" fill="none" stroke="none" />
          <text className="idbandtext" dy="4"><textPath href="#idband-path" startOffset="140">{WORD}</textPath></text>
        </svg>
        <div ref={clipRef} className="idclip" aria-hidden="true" />
        <div ref={cardRef} className="idcard" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <i className="idslot" aria-hidden="true" />
          <div className="idhead"><Logo size={22} /><span>{BRAND.name} {BRAND.tagline}</span></div>
          <div className="idmark" aria-hidden="true"><Logo size={54} /></div>
          <div className="idname">{name}</div>
          {lines.map((t) => <div className="idline" key={t}>{t}</div>)}
          <div className="idfoot"><i className="idbars" aria-hidden="true" /><span>{code}</span></div>
          <i className="idshine" aria-hidden="true" />
        </div>
      </div>
      <p ref={hint} className="idhint"><span>↓</span> Pull the ID down and let go</p>
      <button className="link idskip" onClick={trigger}>Skip</button>
    </div>
  )
}
