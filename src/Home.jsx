import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient.js'
import { DAYS, WEEK_ORDER, hhmm } from './config.js'
import { nowIST, toMin } from './dateUtils.js'
import { planResync } from './slotEdit.js'
import { attOf } from './calendarLogic.js'
import { AddSubjectForm, AddClassForm } from './AddForms.jsx'

export default function Home({ semester, userId, onImport }) {
  const [subjects, setSubjects] = useState([])
  const [slots, setSlots] = useState([])
  const [count, setCount] = useState(0)
  const [state, setState] = useState('loading')
  const [note, setNote] = useState('')
  const [reload, setReload] = useState(0)
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [editError, setEditError] = useState('')
  const [adding, setAdding] = useState(null) // 'subject' | 'class' | null

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [s, t, c] = await Promise.all([
        supabase.from('subjects').select('*').eq('semester_id', semester.id).order('name'),
        supabase.from('timetable_slots').select('*, subjects(name, colour)').eq('semester_id', semester.id).order('start_time'),
        supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('semester_id', semester.id),
      ])
      if (cancelled) return
      if (s.error || t.error || c.error) { setState('error'); return }
      setSubjects(s.data); setSlots(t.data); setCount(c.count || 0); setState('ready')
    })()
    return () => { cancelled = true }
  }, [semester.id, reload])

  async function savePct(subject, value) {
    const pct = Number(value)
    if (!(pct >= 1 && pct <= 100) || pct === subject.required_pct) return
    const { error } = await supabase.from('subjects').update({ required_pct: pct }).eq('id', subject.id)
    if (error) { setNote('Could not save the percentage.'); return }
    setSubjects(subjects.map((x) => (x.id === subject.id ? { ...x, required_pct: pct } : x)))
    setNote(`${subject.name}: required attendance set to ${pct}%.`)
  }

  const done = (message) => { setAdding(null); setNote(message); setReload((r) => r + 1) }

  async function deleteSubject(s) {
    const q = await supabase.from('sessions').select('id, attendance(status)').eq('subject_id', s.id)
    if (q.error) { setNote('Could not check this subject. Try again.'); return }
    const marks = q.data.filter((r) => attOf(r)).length
    const ok = window.confirm(`Delete "${s.name}"?\n\nThis removes its weekly classes, ${q.data.length} scheduled sessions and ${marks} attendance marks. It cannot be undone.`)
    if (!ok) return
    const r = await supabase.from('subjects').delete().eq('id', s.id)
    if (r.error) { setNote('Could not delete the subject. Try again.'); return }
    // Remember it, so re-importing from Google Calendar does not bring it back (optional table).
    await supabase.from('ignored_subjects').upsert(
      { user_id: userId, semester_id: semester.id, name_key: s.name.toLowerCase() },
      { onConflict: 'user_id,semester_id,name_key', ignoreDuplicates: true },
    )
    done(`Deleted "${s.name}".`)
  }

  async function deleteSlot(x) {
    const today = nowIST().date
    const q = await supabase.from('sessions').select('id, attendance(status)').eq('slot_id', x.id).gte('session_date', today)
    if (q.error) { setNote('Could not check this class. Try again.'); return }
    const marks = q.data.filter((r) => attOf(r)).length
    const ok = window.confirm(`Delete this weekly class (${DAYS[x.weekday]} ${hhmm(x.start_time)}–${hhmm(x.end_time)}, ${x.subjects?.name})?\n\nIts ${q.data.length} sessions from today onward and ${marks} attendance marks on them will be removed. Earlier sessions stay.`)
    if (!ok) return
    if (q.data.length) {
      const r = await supabase.from('sessions').delete().in('id', q.data.map((r) => r.id))
      if (r.error) { setNote('Could not delete the sessions. Try again.'); return }
    }
    const r2 = await supabase.from('timetable_slots').delete().eq('id', x.id)
    if (r2.error) { setNote('Could not delete the class. Try again.'); return }
    done('Weekly class deleted.')
  }

  const startEdit = (x) => {
    setEditError('')
    setEditing({ id: x.id, start: hhmm(x.start_time), end: hhmm(x.end_time), sessions: x.sessions_per_class, room: x.room, faculty: x.faculty, applyAll: true })
  }

  async function saveEdit() {
    const f = editing
    const slot = slots.find((x) => x.id === f.id)
    const n = Number(f.sessions)
    const okTime = (t) => /^\d{2}:\d{2}$/.test(t) && toMin(t) < 24 * 60
    if (!okTime(f.start) || !okTime(f.end)) { setEditError('Enter times like 08:30 (24-hour).'); return }
    if (toMin(f.end) <= toMin(f.start)) { setEditError('The end time must be after the start time.'); return }
    if (!Number.isInteger(n) || n < 1 || n > 6) { setEditError('Sessions must be a whole number from 1 to 6.'); return }
    setBusy(true); setEditError('')
    try {
      const today = nowIST().date
      const targets = f.applyAll
        ? slots.filter((x) => x.subject_id === slot.subject_id && hhmm(x.start_time) === hhmm(slot.start_time) && hhmm(x.end_time) === hhmm(slot.end_time))
        : [slot]
      for (const t of targets) {
        const main = t.id === slot.id
        const vals = {
          start: f.start, end: f.end, sessions: n,
          room: main ? f.room.trim() : t.room, faculty: main ? f.faculty.trim() : t.faculty,
        }
        const ss = await supabase.from('sessions').select('*').eq('slot_id', t.id).gte('session_date', today)
        if (ss.error) throw ss.error
        const plan = planResync(ss.data, vals)
        if (plan.deleteIds.length) {
          const a = await supabase.from('attendance').select('id', { count: 'exact', head: true }).in('session_id', plan.deleteIds)
          if (!a.error && a.count > 0 && !window.confirm(`${a.count} attendance mark(s) on the removed sessions will be deleted. Continue?`)) {
            throw new Error('Cancelled. Nothing was changed.')
          }
        }
        const up = await supabase.from('timetable_slots')
          .update({ start_time: vals.start, end_time: vals.end, sessions_per_class: n, room: vals.room, faculty: vals.faculty })
          .eq('id', t.id)
        if (up.error) throw up.error
        if (plan.deleteIds.length) {
          const r = await supabase.from('sessions').delete().in('id', plan.deleteIds)
          if (r.error) throw r.error
        }
        if (plan.upserts.length) {
          const r = await supabase.from('sessions').upsert(plan.upserts, { onConflict: 'id' })
          if (r.error) throw r.error
        }
        if (plan.inserts.length) {
          const r = await supabase.from('sessions').insert(plan.inserts)
          if (r.error) throw r.error
        }
      }
      setEditing(null)
      setNote(`Updated ${targets.length} weekly ${targets.length === 1 ? 'class' : 'classes'}. Classes from today onward were changed; earlier ones were left as they were.`)
      setReload(reload + 1)
    } catch (e) {
      setEditError(e.message || 'Could not save the change.')
    }
    setBusy(false)
  }

  if (state === 'loading') return <section className="panel"><p>Loading…</p></section>
  if (state === 'error') {
    return <section className="panel"><h2>Database not ready</h2><p className="error">The Phase 2 tables were not found. Run the Phase 2 SQL in Supabase, then refresh this page.</p></section>
  }
  if (!subjects.length) {
    return (
      <section className="panel">
        <h2>{semester.name}</h2>
        <p>No timetable yet. Import it from your Google Calendar to get started.</p>
        <button onClick={onImport}>Import from Google Calendar</button>
      </section>
    )
  }
  return (
    <>
      <section className="panel">
        <div className="row spread">
          <div><h2>{semester.name}</h2><p className="muted">{semester.start_date} to {semester.end_date} · {count} sessions scheduled</p></div>
          <button className="secondary" onClick={onImport}>Re-import from Google Calendar</button>
        </div>
        {note && <p className="muted">{note}</p>}
      </section>
      <section className="panel">
        <div className="row spread">
          <h3 style={{ margin: 0 }}>Subjects</h3>
          <button className="secondary small" onClick={() => setAdding(adding === 'subject' ? null : 'subject')}>+ Add subject</button>
        </div>
        {adding === 'subject' && <AddSubjectForm semester={semester} userId={userId} onDone={done} onCancel={() => setAdding(null)} />}
        <div className="grid">
          {subjects.map((s) => (
            <div className="subject" key={s.id} style={{ borderLeftColor: s.colour }}>
              <div className="row spread nomargin"><strong>{s.name}</strong><button className="secondary small danger" onClick={() => deleteSubject(s)}>Delete</button></div>
              <label>Required %
                <input type="number" min="1" max="100" defaultValue={s.required_pct} onBlur={(e) => savePct(s, e.target.value)} />
              </label>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="row spread">
          <h3 style={{ margin: 0 }}>Weekly timetable</h3>
          <button className="secondary small" onClick={() => setAdding(adding === 'class' ? null : 'class')}>+ Add weekly class</button>
        </div>
        {adding === 'class' && <AddClassForm semester={semester} subjects={subjects} userId={userId} onDone={done} onCancel={() => setAdding(null)} />}
        {WEEK_ORDER.map((d) => {
          const list = slots.filter((x) => x.weekday === d)
          if (!list.length) return null
          return (
            <div key={d} className="day">
              <h4>{DAYS[d]}</h4>
              {list.map((x) => (
                <div key={x.id}>
                  <div className="slot" style={{ borderLeftColor: x.subjects?.colour }}>
                    <span className="time">{hhmm(x.start_time)}–{hhmm(x.end_time)}</span>
                    <span className="grow"><strong>{x.subjects?.name}</strong> · {x.room || 'No room'} · {x.faculty || 'No faculty'} · {x.sessions_per_class} {x.sessions_per_class === 1 ? 'session' : 'sessions'}</span>
                    <button className="secondary small" onClick={() => startEdit(x)}>Edit</button>
                    <button className="secondary small danger" onClick={() => deleteSlot(x)}>Delete</button>
                  </div>
                  {editing?.id === x.id && (
                    <div className="editform">
                      <div className="formgrid">
                        <label>Start (24h)<input type="text" inputMode="numeric" placeholder="08:30" value={editing.start} onChange={(e) => setEditing({ ...editing, start: e.target.value })} /></label>
                        <label>End (24h)<input type="text" inputMode="numeric" placeholder="11:00" value={editing.end} onChange={(e) => setEditing({ ...editing, end: e.target.value })} /></label>
                        <label>Sessions<input type="number" min="1" max="6" value={editing.sessions} onChange={(e) => setEditing({ ...editing, sessions: e.target.value })} /></label>
                        <label>Room<input type="text" value={editing.room} onChange={(e) => setEditing({ ...editing, room: e.target.value })} /></label>
                        <label>Faculty<input type="text" value={editing.faculty} onChange={(e) => setEditing({ ...editing, faculty: e.target.value })} /></label>
                      </div>
                      <label className="check">
                        <input type="checkbox" checked={editing.applyAll} onChange={(e) => setEditing({ ...editing, applyAll: e.target.checked })} />
                        Apply time and sessions to every day where this subject has the same time (room and faculty change only here)
                      </label>
                      {editError && <p className="error">{editError}</p>}
                      <div className="row">
                        <button onClick={saveEdit} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
                        <button className="secondary" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        })}
      </section>
    </>
  )
}
