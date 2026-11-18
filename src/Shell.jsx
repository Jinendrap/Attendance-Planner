import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'

// ---- Light / dark theme (remembered on this device) ----
const KEY = 'cap_theme'

function initialTheme() {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* ignore */ }
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useTheme() {
  const [theme, setTheme] = useState(initialTheme)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0b0b0c' : '#e5e4e2')
    try { localStorage.setItem(KEY, theme) } catch { /* ignore */ }
  }, [theme])
  // The whole page cross-fades to the other theme (browsers without View Transitions just switch).
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (document.startViewTransition && !calm) {
      document.startViewTransition(() => {
        document.documentElement.dataset.theme = next
        flushSync(() => setTheme(next))
      })
    } else setTheme(next)
  }
  return [theme, toggle]
}

// Text that "rolls" up on hover (only on devices with a mouse).
export function Roll({ children }) {
  const t = String(children)
  return <span className="roll" data-t={t}><span>{t}</span></span>
}

export function LiveClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000)
    return () => clearInterval(id)
  }, [])
  const tz = { timeZone: 'Asia/Kolkata' }
  const time = new Intl.DateTimeFormat('en-GB', { ...tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now)
  const day = new Intl.DateTimeFormat('en-GB', { ...tz, weekday: 'short' }).format(now)
  const date = new Intl.DateTimeFormat('en-GB', { ...tz, day: 'numeric', month: 'short' }).format(now)
  return (
    <span className="clock" aria-label={`${day} ${date}, ${time}`}>
      <span><span className="clock-day">{day} </span>{date} • {time}</span>
    </span>
  )
}

export function ThemeToggle({ theme, onToggle }) {
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button className="iconbtn" onClick={onToggle} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
      </svg>
    </button>
  )
}

// Small button in the header that opens the fidget ID card.
export function FidgetButton({ onClick }) {
  return (
    <button className="iconbtn ghost fidgetbtn" onClick={onClick} aria-label="Play with the ID card" title="Play with the ID card">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9.5 2.5L12 8l2.5-5.5" /><rect x="6.5" y="8" width="11" height="14" rx="3" /><path d="M10 12.5h4" />
      </svg>
    </button>
  )
}

const ICONS = {
  overview: <><rect x="3" y="3" width="7" height="9" rx="2" /><rect x="14" y="3" width="7" height="5" rx="2" /><rect x="14" y="12" width="7" height="9" rx="2" /><rect x="3" y="16" width="7" height="5" rx="2" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  attendance: <path d="M5 20v-8M12 20V5M19 20v-5" />,
  tasks: <path d="M4 12.5l5 5L20 6.5" />,
  more: <path d="M4 7h16M4 12h16M4 17h16" />,
}

function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  )
}

const QUICK = [['overview', 'Overview'], ['calendar', 'Calendar'], ['attendance', 'Attendance'], ['tasks', 'Tasks']]

// Fixed bar at the bottom of the phone screen.
export function BottomNav({ view, onGo, onMore, pendingCount }) {
  const inQuick = QUICK.some(([id]) => id === view)
  return (
    <nav className="bnav" aria-label="Main">
      {QUICK.map(([id, label]) => (
        <button key={id} className={view === id ? 'on' : ''} onClick={() => onGo(id)} aria-current={view === id ? 'page' : undefined}>
          <Icon name={id} />{label}
        </button>
      ))}
      <button className={!inQuick ? 'on' : ''} onClick={onMore}>
        <Icon name="more" />Menu
        {pendingCount > 0 && <i className="pip" aria-label={`${pendingCount} to mark`} />}
      </button>
    </nav>
  )
}

// Full-screen menu with every tab.
export function NavMenu({ items, view, onGo, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])
  return (
    <div className="drawer" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="drawer-top">
        <span className="eyebrow">Menu</span>
        <button className="iconbtn" onClick={onClose} aria-label="Close menu">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <nav className="drawer-links">
        {items.map((it, i) => (
          <button key={it.id} className={`dlink ${view === it.id ? 'on' : ''}`} style={{ animationDelay: `${i * 40}ms` }} onClick={() => onGo(it.id)}>
            <Roll>{it.label}</Roll>{it.badge ? <sup className="count">{it.badge}</sup> : null}
          </button>
        ))}
      </nav>
    </div>
  )
}
