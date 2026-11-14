import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient.js'
import { CALENDAR_NAME, DEFAULT_REQUIRED, DAYS, hhmm } from './config.js'
import { listCalendars, listEvents } from './googleCalendar.js'
import { syncHolidays } from './holidays.js'
import { parseEvents, buildPlan, buildSessionRows, sessionsPerClass, slotKey } from './importLogic.js'

export default function ImportScreen({ session, semester, calendarName, onDone, onCancel }) {
  const wanted = (calendarName || CALENDAR_NAME).trim().toLowerCase()
  const token = session?.provider_token
  const [step, setStep] = useState(token ? 'loading' : 'connect')
  const [msg, setMsg] = useState('')
  const [calendars, setCalendars] = useState([])
  const [calendarId, setCalendarId] = useState('')
  const [plan, setPlan] = useState(null)
  const [required, setRequired] = useState({})
  const [perClass, setPerClass] = useState({})
  const [include, setInclude] = useState({})

  const connect = () => {
    try { localStorage.setItem('cap_next', 'import') } catch { /* ignore */ }
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        scopes: 'https://www.googleapis.com/auth/calendar.readonly',
        queryParams: { prompt: 'consent' },
      },
    })
  }

  const fail = (e) => {
    if (e.code === 'auth') {
      setMsg('Google access was not granted or has expired. Please connect again.')
      setStep('connect')
    } else {
      setMsg(e.message || 'Something went wrong.')
      setStep('error')
    }
  }

  useEffect(() => {
    if (!token) return
    listCalendars(token)
      .then((list) => {
        setCalendars(list)
        const match = list.find((c) => c.name.trim().toLowerCase() === wanted)
          || list.find((c) => c.name.toLowerCase().includes(wanted))
        setCalendarId(match ? match.id : list[0]?.id || '')
        setStep('pick')
      })
      .catch(fail)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function readTimetable() {
    setStep('reading'); setMsg('')
    try {
      const events = parseEvents(await listEvents(token, calendarId, semester.start_date, semester.end_date))
      if (!events.length) {
        setMsg('No timed events were found in that calendar for this semester.')
        setStep('pick')
        return
      }
      const p = buildPlan(events)
      setRequired(Object.fromEntries(p.subjects.map((s) => [s.key, DEFAULT_REQUIRED])))
      setPerClass(Object.fromEntries(p.slots.map((s) => [s.key, s.sessionsPerClass])))
      let ignored = new Set()
      try {
        const ig = await supabase.from('ignored_subjects').select('name_key').eq('semester_id', semester.id)
        if (!ig.error) ignored = new Set(ig.data.map((x) => x.name_key))
      } catch { /* optional table */ }
      setInclude(Object.fromEntries(p.subjects.map((s) => [s.key, !ignored.has(s.key)])))
      setPlan(p)
      setStep('review')
    } catch (e) { fail(e) }
  }

  async function save() {
    setStep('saving'); setMsg('')
    try {
      const uid = session.user.id
      // Classes already imported are skipped completely, so your edits are never undone.
      const have = new Set()
      for (let from = 0; ; from += 1000) {
        const r = await supabase.from('sessions').select('google_event_id')
          .eq('semester_id', semester.id).not('google_event_id', 'is', null).range(from, from + 999)
        if (r.error) throw r.error
        r.data.forEach((x) => have.add(x.google_event_id))
        if (r.data.length < 1000) break
      }
      const events = plan.events.filter((ev) => include[ev.subject.toLowerCase()] !== false && !have.has(ev.googleId))
      const needed = new Set(events.map((ev) => slotKey(ev.subject, ev.weekday, ev.start)))
      // 1. Subjects (existing ones are kept as they are)
      const exS = await supabase.from('subjects').select('*').eq('semester_id', semester.id)
      if (exS.error) throw exS.error
      const subjectIds = new Map(exS.data.map((s) => [s.name.toLowerCase(), s.id]))
      const newS = plan.subjects.filter((s) => include[s.key] !== false && !subjectIds.has(s.key)).map((s) => ({
        user_id: uid, semester_id: semester.id, name: s.name, colour: s.colour,
        required_pct: Number(required[s.key]) || DEFAULT_REQUIRED,
      }))
      if (newS.length) {
        const r = await supabase.from('subjects').insert(newS).select()
        if (r.error) throw r.error
        r.data.forEach((s) => subjectIds.set(s.name.toLowerCase(), s.id))
      }
      // 2. Weekly slots (only the ones new classes need)
      const idToName = new Map([...subjectIds].map(([name, id]) => [id, name]))
      const exT = await supabase.from('timetable_slots').select('*').eq('semester_id', semester.id)
      if (exT.error) throw exT.error
      const slotIds = new Map(exT.data.map((t) => [slotKey(idToName.get(t.subject_id) || '', t.weekday, hhmm(t.start_time)), t.id]))
      const newT = plan.slots.filter((s) => needed.has(s.key) && !slotIds.has(s.key)).map((s) => ({
        user_id: uid, semester_id: semester.id, subject_id: subjectIds.get(s.subjectKey),
        weekday: s.weekday, start_time: s.start, end_time: s.end, room: s.room, faculty: s.faculty,
        sessions_per_class: Number(perClass[s.key]) || 1,
      }))
      if (newT.length) {
        const r = await supabase.from('timetable_slots').insert(newT).select()
        if (r.error) throw r.error
        r.data.forEach((t) => slotIds.set(slotKey(idToName.get(t.subject_id), t.weekday, hhmm(t.start_time)), t.id))
      }
      // 3. Dated sessions
      const rows = buildSessionRows(events, perClass, { subjectIds, slotIds }, uid, semester.id)
      for (let i = 0; i < rows.length; i += 400) {
        const r = await supabase.from('sessions').upsert(rows.slice(i, i + 400), {
          onConflict: 'user_id,google_event_id,part', ignoreDuplicates: true,
        })
        if (r.error) throw r.error
      }
      await syncHolidays(semester.id)
      try { // remember which subjects you left out (optional table)
        const off = plan.subjects.filter((s) => include[s.key] === false).map((s) => ({ user_id: uid, semester_id: semester.id, name_key: s.key }))
        const on = plan.subjects.filter((s) => include[s.key] !== false).map((s) => s.key)
        if (off.length) await supabase.from('ignored_subjects').upsert(off, { onConflict: 'user_id,semester_id,name_key', ignoreDuplicates: true })
        if (on.length) await supabase.from('ignored_subjects').delete().eq('semester_id', semester.id).in('name_key', on)
      } catch { /* ignore */ }
      onDone()
    } catch (e) {
      setMsg(e.message || 'Could not save. Nothing was lost; you can try again.')
      setStep('review')
    }
  }

  const total = plan
    ? plan.events.filter((ev) => include[ev.subject.toLowerCase()] !== false).reduce((sum, ev) => sum + (Number(perClass[slotKey(ev.subject, ev.weekday, ev.start)]) || sessionsPerClass(ev.minutes)), 0)
    : 0

  if (step === 'connect') {
    return (
      <section className="panel">
        <h2>Connect Google Calendar</h2>
        <p>The app only reads your calendar. It never changes it.</p>
        <p className="muted">Google may show a "Google hasn't verified this app" screen. That is expected for a personal project: choose Advanced, then continue. Only read access to your calendar is asked for.</p>
        {msg && <p className="error">{msg}</p>}
        <div className="row">
          <button onClick={connect}>Connect Google Calendar</button>
          <button className="secondary" onClick={onCancel}>Back</button>
        </div>
      </section>
    )
  }
  if (step === 'loading' || step === 'reading' || step === 'saving') {
    return <section className="panel"><p>{step === 'saving' ? 'Saving your timetable…' : step === 'reading' ? 'Reading your timetable…' : 'Loading your calendars…'}</p></section>
  }
  if (step === 'error') {
    return (
      <section className="panel">
        <h2>Import problem</h2>
        <p className="error">{msg}</p>
        <div className="row"><button onClick={connect}>Connect again</button><button className="secondary" onClick={onCancel}>Back</button></div>
      </section>
    )
  }
  if (step === 'pick') {
    return (
      <section className="panel">
        <h2>Choose your timetable calendar</h2>
        <p>Classes from {semester.start_date} to {semester.end_date} will be read.</p>
        <select value={calendarId} onChange={(e) => setCalendarId(e.target.value)}>
          {calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {msg && <p className="error">{msg}</p>}
        <div className="row">
          <button onClick={readTimetable} disabled={!calendarId}>Read timetable</button>
          <button className="secondary" onClick={onCancel}>Back</button>
        </div>
      </section>
    )
  }
  return (
    <section className="panel">
      <h2>Review before saving</h2>
      <p>{plan.subjects.filter((s) => include[s.key] !== false).length} subjects, {plan.slots.filter((s) => include[s.subjectKey] !== false).length} weekly classes, {total} sessions in total.</p>
      <h3>Subjects</h3>
      <p className="muted">Untick anything that is not a class, such as Lunch Break.</p>
      <table>
        <thead><tr><th>Include</th><th>Subject</th><th>Required %</th></tr></thead>
        <tbody>
          {plan.subjects.map((s) => (
            <tr key={s.key}>
              <td><input type="checkbox" checked={include[s.key] !== false} onChange={(e) => setInclude({ ...include, [s.key]: e.target.checked })} aria-label={`Include ${s.name}`} /></td>
              <td><span className="dot" style={{ background: s.colour }} />{s.name}</td>
              <td><input type="number" min="1" max="100" value={required[s.key]} onChange={(e) => setRequired({ ...required, [s.key]: e.target.value })} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Weekly timetable</h3>
      <p className="muted">Sessions per class: a 2-hour lab usually counts as 2.</p>
      <div className="scroll">
        <table>
          <thead><tr><th>Day</th><th>Time</th><th>Subject</th><th>Room</th><th>Faculty</th><th>Sessions</th></tr></thead>
          <tbody>
            {plan.slots.filter((s) => include[s.subjectKey] !== false).map((s) => (
              <tr key={s.key}>
                <td>{DAYS[s.weekday]}</td><td>{s.start}–{s.end}</td><td>{s.subject}</td><td>{s.room || '—'}</td><td>{s.faculty || '—'}</td>
                <td><input type="number" min="1" max="6" value={perClass[s.key]} onChange={(e) => setPerClass({ ...perClass, [s.key]: e.target.value })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {msg && <p className="error">{msg}</p>}
      <div className="row">
        <button onClick={save}>Save to my planner</button>
        <button className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  )
}
