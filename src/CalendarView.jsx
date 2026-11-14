import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient.js'
import { addDays, addMonths, mondayOf, monthGrid, fmt, toMin, nowIST } from './dateUtils.js'
import { toBlocks, blockState, layout, isStarted, STATE_LABEL, STATE_BADGE } from './calendarLogic.js'
import { withQueue } from './attendance.js'
import AttendancePanel from './AttendancePanel.jsx'
import RemarksPanel from './RemarksPanel.jsx'
import ExtraClassForm from './ExtraClassForm.jsx'
import useSwipe from './useSwipe.js'
import useBackClose from './useBack.js'

const PX = 52 // pixels per hour
const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function TimeGrid({ days, byDay, now, onOpen, onDay }) {
  const all = days.flatMap((d) => byDay[d] || [])
  const startH = Math.min(8, ...all.map((b) => Math.floor(toMin(b.start) / 60)))
  const endH = Math.max(17, ...all.map((b) => Math.ceil(toMin(b.end) / 60)))
  const hours = Array.from({ length: endH - startH }, (_, i) => startH + i)
  const height = (endH - startH) * PX
  const cols = `44px repeat(${days.length}, minmax(0, 1fr))`
  const lines = {
    height,
    backgroundImage: `repeating-linear-gradient(to bottom, var(--line) 0, var(--line) 1px, transparent 1px, transparent ${PX}px)`,
  }
  return (
    <div className="scroll">
      <div className="tg" style={{ gridTemplateColumns: cols, minWidth: days.length > 1 ? 560 : 0 }}>
        <div />
        {days.map((d) => (
          <button key={d} className={`tghead ${d === now.date ? 'today' : ''}`} onClick={() => onDay(d)}>
            {fmt(d, { weekday: 'short' })} {fmt(d, { day: 'numeric' })}
          </button>
        ))}
        <div className="hours" style={{ height }}>
          {hours.map((h) => <span key={h} style={{ top: (h - startH) * PX }}>{String(h).padStart(2, '0')}:00</span>)}
        </div>
        {days.map((d) => (
          <div key={d} className={`tgcol ${d === now.date ? 'today' : ''}`} style={lines}>
            {layout(byDay[d] || []).map((b) => {
              const st = blockState(b, now)
              const top = ((toMin(b.start) - startH * 60) * PX) / 60
              const h = Math.max(24, ((toMin(b.end) - toMin(b.start)) * PX) / 60 - 2)
              return (
                <button
                  key={b.key}
                  className={`blk ${st}`}
                  title={`${b.subject} ${b.start}–${b.end}${b.faculty ? ` · ${b.faculty}` : ''}`}
                  style={{ top, height: h, left: `${(b.lane * 100) / b.lanes}%`, width: `${100 / b.lanes}%`, borderLeftColor: b.colour, background: `${b.colour}22` }}
                  onClick={() => onOpen(b)}
                >
                  <strong>{b.subject}</strong>
                  <span>{b.start}–{b.end}{b.room ? ` · ${b.room}` : ''}</span>
                  {b.faculty && <span className="fac">{b.faculty}</span>}
                  {STATE_BADGE[st] && <span className={`badge ${st}`}>{STATE_BADGE[st]}</span>}
                </button>
              )
            })}
            {d === now.date && now.minutes >= startH * 60 && now.minutes <= endH * 60 && (
              <div className="nowline" style={{ top: ((now.minutes - startH * 60) * PX) / 60 }} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function MonthGrid({ date, byDay, now, onDay }) {
  return (
    <div className="month">
      {WEEKDAY_SHORT.map((w) => <div key={w} className="mhead">{w}</div>)}
      {monthGrid(date).map((d) => {
        const list = byDay[d] || []
        return (
          <button key={d} className={`mcell ${d.slice(0, 7) !== date.slice(0, 7) ? 'other' : ''} ${d === now.date ? 'today' : ''}`} onClick={() => onDay(d)}>
            <span className="mnum">{Number(d.slice(8))}</span>
            {list.slice(0, 3).map((b) => (
              <span key={b.key} className={`chip ${blockState(b, now)}`} style={{ background: `${b.colour}30`, borderLeftColor: b.colour }}>{b.subject}</span>
            ))}
            {list.length > 3 && <span className="more">+{list.length - 3}</span>}
          </button>
        )
      })}
    </div>
  )
}

export default function CalendarView({ semester, onMark }) {
  const [view, setView] = useState(() => (window.innerWidth < 700 ? 'day' : 'week'))
  const [now, setNow] = useState(nowIST())
  const [date, setDate] = useState(() => {
    const t = nowIST().date
    return t < semester.start_date ? semester.start_date : t > semester.end_date ? semester.end_date : t
  })
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openKey, setOpenKey] = useState(null)
  const [reload, setReload] = useState(0)
  const [tick, setTick] = useState(0)
  const [subjects, setSubjects] = useState([])
  const [extra, setExtra] = useState(null) // { swapOf: block | null }
  const [note, setNote] = useState('')
  const [slide, setSlide] = useState('') // direction of the last swipe, used for the slide animation

  useEffect(() => {
    supabase.from('subjects').select('id, name').eq('semester_id', semester.id).order('name')
      .then(({ data }) => { if (data) setSubjects(data) })
  }, [semester.id])

  // Phone / browser Back closes the open window instead of leaving the app.
  useBackClose(Boolean(openKey), () => setOpenKey(null))
  useBackClose(Boolean(extra), () => setExtra(null))

  // Esc closes whatever window is open.
  useEffect(() => {
    if (!openKey && !extra) return
    const onKey = (e) => { if (e.key === 'Escape') { if (extra) setExtra(null); else setOpenKey(null) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openKey, extra])

  useEffect(() => { const t = setInterval(() => setNow(nowIST()), 60000); return () => clearInterval(t) }, [])

  const range = useMemo(() => {
    if (view === 'day') return [date, date]
    if (view === 'week') { const m = mondayOf(date); return [m, addDays(m, 6)] }
    const g = monthGrid(date)
    return [g[0], g[41]]
  }, [view, date])

  useEffect(() => {
    let off = false
    setLoading(true)
    supabase.from('sessions').select('*, subjects(name, colour), attendance(status, reason)')
      .eq('semester_id', semester.id).gte('session_date', range[0]).lte('session_date', range[1])
      .order('start_time')
      .then(({ data, error: err }) => {
        if (off) return
        if (err) setError('Could not load classes. Check your internet connection.')
        else { setError(''); setRows(data) }
        setLoading(false)
      })
    return () => { off = true }
  }, [semester.id, range, reload])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const blocks = useMemo(() => toBlocks(withQueue(rows)), [rows, tick])
  const byDay = useMemo(() => {
    const out = {}
    for (const b of blocks) (out[b.date] ||= []).push(b)
    return out
  }, [blocks])
  const open = openKey ? blocks.find((b) => b.key === openKey) : null

  const move = (dir) => {
    setSlide(view === 'day' ? (dir > 0 ? 'next' : 'prev') : '')
    setDate(view === 'month' ? addMonths(date, dir) : addDays(date, dir * (view === 'day' ? 1 : 7)))
  }
  // Day view: swipe left for the next day, right for the previous day.
  const swipe = useSwipe({ onLeft: () => move(1), onRight: () => move(-1) })

  // Day view on a computer: arrow keys change the day (not while a window or a text box is open).
  useEffect(() => {
    if (view !== 'day' || openKey || extra) return
    const onKey = (e) => {
      const tag = (e.target && e.target.tagName) || ''
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || e.altKey || e.ctrlKey || e.metaKey) return
      if (e.key === 'ArrowLeft') move(-1)
      else if (e.key === 'ArrowRight') move(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const weekDays = () => {
    const m = mondayOf(date)
    const n = [5, 6].some((i) => (byDay[addDays(m, i)] || []).length) ? (byDay[addDays(m, 6)]?.length ? 7 : 6) : 5
    return Array.from({ length: n }, (_, i) => addDays(m, i))
  }

  const title = view === 'day' ? fmt(date, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
    : view === 'week' ? `${fmt(mondayOf(date), { day: 'numeric', month: 'short' })} – ${fmt(addDays(mondayOf(date), 6), { day: 'numeric', month: 'short', year: 'numeric' })}`
    : fmt(date, { month: 'long', year: 'numeric' })

  async function setStatus(block, status) {
    const { error: err } = await supabase.from('sessions').update({ status }).in('id', block.ids)
    if (err) { setError('Could not update the class. Try again.'); return }
    setOpenKey(null)
    setReload(reload + 1)
  }

  async function mark(marks) {
    try {
      const r = await onMark(marks)
      if (r.queued) setTick(tick + 1)
      else setReload(reload + 1)
    } catch {
      setError('Could not save attendance. Please try again.')
    }
  }

  async function deleteExtra(block) {
    if (!window.confirm(`Delete this extra class (${block.subject}, ${block.start}–${block.end})?\n\nIts attendance marks are removed too.`)) return
    const { error: err } = await supabase.from('sessions').delete().in('id', block.ids)
    if (err) { setError('Could not delete the class. Try again.'); return }
    setOpenKey(null)
    setNote('Extra class deleted. If it replaced another class, restore that class from the Calendar.')
    setReload(reload + 1)
  }

  const goDay = (d) => { setSlide(''); setDate(d); setView('day') }
  const openState = open ? blockState(open, now) : null

  return (
    <section className="panel">
      <header className="calhead">
        <p className="eyebrow">{semester.name} · {view === 'day' ? 'Day' : view === 'week' ? 'Week' : 'Month'}</p>
        <h2 className="caltitle">{title}</h2>
      </header>
      <div className="calctl">
        <div className="calnav">
          <button className="iconbtn ghost" onClick={() => move(-1)} aria-label="Previous">‹</button>
          <button className="iconbtn ghost" onClick={() => move(1)} aria-label="Next">›</button>
          <button className="secondary small" onClick={() => { setSlide(''); setDate(now.date) }}>Today</button>
          <button className="secondary small extra" disabled={!subjects.length} onClick={() => { setNote(''); setExtra({ swapOf: null }) }}><span className="plus">+</span>Extra class</button>
        </div>
        <div className="seg">
          {['day', 'week', 'month'].map((v) => (
            <button key={v} className={view === v ? 'on' : ''} onClick={() => { setSlide(''); setView(v) }}>{v[0].toUpperCase() + v.slice(1)}</button>
          ))}
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {note && <p className="notice">{note}</p>}
      {view === 'day' && (
        <div className="daystrip" role="group" aria-label="Days of this week">
          {Array.from({ length: 7 }, (_, i) => addDays(mondayOf(date), i)).map((d) => (
            <button
              key={d}
              className={`dchip ${d === date ? 'on' : ''} ${d === now.date ? 'today' : ''}`}
              aria-pressed={d === date}
              onClick={() => { setSlide(d > date ? 'next' : d < date ? 'prev' : ''); setDate(d) }}
            >
              {fmt(d, { weekday: 'short' })}<b>{Number(d.slice(8))}</b>
            </button>
          ))}
        </div>
      )}
      {view === 'day' ? (
        <div key={date} className={`dayswipe ${slide ? `slide-${slide}` : ''}`} {...swipe}>
          {loading && !rows.length ? <p className="muted">Loading…</p> : <TimeGrid days={[date]} byDay={byDay} now={now} onOpen={(b) => setOpenKey(b.key)} onDay={goDay} />}
          {!loading && !(byDay[date] || []).length && <p className="muted">No classes on this day.</p>}
        </div>
      ) : loading && !rows.length ? <p className="muted">Loading…</p> : view === 'month'
        ? <MonthGrid date={date} byDay={byDay} now={now} onDay={goDay} />
        : <TimeGrid days={weekDays()} byDay={byDay} now={now} onOpen={(b) => setOpenKey(b.key)} onDay={goDay} />}
      <p className="legend muted">Tap a class to mark attendance. Cancelled classes are struck through.{view === 'day' ? ' Swipe left or right to change the day.' : ''}</p>

      {open && createPortal(
        <div className="backdrop" onClick={() => setOpenKey(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h3 style={{ borderLeft: `6px solid ${open.colour}`, paddingLeft: 10, marginTop: 0 }}>{open.subject}</h3>
            <p>{fmt(open.date, { weekday: 'long', day: 'numeric', month: 'long' })}<br />{open.start}–{open.end}{open.parts > 1 ? ` · ${open.parts} sessions` : ''}</p>
            <p>Room: {open.room || '—'}<br />Faculty: {open.faculty || '—'}</p>
            <p><strong>{STATE_LABEL[openState]}</strong>{open.isExtra ? ' · Extra class' : ''}</p>
            {open.status === 'scheduled' && <AttendancePanel key={open.key} list={open.list} onMark={mark} />}
            {open.status === 'scheduled' && isStarted(open.date, open.start, now) && (
              <RemarksPanel semesterId={semester.id} subjectId={open.subjectId} date={open.date} start={open.start} />
            )}
            <div className="row">
              {open.status === 'holiday'
                ? <span className="muted">This day is a holiday. Change it under Leave &amp; holidays.</span>
                : open.status === 'cancelled'
                ? <button className="secondary" onClick={() => setStatus(open, 'scheduled')}>Restore class</button>
                : <button className="secondary" onClick={() => setStatus(open, 'cancelled')}>Mark as cancelled</button>}
              {open.status === 'scheduled' && !open.isExtra && subjects.length > 1 && (
                <button className="secondary" onClick={() => { setNote(''); setExtra({ swapOf: open }); setOpenKey(null) }}>Swap with another class</button>
              )}
              {open.isExtra && <button className="secondary danger" onClick={() => deleteExtra(open)}>Delete extra class</button>}
              <button className="secondary" onClick={() => setOpenKey(null)}>Close</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {extra && createPortal(
        <div className="backdrop" onClick={() => setExtra(null)}>
          <ExtraClassForm
            semester={semester} subjects={subjects} swapOf={extra.swapOf}
            defaults={extra.swapOf ? { date: extra.swapOf.date, start: extra.swapOf.start, end: extra.swapOf.end, room: extra.swapOf.room } : { date }}
            onDone={(m) => { setExtra(null); setNote(m); setReload(reload + 1) }}
            onCancel={() => setExtra(null)}
          />
        </div>,
        document.body
      )}
    </section>
  )
}
