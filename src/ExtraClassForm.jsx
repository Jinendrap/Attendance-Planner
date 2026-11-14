import { useState } from 'react'
import { supabase } from './supabaseClient.js'
import { timeError } from './slotEdit.js'
import { sessionsPerClass } from './importLogic.js'
import { toMin, toHHMM } from './dateUtils.js'

// One-off class (extra) or a class that took the place of another (swap: the original is cancelled).
export default function ExtraClassForm({ semester, subjects, swapOf, defaults, onDone, onCancel }) {
  const first = subjects.find((s) => !swapOf || s.id !== swapOf.subjectId) || subjects[0]
  const [f, setF] = useState({
    subjectId: first?.id || '', date: defaults.date, start: defaults.start || '', end: defaults.end || '',
    sessions: defaults.start && defaults.end ? sessionsPerClass(toMin(defaults.end) - toMin(defaults.start)) : 1,
    room: defaults.room || '', faculty: '',
  })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function save() {
    const n = Number(f.sessions)
    if (!f.subjectId) { setErr('Choose a subject.'); return }
    if (!f.date || f.date < semester.start_date || f.date > semester.end_date) { setErr('The date must be inside the semester.'); return }
    const te = timeError(f.start, f.end)
    if (te) { setErr(te); return }
    if (!(Number.isInteger(n) && n >= 1 && n <= 6)) { setErr('Sessions must be a whole number from 1 to 6.'); return }
    setBusy(true); setErr('')
    const groupId = `extra-${crypto.randomUUID()}`
    const len = (toMin(f.end) - toMin(f.start)) / n
    const rows = Array.from({ length: n }, (_, i) => ({
      semester_id: semester.id, subject_id: f.subjectId, google_event_id: groupId, part: i + 1,
      session_date: f.date, status: 'scheduled', is_extra: true, room: f.room.trim(), faculty: f.faculty.trim(),
      start_time: toHHMM(toMin(f.start) + Math.round(i * len)),
      end_time: i === n - 1 ? f.end : toHHMM(toMin(f.start) + Math.round((i + 1) * len)),
    }))
    const r = await supabase.from('sessions').insert(rows)
    if (r.error) { setErr('Could not add the class. Check your internet connection and try again.'); setBusy(false); return }
    if (swapOf) {
      const c = await supabase.from('sessions').update({ status: 'cancelled' }).in('id', swapOf.ids)
      if (c.error) { onDone('The new class was added, but the original could not be cancelled. Cancel it from the Calendar.'); return }
    }
    onDone(swapOf ? 'Swap saved: the original class is cancelled and the new class is added.' : 'Extra class added.')
  }

  return (
    <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
      <h3 style={{ marginTop: 0 }}>{swapOf ? `Swap “${swapOf.subject}”` : 'Add an extra class'}</h3>
      {swapOf && <p className="muted">The original class is cancelled (it will not count) and the class below takes its place. You can undo this by restoring the original and deleting the new one.</p>}
      <div className="formgrid">
        <label>{swapOf ? 'Class taking its place' : 'Subject'}
          <select value={f.subjectId} onChange={set('subjectId')}>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label>Date<input type="date" value={f.date} min={semester.start_date} max={semester.end_date} onChange={set('date')} /></label>
        <label>Start<input type="time" value={f.start} onChange={set('start')} /></label>
        <label>End<input type="time" value={f.end} onChange={set('end')} /></label>
        <label>Sessions<input type="number" min="1" max="6" value={f.sessions} onChange={set('sessions')} /></label>
        <label>Room<input type="text" value={f.room} onChange={set('room')} /></label>
      </div>
      {err && <p className="error">{err}</p>}
      <div className="row">
        <button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <button className="secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  )
}
