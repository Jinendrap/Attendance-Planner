import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient.js'
import { fetchAllSessions } from './attendance.js'
import { simulateLeave } from './engine.js'
import { attOf } from './calendarLogic.js'
import { fmt, nowIST } from './dateUtils.js'
import { hhmm } from './config.js'
import { syncHolidays, releaseHolidayRange } from './holidays.js'

const TYPE_LABEL = { official: 'Official holiday', personal: 'Personal holiday', vacation: 'Vacation' }
const VERDICT = { safe: 'Safe', edge: 'On the limit', below: 'Below required', none: '—' }
const pct = (p) => (p === null ? '—' : `${p.toFixed(2)}%`)
const short = (d) => fmt(d, { day: 'numeric', month: 'short' })
const classes = (n) => `${n} ${n === 1 ? 'class' : 'classes'}`

// What the person should do after the leave, in plain words.
function advice(v) {
  if (v.kind === 'none') return v.left ? `${classes(v.left)} left. Nothing is counted yet.` : 'Nothing is counted yet.'
  if (v.kind === 'recover') return `Recoverable: attend ${v.need} of the ${v.left} left${v.spare ? ` (${v.spare} spare)` : ' (no spare)'}.`
  if (v.kind === 'fail') return v.left === 0
    ? 'Not recoverable: no classes are left to attend.'
    : v.need === null ? `Not recoverable: even attending all ${v.left} left would not reach the requirement.`
      : `Not recoverable: you need ${v.need} but only ${v.left} are left. Best possible: ${pct(v.best)}.`
  if (v.kind === 'edge') return v.left === 0 ? 'No classes left, and you stay on the requirement.' : `On the limit: you cannot miss any of the ${v.left} left.`
  return v.left === 0 ? 'No classes left, and you stay above the requirement.' : `Safe: you can still skip ${v.spare} of the ${v.left} left.`
}
const TONE = { safe: 'safe', edge: 'edge', recover: 'edge', fail: 'below', none: 'none' }
const TAG = { safe: 'Safe', edge: 'On the limit', recover: 'Recoverable', fail: 'Not recoverable', none: '—' }

function headline(result) {
  const all = [...result.rows.filter((r) => r.after.state !== 'none').map((r) => r.verdict), result.overall.verdict]
  const failed = result.rows.filter((r) => r.verdict.kind === 'fail')
  const byLeave = failed.filter((r) => r.lost > 0)
  const already = failed.filter((r) => r.lost === 0)
  const dips = result.rows.filter((r) => r.verdict.kind === 'recover')
  const names = (l) => l.map((r) => r.subject.name).join(', ')
  const note = already.length ? ` ${names(already)} ${already.length === 1 ? 'is' : 'are'} short already and cannot be brought back with the classes left, with or without this leave.` : ''
  const overallFail = result.overall.verdict.kind === 'fail'
  if (byLeave.length || (overallFail && !already.length)) {
    return { tone: 'below', title: 'No, not safely.', body: `${byLeave.length ? names(byLeave) : 'Your overall attendance'} could not reach the requirement even if you attended every class that is left.${note}` }
  }
  if (all.every((v) => v.kind === 'safe' || v.kind === 'edge' || v.kind === 'none')) {
    return { tone: 'safe', title: 'Yes, you can take this leave.', body: 'Every subject and your overall attendance stay at or above the requirement right after it.' }
  }
  if (dips.length || overallFail) {
    return { tone: 'edge', title: 'Yes, but you will have to catch up.', body: `${dips.length ? names(dips) : 'Your overall attendance'} would dip below the requirement, but enough classes are left to bring it back. Attend the number shown on each card.${note}` }
  }
  return { tone: 'edge', title: result.overall.lost ? 'The leave itself is fine.' : 'This leave costs you no classes.', body: note.trim() }
}

function Stat({ label, value }) { return <div className="stat"><span>{label}</span><strong>{value}</strong></div> }

function VerdictCard({ name, colour, lost, left, now, after, required, verdict, total, hours }) {
  return (
    <div className={`vcard${total ? ' total' : ''}`}>
      <div className="vhead">
        <span className="vname">{colour && <span className="dot" style={{ background: colour }} />}{name}</span>
        <span className={`pill ${TONE[verdict.kind]}`}>{TAG[verdict.kind]}</span>
      </div>
      <div className="stats">
        <Stat label="Lost" value={lost} />
        <Stat label="Left after" value={left} />
        <Stat label="Now" value={pct(now.pct)} />
        <Stat label="After leave" value={pct(after.pct)} />
        <Stat label="Required" value={`${required}%`} />
        <Stat label="Right after" value={VERDICT[after.state]} />
      </div>
      <p className="vadvice">{advice(verdict)}</p>
      {hours && hours.ignored > 0 && <p className="muted small-text">{classes(hours.ignored)} above the {hours.allowed}-hour course limit {hours.ignored === 1 ? 'is' : 'are'} ignored.</p>}
      {hours && hours.missing > 0 && <p className="muted small-text">The calendar has {hours.missing} fewer {hours.missing === 1 ? 'class' : 'classes'} than the {hours.allowed} course hours. {hours.missing === 1 ? 'It is' : 'They are'} not counted.</p>}
    </div>
  )
}

function ResultView({ result, semester, ranges, sessions, subjects, assume, mixed }) {
  const head = headline(result)
  const lostByDay = useMemo(() => {
    const names = new Map(subjects.map((s) => [s.id, s]))
    const inLeave = (d) => ranges.some((r) => d >= r.from && d <= r.to)
    const days = new Map()
    for (const s of sessions) {
      if (s.status !== 'scheduled' || attOf(s) || !inLeave(s.session_date)) continue
      const day = days.get(s.session_date) || new Map()
      const e = day.get(s.subject_id) || { name: names.get(s.subject_id)?.name || 'Class', n: 0, start: '99:99', end: '00:00' }
      e.n += 1
      e.start = hhmm(s.start_time) < e.start ? hhmm(s.start_time) : e.start
      e.end = hhmm(s.end_time) > e.end ? hhmm(s.end_time) : e.end
      day.set(s.subject_id, e); days.set(s.session_date, day)
    }
    return [...days.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([d, m]) => [d, [...m.values()].sort((a, b) => a.start.localeCompare(b.start))])
  }, [ranges, sessions, subjects])

  return (
    <>
      <h3>{result.overall.lost === 0 ? 'No classes fall on these dates' : `${result.overall.lost} sessions would be missed`}</h3>
      <div className={`headline ${head.tone}`}>
        <strong>{head.title}</strong>
        <span>{head.body}</span>
      </div>
      <div className="vgrid">
        <VerdictCard total name="Overall" lost={result.overall.lost} left={result.overall.left} now={result.overall.now} after={result.overall.after} required={semester.overall_required_pct} verdict={result.overall.verdict} />
        {result.rows.map((r) => (
          <VerdictCard key={r.subject.id} name={r.subject.name} colour={r.subject.colour} lost={r.lost} left={r.left} now={r.now} after={r.after} required={r.subject.required_pct} verdict={r.verdict} hours={r.hours} />
        ))}
      </div>
      <p className="muted small-text">
        “Left after” counts the unmarked classes you can still attend once the leave starts. Holidays, cancelled classes and classes above each subject’s course hours (credits × 15) are not counted.
        {!assume && ' Unmarked classes before the leave are included, because you chose not to assume them.'}
        {mixed && ' Plans with different “assume” settings are treated as not assuming.'}
      </p>
      {lostByDay.length > 0 && (
        <>
          <h4>Classes you would miss</h4>
          {lostByDay.map(([d, list]) => (
            <p key={d} className="daylost"><strong>{fmt(d, { weekday: 'short', day: 'numeric', month: 'short' })}:</strong> {list.map((e) => `${e.name} ${e.start}–${e.end}${e.n > 1 ? ` (${e.n} sessions)` : ''}`).join(' · ')}</p>
          ))}
        </>
      )}
    </>
  )
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
  const [picked, setPicked] = useState([])

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
  const sim = (range, a) => simulateLeave(subjects, sessions, range, a, semester.overall_required_pct, nowIST())
  const result = useMemo(() => (valid ? sim({ from, to }, assume) : null), [valid, from, to, assume, subjects, sessions]) // eslint-disable-line

  const planRows = useMemo(() => plans.map((p) => ({ ...p, res: sim({ from: p.from_date, to: p.to_date }, p.assume_attend) })), [plans, subjects, sessions]) // eslint-disable-line

  const chosen = useMemo(() => planRows.filter((p) => picked.includes(p.id)), [planRows, picked])
  const comboAssume = chosen.length > 0 && chosen.every((p) => p.assume_attend)
  const comboMixed = chosen.some((p) => p.assume_attend) && !comboAssume
  const comboRanges = useMemo(() => chosen.map((p) => ({ from: p.from_date, to: p.to_date })), [chosen])
  const combo = useMemo(() => (chosen.length > 1 ? sim(comboRanges, comboAssume) : null), [chosen, comboAssume, subjects, sessions]) // eslint-disable-line
  const overlap = useMemo(() => {
    const r = [...comboRanges].sort((a, b) => a.from.localeCompare(b.from))
    return r.some((x, i) => i > 0 && x.from <= r[i - 1].to)
  }, [comboRanges])
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  async function savePlan() {
    if (!valid) return
    const name = planName.trim() || `Leave ${short(from)} – ${short(to)}`
    const r = await supabase.from('leave_plans').insert({ user_id: userId, semester_id: semester.id, name, from_date: from, to_date: to, assume_attend: assume })
    if (r.error) { setMsg('Could not save the plan.'); return }
    setPlanName(''); setMsg('Plan saved.'); setReload(reload + 1)
  }
  async function deletePlan(p) {
    await supabase.from('leave_plans').delete().eq('id', p.id)
    setPicked((x) => x.filter((i) => i !== p.id))
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
            <ResultView result={result} semester={semester} ranges={[{ from, to }]} sessions={sessions} subjects={subjects} assume={assume} />
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
          <h3>Saved plans</h3>
          <p className="muted">Tick two or more plans to see everything together, as if you took all of those leaves.</p>
          <div className="row nomargin">
            <button className="secondary small" onClick={() => setPicked(planRows.map((p) => p.id))}>Select all</button>
            <button className="secondary small" onClick={() => setPicked([])} disabled={!picked.length}>Clear</button>
          </div>
          <div className="plans">
            {planRows.map((p) => {
              const v = p.res.overall.verdict
              const bad = p.res.rows.filter((r) => r.after.state === 'below').length
              const stuck = p.res.rows.filter((r) => r.verdict.kind === 'fail').length || (v.kind === 'fail' ? 1 : 0)
              const on = picked.includes(p.id)
              return (
                <div key={p.id} className={`plan${on ? ' on' : ''}`}>
                  <label className="plantop">
                    <input type="checkbox" checked={on} onChange={() => toggle(p.id)} />
                    <span className="grow"><strong>{p.name}</strong><span className="muted small-text">{short(p.from_date)} – {short(p.to_date)}</span></span>
                    <span className={`pill ${stuck ? 'below' : bad || v.kind === 'recover' ? 'edge' : 'safe'}`}>{stuck ? 'Not recoverable' : bad || v.kind === 'recover' ? 'Recoverable' : 'Safe'}</span>
                  </label>
                  <div className="stats">
                    <Stat label="Lost" value={p.res.overall.lost} />
                    <Stat label="Overall after" value={pct(p.res.overall.after.pct)} />
                    <Stat label="Subjects below" value={bad || 'None'} />
                  </div>
                  <p className="vadvice">{advice(v)}</p>
                  <div className="row nomargin">
                    <button className="secondary small" onClick={() => { setFrom(p.from_date); setTo(p.to_date); setAssume(p.assume_attend); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Open</button>
                    <button className="secondary small danger" onClick={() => deletePlan(p)}>Delete</button>
                  </div>
                </div>
              )
            })}
          </div>
          {picked.length === 1 && <p className="muted">Tick one more plan to combine them.</p>}
        </section>
      )}

      {combo && (
        <section className="panel">
          <h2>Combined analysis</h2>
          <p className="muted">{chosen.length} plans together: {chosen.map((p) => `${p.name} (${short(p.from_date)} – ${short(p.to_date)})`).join(', ')}.{overlap ? ' Some of these dates overlap, so shared days are counted once.' : ''}</p>
          <ResultView result={combo} semester={semester} ranges={comboRanges} sessions={sessions} subjects={subjects} assume={comboAssume} mixed={comboMixed} />
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
