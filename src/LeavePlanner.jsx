import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient.js'
import { fetchAllSessions } from './attendance.js'
import { simulateLeave } from './engine.js'
import { attOf } from './calendarLogic.js'
import { addDays, fmt } from './dateUtils.js'
import { hhmm } from './config.js'
import { syncHolidays, releaseHolidayRange } from './holidays.js'

const TYPE_LABEL = { official: 'Official holiday', personal: 'Personal holiday', vacation: 'Vacation' }
const VERDICT = { safe: 'Safe', edge: 'On the limit', below: 'Below required', none: '—' }
const pct = (p) => (p === null ? '—' : `${p.toFixed(2)}%`)
const short = (d) => fmt(d, { day: 'numeric', month: 'short' })

function recovery(a) {
  if (a.state === 'none') return '—'
  if (a.state === 'below') return a.mustAttend === null ? 'Cannot reach the requirement' : `Attend next ${a.mustAttend} in a row`
  return a.canMiss === 0 ? 'Cannot miss any more' : `Can still miss ${a.canMiss}`
}

export default function LeavePlanner({ semester, userId, version }) {
  const [subjects, setSubjects] = useState([])
  const [sessions, setSessions] = useState([])
  const [holidays, setHolidays] = useState([])
  const [plans, setPlans] = useState([])
  const [ready, setReady] = useState(false)
  const [missingTables, setMissingTables] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [assume, setAssume] = useState(true)
  const [planName, setPlanName] = useState('')
  const [h, setH] = useState({ name: '', type: 'official', from: '', to: '' })
  const [msg, setMsg] = useState('')

  useEffect(() => {
    let off = false
    ;(async () => {
      try {
        const [s, all, hol, pl] = await Promise.all([
          supabase.from('subjects').select('*').eq('semester_id', semester.id),
          fetchAllSessions(semester.id),
          supabase.from('holidays').select('*').eq('semester_id', semester.id).order('start_date'),
          supabase.from('leave_plans').select('*').eq('semester_id', semester.id).order('from_date'),
        ])
        if (s.error) throw s.error
        if (off) return
        setSubjects(s.data); setSessions(all)
        setMissingTables(Boolean(hol.error || pl.error))
        setHolidays(hol.data || []); setPlans(pl.data || [])
        setError(''); setReady(true)
      } catch {
        if (!off) setError('Could not load data. Check your internet connection.')
      }
    })()
    return () => { off = true }
  }, [semester.id, version, reload])

  const valid = Boolean(from && to && from <= to)
  const sim = (range, a) => simulateLeave(subjects, sessions, range, a, semester.overall_required_pct)
  const result = useMemo(() => (valid ? sim({ from, to }, assume) : null), [valid, from, to, assume, subjects, sessions]) // eslint-disable-line

  const lostByDay = useMemo(() => {
    if (!valid) return []
    const names = new Map(subjects.map((s) => [s.id, s]))
    const days = new Map()
    for (const s of sessions) {
      if (s.status !== 'scheduled' || attOf(s) || s.session_date < from || s.session_date > to) continue
      const day = days.get(s.session_date) || new Map()
      const e = day.get(s.subject_id) || { name: names.get(s.subject_id)?.name || 'Class', n: 0, start: '99:99', end: '00:00' }
      e.n += 1
      e.start = hhmm(s.start_time) < e.start ? hhmm(s.start_time) : e.start
      e.end = hhmm(s.end_time) > e.end ? hhmm(s.end_time) : e.end
      day.set(s.subject_id, e); days.set(s.session_date, day)
    }
    const out = []
    for (let d = from; d <= to; d = addDays(d, 1)) if (days.has(d)) out.push([d, [...days.get(d).values()].sort((a, b) => a.start.localeCompare(b.start))])
    return out
  }, [valid, from, to, sessions, subjects])

  const planRows = useMemo(() => plans.map((p) => ({ ...p, res: sim({ from: p.from_date, to: p.to_date }, p.assume_attend) })), [plans, subjects, sessions]) // eslint-disable-line

  async function savePlan() {
    if (!valid) return
    const name = planName.trim() || `Leave ${short(from)} – ${short(to)}`
    const r = await supabase.from('leave_plans').insert({ user_id: userId, semester_id: semester.id, name, from_date: from, to_date: to, assume_attend: assume })
    if (r.error) { setMsg('Could not save the plan.'); return }
    setPlanName(''); setMsg('Plan saved.'); setReload(reload + 1)
  }
  async function deletePlan(p) {
    await supabase.from('leave_plans').delete().eq('id', p.id)
    setReload(reload + 1)
  }
  async function addHoliday() {
    if (!h.name.trim() || !h.from || !h.to || h.from > h.to) { setMsg('Enter a name and a valid date range for the holiday.'); return }
    const r = await supabase.from('holidays').insert({ user_id: userId, semester_id: semester.id, name: h.name.trim(), type: h.type, start_date: h.from, end_date: h.to })
    if (r.error) { setMsg('Could not save the holiday.'); return }
    await syncHolidays(semester.id)
    setH({ name: '', type: 'official', from: '', to: '' }); setMsg('Holiday added. Classes on those dates no longer count.'); setReload(reload + 1)
  }
  async function deleteHoliday(x) {
    if (!window.confirm(`Delete "${x.name}"? Classes on those dates will count again.`)) return
    const r = await supabase.from('holidays').delete().eq('id', x.id)
    if (r.error) { setMsg('Could not delete the holiday.'); return }
    await releaseHolidayRange(semester.id, x.start_date, x.end_date)
    setMsg('Holiday deleted.'); setReload(reload + 1)
  }

  if (error) return <section className="panel"><p className="error">{error}</p></section>
  if (!ready) return <section className="panel"><p className="muted">Loading…</p></section>

  const below = result ? result.rows.filter((r) => r.after.state === 'below') : []
  const affordable = result && !below.length && result.overall.after.state !== 'below'

  return (
    <>
      {missingTables && <section className="panel"><p className="error">The Phase 6 tables are missing. Run <strong>phase6_holidays.sql</strong> in Supabase, then refresh.</p></section>}
      {msg && <p className="notice">{msg}</p>}

      <section className="panel">
        <h2>Leave planner</h2>
        <p className="muted">Pick the dates. Nothing is marked as absent. This only shows what would happen.</p>
        <div className="formgrid">
          <label>From<input type="date" value={from} min={semester.start_date} max={semester.end_date} onChange={(e) => { setFrom(e.target.value); if (!to || to < e.target.value) setTo(e.target.value) }} /></label>
          <label>To<input type="date" value={to} min={from || semester.start_date} max={semester.end_date} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <label className="check">
          <input type="checkbox" checked={assume} onChange={(e) => setAssume(e.target.checked)} />
          Assume I attend all my other unmarked classes before the leave starts
        </label>

        {valid && result && (
          <>
            <h3>{result.overall.lost === 0 ? 'No classes fall on these dates' : `${result.overall.lost} sessions would be missed`}</h3>
            <p><strong>{affordable ? 'Yes, you can afford this leave.' : `No. ${below.length ? `${below.map((r) => r.subject.name).join(', ')} would be below the requirement.` : 'Your overall attendance would be below the requirement.'}`}</strong></p>
            <div className="scroll">
              <table>
                <thead><tr><th>Subject</th><th>Lost</th><th>Now</th><th>After</th><th>Required</th><th>Result</th><th>Then</th></tr></thead>
                <tbody>
                  <tr className="totalrow">
                    <td>Overall</td><td>{result.overall.lost}</td><td>{pct(result.overall.now.pct)}</td><td>{pct(result.overall.after.pct)}</td>
                    <td>{semester.overall_required_pct}%</td><td><span className={`pill ${result.overall.after.state}`}>{VERDICT[result.overall.after.state]}</span></td><td>{recovery(result.overall.after)}</td>
                  </tr>
                  {result.rows.map((r) => (
                    <tr key={r.subject.id}>
                      <td><span className="dot" style={{ background: r.subject.colour }} />{r.subject.name}</td>
                      <td>{r.lost}</td><td>{pct(r.now.pct)}</td><td>{pct(r.after.pct)}</td><td>{r.subject.required_pct}%</td>
                      <td><span className={`pill ${r.after.state}`}>{VERDICT[r.after.state]}</span></td><td>{recovery(r.after)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted">Holidays and cancelled classes are not counted. “Then” shows what you would need or could still miss right after the leave.</p>

            {lostByDay.length > 0 && (
              <>
                <h4>Classes you would miss</h4>
                {lostByDay.map(([d, list]) => (
                  <p key={d} className="daylost"><strong>{fmt(d, { weekday: 'short', day: 'numeric', month: 'short' })}:</strong> {list.map((e) => `${e.name} ${e.start}–${e.end}${e.n > 1 ? ` (${e.n} sessions)` : ''}`).join(' · ')}</p>
                ))}
              </>
            )}

            <div className="row">
              <input type="text" className="wide" placeholder={`Plan name (e.g. Leave ${short(from)} – ${short(to)})`} value={planName} onChange={(e) => setPlanName(e.target.value)} />
              <button onClick={savePlan} disabled={missingTables}>Save this plan</button>
            </div>
          </>
        )}
        {!valid && <p className="muted">Choose a start and end date to see the impact.</p>}
      </section>

      {planRows.length > 0 && (
        <section className="panel">
          <h3>Compare saved plans</h3>
          <div className="scroll">
            <table>
              <thead><tr><th>Plan</th><th>Dates</th><th>Lost</th><th>Overall after</th><th>Subjects below</th><th /></tr></thead>
              <tbody>
                {planRows.map((p) => {
                  const nb = p.res.rows.filter((r) => r.after.state === 'below').length
                  return (
                    <tr key={p.id}>
                      <td>{p.name}</td><td>{short(p.from_date)} – {short(p.to_date)}</td><td>{p.res.overall.lost}</td>
                      <td>{pct(p.res.overall.after.pct)}</td>
                      <td><span className={`pill ${nb ? 'below' : 'safe'}`}>{nb ? `${nb} below` : 'None'}</span></td>
                      <td className="nowrap">
                        <button className="secondary small" onClick={() => { setFrom(p.from_date); setTo(p.to_date); setAssume(p.assume_attend); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Open</button>{' '}
                        <button className="secondary small danger" onClick={() => deletePlan(p)}>Delete</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel">
        <h3>Holidays</h3>
        <p className="muted">Classes on holiday dates are not counted as absences or as conducted classes.</p>
        <div className="formgrid">
          <label>Name<input type="text" value={h.name} onChange={(e) => setH({ ...h, name: e.target.value })} placeholder="e.g. Diwali break" /></label>
          <label>Type
            <select value={h.type} onChange={(e) => setH({ ...h, type: e.target.value })}>
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>From<input type="date" value={h.from} min={semester.start_date} max={semester.end_date} onChange={(e) => setH({ ...h, from: e.target.value, to: h.to && h.to >= e.target.value ? h.to : e.target.value })} /></label>
          <label>To<input type="date" value={h.to} min={h.from || semester.start_date} max={semester.end_date} onChange={(e) => setH({ ...h, to: e.target.value })} /></label>
        </div>
        <div className="row"><button onClick={addHoliday} disabled={missingTables}>Add holiday</button></div>
        {holidays.map((x) => (
          <div className="slot" key={x.id}>
            <span className="time">{short(x.start_date)}{x.end_date !== x.start_date ? ` – ${short(x.end_date)}` : ''}</span>
            <span className="grow"><strong>{x.name}</strong> · {TYPE_LABEL[x.type]}</span>
            <button className="secondary small danger" onClick={() => deleteHoliday(x)}>Delete</button>
          </div>
        ))}
        <p className="muted">To cancel a single class, open it in the Calendar and tap “Mark as cancelled”.</p>
      </section>
    </>
  )
}
