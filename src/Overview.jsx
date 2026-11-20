import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient.js'
import { fetchAllSessions, withQueue } from './attendance.js'
import { buildDashboard } from './engine.js'
import { nowIST, fmt, toMin, addDays } from './dateUtils.js'
import { toBlocks, blockState, STATE_LABEL } from './calendarLogic.js'
import { checkHours } from './hoursLogic.js'
import { groupTasks, dueLabel } from './taskLogic.js'
import RemarksPanel from './RemarksPanel.jsx'
import AttendancePanel from './AttendancePanel.jsx'
import Pencil from './Pencil.jsx'

const fmtPct = (p) => (p === null ? '—' : `${p.toFixed(2)}%`)
const STATE_TEXT = { safe: 'On track', edge: 'On the limit', below: 'Below required', none: 'No data' }
const daysBetween = (a, b) => {
  const t = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.round((t(b) - t(a)) / 864e5)
}

export default function Overview({ semester, version, pendingCount, onGo, onMark }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(null) // key of the class whose remarks are showing
  const [attOpen, setAttOpen] = useState(null) // key of the class whose attendance panel is showing
  // The clock ticks, so "Next up" moves on by itself when a class starts or ends.
  const [now, setNow] = useState(nowIST)
  useEffect(() => {
    const tick = () => setNow(nowIST())
    const t = setInterval(tick, 20000)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick) }
  }, [])

  useEffect(() => {
    let off = false
    ;(async () => {
      try {
        const today = nowIST().date
        const [s, all, todayRows, aheadRows, tasks, remarks] = await Promise.all([
          supabase.from('subjects').select('*').eq('semester_id', semester.id),
          fetchAllSessions(semester.id),
          supabase.from('sessions').select('*, subjects(name, colour), attendance(status, reason)')
            .eq('semester_id', semester.id).eq('session_date', today).order('start_time'),
          // the next few days, for when nothing is left today
          supabase.from('sessions').select('*, subjects(name, colour), attendance(status, reason)')
            .eq('semester_id', semester.id).gt('session_date', today).order('session_date').order('start_time').limit(40),
          supabase.from('tasks').select('*, subjects(name, colour)').eq('semester_id', semester.id).eq('done', false),
          supabase.from('class_remarks').select('*, subjects(name, colour)').eq('semester_id', semester.id)
            .order('created_at', { ascending: false }).limit(5),
        ])
        if (s.error) throw s.error
        if (todayRows.error) throw todayRows.error
        if (off) return
        setData({
          dash: buildDashboard(s.data, all, semester.overall_required_pct, nowIST()),
          blocks: toBlocks(withQueue(todayRows.data)),
          ahead: aheadRows.error ? [] : toBlocks(withQueue(aheadRows.data)),
          hoursOver: checkHours(s.data, all).reduce((n, r) => n + r.removable.length, 0),
          tasks: tasks.error ? null : tasks.data,
          remarks: remarks.error ? null : remarks.data,
        })
        setError('')
      } catch {
        if (!off) setError('Could not load the overview. Check your internet connection.')
      }
    })()
    return () => { off = true }
  }, [semester.id, semester.overall_required_pct, version])

  if (error) return <section className="panel"><p className="error">{error}</p></section>
  if (!data) return <section className="panel"><p className="muted">Loading…</p></section>

  const { dash, blocks, ahead, hoursOver, tasks, remarks } = data
  const o = dash.overall
  const risk = dash.rows.filter((r) => r.state === 'below' || r.state === 'edge')
  const g = tasks ? groupTasks(tasks, now.date) : null
  const urgent = g ? [...g.overdue, ...g.today, ...g.soon] : []
  // Earliest first (the blocks come grouped by subject, not by time).
  const byTime = (a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start)
  const todays = blocks.filter((b) => b.status === 'scheduled').sort(byTime)
  const live = todays.find((b) => toMin(b.start) <= now.minutes && toMin(b.end) > now.minutes)
  const upcoming = todays.find((b) => toMin(b.start) > now.minutes)
  const later = !live && !upcoming ? ahead.filter((b) => b.status === 'scheduled').sort(byTime)[0] : null
  const focus = live || upcoming || later
  const laterDay = later ? (later.date === addDays(now.date, 1) ? 'Tomorrow' : fmt(later.date, { weekday: 'long', day: 'numeric', month: 'short' })) : ''
  const daysLeft = Math.max(0, daysBetween(now.date, semester.end_date))

  return (
    <>
      <header className="masthead">
        <p className="eyebrow">{semester.name}</p>
        <h1 className="display">{fmt(now.date, { weekday: 'long' })}<br /><span>{fmt(now.date, { day: 'numeric', month: 'long' })}</span></h1>
      </header>

      <div className="bento">
        <button className={`tile hero ${o.state} s4`} onClick={() => onGo('attendance')}>
          <span className="row spread nomargin" style={{ width: '100%' }}>
            <span className="eyebrow" style={{ color: 'rgba(255,255,255,.8)' }}>Overall attendance</span>
            <span className={`pill ${o.state}`}>{STATE_TEXT[o.state]}</span>
          </span>
          <span className={`big bigpct ${o.state}`}>{fmtPct(o.pct)}</span>
          <span style={{ width: '100%' }}>
            <span className="bar" role="img" aria-label={`Attendance ${fmtPct(o.pct)}, required ${o.required}%`}>
              <span className={`fill ${o.state}`} style={{ width: `${o.pct ?? 0}%` }} />
              <span className="req" style={{ left: `${o.required}%` }} />
            </span>
            <span className="muted">{o.A} of {o.T} classes attended · need {o.required}%</span>
          </span>
        </button>

        <div className="tile next s2 m2">
          <span className="eyebrow">{live ? 'Happening now' : later ? `Next up · ${laterDay}` : 'Next up'}</span>
          {focus ? (
            <>
              <span>
                <span className="circled big">{focus.start}<Pencil seed={1} sw={4} fx={0.28} fy={0.5} maxX={34} maxY={20} /></span>
                <span style={{ display: 'block', marginTop: 12 }}><strong>{focus.subject}</strong></span>
                <span className="muted">{focus.end ? `until ${focus.end}` : ''}{focus.room ? ` · ${focus.room}` : ''}{focus.faculty ? ` · ${focus.faculty}` : ''}</span>
              </span>
              <span className="hand">{live ? 'you are here!' : later ? 'see you then →' : 'see you there →'}</span>
            </>
          ) : (
            <span className="big" style={{ fontSize: '1.6rem' }}>{todays.length ? 'All done for today' : 'No classes today'}</span>
          )}
        </div>

        <button className="tile s2" onClick={() => onGo('pending')}>
          <span className="muted">To mark</span>
          <span className={`big ${dash.pending ? 'warn' : ''}`}>{pendingCount}</span>
          <span className="muted">classes waiting</span>
        </button>
        <button className="tile s2" onClick={() => onGo('tasks')}>
          <span className="muted">Deadlines</span>
          <span className={`big ${g && g.overdue.length ? 'warn' : ''}`}>{g ? urgent.length : '—'}</span>
          <span className="muted">{g && g.overdue.length ? `due soon (${g.overdue.length} overdue)` : 'due in 7 days'}</span>
        </button>
        <div className="tile s2 m2 compact" style={{ cursor: 'default' }}>
          <span className="muted">{semester.name}</span>
          <span className="big">{daysLeft}</span>
          <span className="muted">{daysLeft === 1 ? 'day' : 'days'} left</span>
        </div>

        <section className="panel s6">
          <div className="sechead">
            <h3>Today’s classes</h3>
            <button className="link" onClick={() => onGo('calendar')}>Open calendar</button>
          </div>
          {!todays.length && <p className="muted">No classes today.</p>}
          {todays.map((b) => {
            const st = blockState(b, now)
            const marked = ['present', 'absent', 'partial'].includes(st)
            return (
              <div className="crow" key={b.key} style={{ borderLeftColor: b.colour }}>
                <span className="t">{b.start}<br />{b.end}</span>
                <span><strong>{b.subject}</strong><br /><span className="muted small-text">{[b.room, b.faculty].filter(Boolean).join(' · ') || '—'}</span></span>
                <span className={`badge ${st}`}>{STATE_LABEL[st]}</span>
                <div className="actions">
                  <button className={marked || b.exp ? 'secondary small' : 'small'} onClick={() => setAttOpen(attOpen === b.key ? null : b.key)}>
                    {attOpen === b.key ? 'Hide' : b.exp ? 'Experiential · no marking needed' : marked ? 'Change attendance' : 'Mark attendance'}
                  </button>
                  <button className="secondary small" onClick={() => setOpen(open === b.key ? null : b.key)}>{open === b.key ? 'Hide remarks' : 'Remarks'}</button>
                </div>
                {attOpen === b.key && <div className="panelx"><AttendancePanel key={b.key} list={b.list} onMark={onMark} /></div>}
                {open === b.key && (
                  <div className="panelx"><RemarksPanel semesterId={semester.id} subjectId={b.subjectId} date={b.date} start={b.start} onChanged={() => {}} /></div>
                )}
              </div>
            )
          })}
        </section>

        {hoursOver > 0 && (
          <section className="panel s6">
            <div className="sechead">
              <h3>Above credit hours</h3>
              <button className="link" onClick={() => onGo('settings', 'timetable')}>Review</button>
            </div>
            <p className="muted">{hoursOver} scheduled {hoursOver === 1 ? 'class is' : 'classes are'} above your subjects’ credit hours (4 credits = 60 hours). You can remove them in Settings, under Course hours.</p>
          </section>
        )}

        {risk.length > 0 && (
          <section className="panel s3">
            <div className="sechead">
              <h3>Attendance alerts</h3>
              <button className="link" onClick={() => onGo('attendance')}>See details</button>
            </div>
            {risk.map((r) => (
              <div className="slot" key={r.subject.id} style={{ borderLeftColor: r.subject.colour }}>
                <span className="grow"><strong>{r.subject.name}</strong><br /><span className="muted small-text">{fmtPct(r.pct)} · needs {r.required}%</span></span>
                <span className={`pill ${r.state}`}>{r.state === 'below' ? 'Below required' : 'On the limit'}</span>
              </div>
            ))}
          </section>
        )}

        <section className={`panel ${risk.length > 0 ? 's3' : 's6'}`}>
          <div className="sechead">
            <h3>Deadlines</h3>
            <button className="link" onClick={() => onGo('tasks')}>All tasks</button>
          </div>
          {g === null && <p className="error">Run phase8_remarks_tasks.sql in Supabase to turn on tasks.</p>}
          {g && !urgent.length && <p className="muted">Nothing due in the next 7 days.</p>}
          {urgent.slice(0, 5).map((t) => (
            <div className="slot" key={t.id} style={{ borderLeftColor: t.subjects?.colour || 'var(--line)' }}>
              <span className="grow"><strong>{t.title}</strong>{t.subjects?.name ? <><br /><span className="muted small-text">{t.subjects.name}</span></> : null}</span>
              <span className={`pill ${t.due_date < now.date ? 'below' : 'edge'}`}>{dueLabel(t.due_date, now.date)}</span>
            </div>
          ))}
        </section>

        {remarks && remarks.length > 0 && (
          <section className="panel s6">
            <div className="sechead"><h3>Recent remarks</h3></div>
            {remarks.map((x) => (
              <div className="slot" key={x.id} style={{ borderLeftColor: x.subjects?.colour || 'var(--line)' }}>
                <span className="grow"><strong>{x.subjects?.name || 'Class'}</strong> <span className="muted">· {fmt(x.class_date, { day: 'numeric', month: 'short' })}</span><br />{x.note}</span>
              </div>
            ))}
          </section>
        )}

        <section className="cta-block s6">
          <h2 className="display">Planning a break?</h2>
          <p>Pick the dates and see what each leave does to every subject before you take it.</p>
          <button className="cta" onClick={() => onGo('leave')}>Open leave simulator</button>
        </section>
      </div>
    </>
  )
}
