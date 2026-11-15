import { useState } from 'react'
import { supabase } from './supabaseClient.js'
import { PALETTE, DAYS, WEEK_ORDER } from './config.js'
import { nowIST } from './dateUtils.js'
import { generateSessions, timeError } from './slotEdit.js'
import { syncHolidays } from './holidays.js'

export function AddSubjectForm({ semester, userId, onDone, onCancel }) {
  const [name, setName] = useState('')
  const [colour, setColour] = useState(PALETTE[0])
  const [pct, setPct] = useState(75)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    const n = name.trim().replace(/\s+/g, ' ')
    const p = Number(pct)
    if (!n) { setErr('Enter a subject name.'); return }
    if (!(p >= 1 && p <= 100)) { setErr('Required % must be between 1 and 100.'); return }
    setBusy(true); setErr('')
    const r = await supabase.from('subjects').insert({ user_id: userId, semester_id: semester.id, name: n, colour, required_pct: p })
    if (r.error) {
      setErr(r.error.code === '23505' ? 'A subject with this name already exists.' : r.error.message)
      setBusy(false)
      return
    }
    // If it was removed earlier, a future import may use it again (optional table).
    await supabase.from('ignored_subjects').delete().eq('semester_id', semester.id).eq('name_key', n.toLowerCase())
    onDone(`Added subject "${n}". Now add its weekly classes under Weekly timetable.`)
  }

  return (
    <div className="editform">
      <div className="formgrid">
        <label>Subject name<input type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Required %<input type="number" min="1" max="100" value={pct} onChange={(e) => setPct(e.target.value)} /></label>
      </div>
      <p className="muted">Colour</p>
      <div className="chips">
        {PALETTE.map((c) => (
          <button key={c} className="swatch" aria-label={`Colour ${c}`} aria-pressed={colour === c} style={{ background: c, outline: colour === c ? '3px solid var(--ink)' : 'none' }} onClick={() => setColour(c)} />
        ))}
      </div>
      {err && <p className="error">{err}</p>}
      <div className="row">
        <button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Add subject'}</button>
        <button className="secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  )
}

export function AddClassForm({ semester, subjects, userId, onDone, onCancel }) {
  const [f, setF] = useState({ subjectId: subjects[0]?.id || '', weekday: 1, start: '', end: '', sessions: 1, room: '', faculty: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function save() {
    const n = Number(f.sessions)
    const te = timeError(f.start, f.end)
    if (!f.subjectId) { setErr('Add a subject first.'); return }
    if (te) { setErr(te); return }
    if (!Number.isInteger(n) || n < 1 || n > 6) { setErr('Sessions must be a whole number from 1 to 6.'); return }
    setBusy(true); setErr('')
    const weekday = Number(f.weekday)
    const slot = await supabase.from('timetable_slots').insert({
      user_id: userId, semester_id: semester.id, subject_id: f.subjectId, weekday,
      start_time: f.start, end_time: f.end, room: f.room.trim(), faculty: f.faculty.trim(), sessions_per_class: n,
    }).select().single()
    if (slot.error) {
      setErr(slot.error.code === '23505' ? 'This subject already has a class on that day at that start time.' : slot.error.message)
      setBusy(false)
      return
    }
    const today = nowIST().date
    const rows = generateSessions({
      slotId: slot.data.id, subjectId: f.subjectId, semesterId: semester.id, weekday, start: f.start, end: f.end, n,
      room: f.room.trim(), faculty: f.faculty.trim(),
      from: semester.start_date > today ? semester.start_date : today, to: semester.end_date,
    }).map((r) => ({ ...r, user_id: userId }))
    for (let i = 0; i < rows.length; i += 400) {
      const r = await supabase.from('sessions').insert(rows.slice(i, i + 400))
      if (r.error) {
        await supabase.from('timetable_slots').delete().eq('id', slot.data.id) // undo the half-finished class
        setErr(r.error.message); setBusy(false)
        return
      }
    }
    await syncHolidays(semester.id)
    onDone(`Added the weekly class (${rows.length} sessions from today to the end of the semester).`)
  }

  return (
    <div className="editform">
      <div className="formgrid">
        <label>Subject
          <select value={f.subjectId} onChange={set('subjectId')}>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label>Day
          <select value={f.weekday} onChange={set('weekday')}>
            {WEEK_ORDER.map((d) => <option key={d} value={d}>{DAYS[d]}</option>)}
          </select>
        </label>
        <label>Start<input type="time" value={f.start} onChange={set('start')} /></label>
        <label>End<input type="time" value={f.end} onChange={set('end')} /></label>
        <label>Sessions<input type="number" min="1" max="6" value={f.sessions} onChange={set('sessions')} /></label>
        <label>Room<input type="text" value={f.room} onChange={set('room')} /></label>
        <label>Faculty<input type="text" value={f.faculty} onChange={set('faculty')} /></label>
      </div>
      {err && <p className="error">{err}</p>}
      <div className="row">
        <button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Add weekly class'}</button>
        <button className="secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  )
}
