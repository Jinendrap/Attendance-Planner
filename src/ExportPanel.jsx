import { useState } from 'react'
import { supabase } from './supabaseClient.js'
import { buildDashboard } from './engine.js'
import { nowIST, weekdayOf } from './dateUtils.js'
import { DAYS, hhmm } from './config.js'
import { attOf } from './calendarLogic.js'
import { toCsv, downloadCsv } from './csv.js'
import { groupAbsences, absenceMinutes, dur } from './absenceLogic.js'
import { fmt } from './dateUtils.js'

async function allSessions(semesterId) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('sessions')
      .select('subject_id, session_date, start_time, end_time, room, faculty, status, is_extra, subjects(name), attendance(status, reason)')
      .eq('semester_id', semesterId).order('session_date').order('start_time').range(from, from + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

async function absentSessions(semesterId) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('sessions')
      .select('id, session_date, start_time, end_time, google_event_id, slot_id, subject_id, subjects(name, colour), attendance!inner(status, reason)')
      .eq('semester_id', semesterId).eq('attendance.status', 'absent')
      .order('session_date').order('start_time').range(from, from + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

const statusText = (r) => { const a = attOf(r); return a ? (a.status === 'present' ? 'Present' : 'Absent') : 'Not marked' }

export default function ExportPanel({ semester }) {
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const stamp = nowIST().date
  const slug = semester.name.toLowerCase().replace(/\s+/g, '-')

  async function run(kind) {
    setBusy(kind); setMsg('')
    try {
      if (kind === 'sessions' || kind === 'summary') {
        const sessions = await allSessions(semester.id)
        if (kind === 'sessions') {
          downloadCsv(`${slug}-classes-${stamp}.csv`, toCsv([
            { label: 'Date', value: (r) => r.session_date },
            { label: 'Day', value: (r) => DAYS[weekdayOf(r.session_date)] },
            { label: 'Subject', value: (r) => r.subjects?.name },
            { label: 'Start', value: (r) => hhmm(r.start_time) },
            { label: 'End', value: (r) => hhmm(r.end_time) },
            { label: 'Room', value: (r) => r.room },
            { label: 'Faculty', value: (r) => r.faculty },
            { label: 'Class status', value: (r) => r.status },
            { label: 'Extra class', value: (r) => (r.is_extra ? 'Yes' : 'No') },
            { label: 'Attendance', value: statusText },
            { label: 'Reason for absence', value: (r) => attOf(r)?.reason || '' },
          ], sessions))
        } else {
          const subs = await supabase.from('subjects').select('*').eq('semester_id', semester.id)
          if (subs.error) throw subs.error
          const d = buildDashboard(subs.data, sessions, semester.overall_required_pct, nowIST())
          const rows = [...d.rows.map((r) => ({ name: r.subject.name, ...r })), { name: 'OVERALL', ...d.overall, remaining: '' }]
          downloadCsv(`${slug}-attendance-summary-${stamp}.csv`, toCsv([
            { label: 'Subject', value: (r) => r.name },
            { label: 'Required %', value: (r) => r.required },
            { label: 'Conducted (marked)', value: (r) => r.T },
            { label: 'Attended', value: (r) => r.A },
            { label: 'Missed', value: (r) => r.absent },
            { label: 'Attendance %', value: (r) => (r.pct === null ? '' : r.pct.toFixed(2)) },
            { label: 'Status', value: (r) => ({ safe: 'On track', edge: 'On the limit', below: 'Below required', none: 'No data' })[r.state] },
            { label: 'Classes still to come', value: (r) => r.remaining },
          ], rows))
        }
      } else if (kind === 'absences') {
        const list = groupAbsences(await absentSessions(semester.id))
        downloadCsv(`${slug}-absences-${stamp}.csv`, toCsv([
          { label: 'Date', value: (b) => b.date },
          { label: 'Day', value: (b) => fmt(b.date, { weekday: 'long' }) },
          { label: 'Class', value: (b) => b.subject },
          { label: 'Start', value: (b) => b.start },
          { label: 'End', value: (b) => b.end },
          { label: 'Duration', value: (b) => dur(absenceMinutes(b)) },
          { label: 'Sessions', value: (b) => b.sessions },
          { label: 'Reason', value: (b) => b.reasons.join(', ') },
        ], list))
      } else if (kind === 'tasks') {
        const [t, s] = await Promise.all([
          supabase.from('tasks').select('*').eq('semester_id', semester.id).order('due_date', { nullsFirst: false }),
          supabase.from('subjects').select('id, name').eq('semester_id', semester.id),
        ])
        if (t.error || s.error) throw t.error || s.error
        const name = new Map(s.data.map((x) => [x.id, x.name]))
        downloadCsv(`${slug}-tasks-${stamp}.csv`, toCsv([
          { label: 'Title', value: (r) => r.title },
          { label: 'Subject', value: (r) => name.get(r.subject_id) || '' },
          { label: 'Type', value: (r) => r.kind },
          { label: 'Deadline', value: (r) => r.due_date || '' },
          { label: 'Done', value: (r) => (r.done ? 'Yes' : 'No') },
          { label: 'Completed on', value: (r) => (r.done_at ? r.done_at.slice(0, 10) : '') },
        ], t.data))
      } else {
        const r = await supabase.from('class_remarks').select('*, subjects(name)').eq('semester_id', semester.id).order('class_date')
        if (r.error) throw r.error
        downloadCsv(`${slug}-remarks-${stamp}.csv`, toCsv([
          { label: 'Class date', value: (x) => x.class_date },
          { label: 'Start', value: (x) => hhmm(x.class_start) },
          { label: 'Subject', value: (x) => x.subjects?.name },
          { label: 'Remark', value: (x) => x.note },
          { label: 'Deadline', value: (x) => x.due_date || '' },
        ], r.data))
      }
      setMsg('Downloaded. Check your Downloads folder.')
    } catch {
      setMsg('Could not export. Check your internet connection and try again.')
    }
    setBusy('')
  }

  const B = ({ k, children }) => <button className="secondary" disabled={Boolean(busy)} onClick={() => run(k)}>{busy === k ? 'Preparing…' : children}</button>

  return (
    <section className="panel">
      <h2>Export &amp; backup</h2>
      <p className="muted">Downloads your data as CSV files that open in Excel or Google Sheets. Keep a copy now and then as your backup.</p>
      <div className="row nomargin">
        <B k="summary">Attendance summary</B>
        <B k="sessions">All classes</B>
        <B k="absences">Absence table</B>
        <B k="tasks">Tasks</B>
        <B k="remarks">Remarks</B>
      </div>
      {msg && <p className="notice phonemsg">{msg}</p>}
    </section>
  )
}
