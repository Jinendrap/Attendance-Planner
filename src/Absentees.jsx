import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient.js'
import { hhmm } from './config.js'
import { fmt, toMin } from './dateUtils.js'

const dur = (min) => {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`
}

// Table of every class you were absent for: date, day, class, duration and reason.
export default function Absentees({ semester, version }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [subject, setSubject] = useState('all')

  useEffect(() => {
    let off = false
    supabase.from('sessions')
      .select('id, session_date, start_time, end_time, google_event_id, subjects(name, colour), attendance!inner(status, reason)')
      .eq('semester_id', semester.id).eq('attendance.status', 'absent')
      .order('session_date', { ascending: false }).order('start_time')
      .then(({ data, error: err }) => {
        if (off) return
        if (err) { setError('Could not load absences. Check your internet connection.'); return }
        setError('')
        setRows(data)
      })
    return () => { off = true }
  }, [semester.id, version])

  // One line per class (the sessions of a 2-hour class are joined together).
  const list = useMemo(() => {
    const map = new Map()
    for (const r of rows || []) {
      const key = r.google_event_id || r.id
      const att = Array.isArray(r.attendance) ? r.attendance[0] : r.attendance
      const start = hhmm(r.start_time)
      const end = hhmm(r.end_time)
      if (!map.has(key)) map.set(key, { key, date: r.session_date, start, end, subject: r.subjects?.name || 'Class', colour: r.subjects?.colour, sessions: 0, reasons: [] })
      const b = map.get(key)
      b.sessions += 1
      if (start < b.start) b.start = start
      if (end > b.end) b.end = end
      if (att?.reason && !b.reasons.includes(att.reason)) b.reasons.push(att.reason)
    }
    return [...map.values()].sort((a, b) => (a.date === b.date ? a.start.localeCompare(b.start) : b.date.localeCompare(a.date)))
  }, [rows])

  const names = [...new Set(list.map((b) => b.subject))].sort()
  const shown = subject === 'all' ? list : list.filter((b) => b.subject === subject)
  const totalMin = shown.reduce((n, b) => n + (toMin(b.end) - toMin(b.start)), 0)

  return (
    <section className="panel">
      <div className="sechead">
        <h3>Absences</h3>
        {list.length > 0 && (
          <select className="inline" aria-label="Filter by subject" value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="all">All subjects</option>
            {names.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      {!error && rows === null && <p className="muted">Loading…</p>}
      {!error && rows !== null && !list.length && <p className="muted">No absences so far. Keep it up.</p>}
      {shown.length > 0 && (
        <div className="scroll">
          <table className="abs">
            <thead>
              <tr><th>Date</th><th>Day</th><th>Class</th><th>Duration</th><th>Reason</th></tr>
            </thead>
            <tbody>
              {shown.map((b) => (
                <tr key={b.key}>
                  <td data-l="Date" className="nowrap">{fmt(b.date, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td data-l="Day">{fmt(b.date, { weekday: 'long' })}</td>
                  <td data-l="Class" className="cls"><span className="dot" style={{ background: b.colour }} />{b.subject}</td>
                  <td data-l="Duration" className="nowrap">{dur(toMin(b.end) - toMin(b.start))}<br /><span className="muted small-text">{b.start}–{b.end}{b.sessions > 1 ? ` · ${b.sessions} sessions` : ''}</span></td>
                  <td data-l="Reason">{b.reasons.length ? b.reasons.join(', ') : <span className="muted">No reason</span>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="totalrow"><td colSpan={3}>{shown.length} {shown.length === 1 ? 'class' : 'classes'} missed</td><td colSpan={2}>{dur(totalMin)} in total</td></tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}
