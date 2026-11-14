import { useState } from 'react'
import { supabase } from './supabaseClient.js'

// The profile form. Used for the first-time questions and again in Settings.
export default function ProfilePanel({ profile, defaults, userId, first, onSaved }) {
  const start = profile || defaults
  const [f, setF] = useState({
    full_name: start.full_name || '',
    college: start.college || '',
    course: start.course || '',
    semester_name: start.semester_name || '',
    semester_start: start.semester_start || '',
    semester_end: start.semester_end || '',
    calendar_name: start.calendar_name || '',
  })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [saved, setSaved] = useState(false)
  const set = (k) => (e) => { setSaved(false); setF({ ...f, [k]: e.target.value }) }

  const save = async () => {
    setMsg('')
    if (!f.full_name.trim() || !f.college.trim() || !f.course.trim() || !f.semester_name.trim()) { setMsg('Please fill in your name, college, course and semester.'); return }
    if (!f.semester_start || !f.semester_end || f.semester_end <= f.semester_start) { setMsg('Please choose a semester start date that is before the end date.'); return }
    setBusy(true)
    const row = {
      user_id: userId,
      full_name: f.full_name.trim(), college: f.college.trim(), course: f.course.trim(), semester_name: f.semester_name.trim(),
      semester_start: f.semester_start, semester_end: f.semester_end, calendar_name: f.calendar_name.trim() || null,
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await supabase.from('profiles').upsert(row).select().single()
    setBusy(false)
    if (error) { setMsg('Could not save. Run phase10_profiles.sql in Supabase (see the README), then try again.'); return }
    setSaved(true)
    onSaved(data)
  }

  return (
    <section className="panel" data-enter>
      <p className="eyebrow">{first ? 'Welcome' : 'Profile'}</p>
      <h2>{first ? 'Tell us about your course' : 'Your details'}</h2>
      {first && <p className="muted">A few quick questions. You can change all of this later in Settings.</p>}
      <div className="formgrid profilegrid">
        <label>Your name<input type="text" value={f.full_name} onChange={set('full_name')} autoComplete="name" /></label>
        <label>College or university<input type="text" value={f.college} onChange={set('college')} /></label>
        <label>Course (for example MBA, B.Com)<input type="text" value={f.course} onChange={set('course')} /></label>
        <label>Semester name<input type="text" value={f.semester_name} onChange={set('semester_name')} placeholder="Semester 6" /></label>
        <label>Semester starts<input type="date" value={f.semester_start} onChange={set('semester_start')} /></label>
        <label>Semester ends<input type="date" value={f.semester_end} onChange={set('semester_end')} /></label>
        <label>Google Calendar name (optional)<input type="text" value={f.calendar_name} onChange={set('calendar_name')} placeholder="The calendar holding your timetable" /></label>
      </div>
      {msg && <p className="error">{msg}</p>}
      {saved && !first && <p className="muted">✓ Saved.</p>}
      <div className="row"><button className="cta" disabled={busy} onClick={save}>{busy ? 'Saving…' : first ? 'Continue' : 'Save details'}</button></div>
    </section>
  )
}
