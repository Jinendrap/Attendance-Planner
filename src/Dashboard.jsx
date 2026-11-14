import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient.js'
import { fetchAllSessions } from './attendance.js'
import { buildDashboard } from './engine.js'
import { nowIST } from './dateUtils.js'
import Absentees from './Absentees.jsx'

const fmtPct = (p) => (p === null ? '—' : `${p.toFixed(2)}%`)

function advice(r, noun) {
  if (r.state === 'none') return 'No classes marked yet.'
  if (r.state === 'below') {
    return r.mustAttend === null
      ? `Cannot reach ${r.required}% any more.`
      : `Attend the next ${r.mustAttend} ${noun}${r.mustAttend === 1 ? '' : 'es'} in a row to reach ${r.required}%.`
  }
  if (r.state === 'edge') return `Right on the limit. You cannot miss any more ${noun}es.`
  return `You can miss ${r.canMiss} more ${noun}${r.canMiss === 1 ? '' : 'es'} and stay at ${r.required}% or above.`
}

function Bar({ r }) {
  return (
    <div className="bar" role="img" aria-label={`Attendance ${fmtPct(r.pct)}, required ${r.required}%`}>
      <div className={`fill ${r.state}`} style={{ width: `${r.pct ?? 0}%` }} />
      <div className="req" style={{ left: `${r.required}%` }} title={`Required ${r.required}%`} />
    </div>
  )
}

const STATE_TEXT = { safe: 'On track', edge: 'On the limit', below: 'Below required', none: 'No data' }

export default function Dashboard({ semester, version }) {
  const [data, setData] = useState(null)
  const [openId, setOpenId] = useState(null) // subject whose details are showing
  const [error, setError] = useState('')

  useEffect(() => {
    let off = false
    ;(async () => {
      try {
        const [s, sessions] = await Promise.all([
          supabase.from('subjects').select('*').eq('semester_id', semester.id),
          fetchAllSessions(semester.id),
        ])
        if (s.error) throw s.error
        if (!off) { setData(buildDashboard(s.data, sessions, semester.overall_required_pct, nowIST())); setError('') }
      } catch {
        if (!off) setError('Could not load attendance. Check your internet connection.')
      }
    })()
    return () => { off = true }
  }, [semester.id, semester.overall_required_pct, version])

  if (error) return <section className="panel"><p className="error">{error}</p></section>
  if (!data) return <section className="panel"><p className="muted">Loading…</p></section>
  if (!data.rows.length) return <section className="panel"><p>Import your timetable first (Subjects &amp; timetable tab).</p></section>

  const o = data.overall
  return (
    <>
      <section className="tile hero" style={{ cursor: 'default' }}>
        <div className="row spread nomargin" style={{ width: '100%' }}>
          <span className="eyebrow" style={{ color: 'rgba(255,255,255,.8)' }}>Overall attendance</span>
          <span className={`pill ${o.state}`}>{STATE_TEXT[o.state]}</span>
        </div>
        <div className={`bigpct ${o.state}`} style={{ color: '#fff' }}>{fmtPct(o.pct)}</div>
        <div style={{ width: '100%' }}>
          <Bar r={o} />
          <p className="muted" style={{ margin: '4px 0' }}>{o.A} attended of {o.T} classes marked · required {o.required}%</p>
          <p style={{ margin: '4px 0' }}><strong>{advice(o, 'class')}</strong></p>
          {data.pending > 0 && <p className="muted" style={{ margin: '4px 0' }}>{data.pending} started {data.pending === 1 ? 'class is' : 'classes are'} not marked yet and not counted. Mark them in the Pending tab.</p>}
        </div>
      </section>
      <div className="grid wide">
        {data.rows.map((r) => {
          const isOpen = openId === r.subject.id
          return (
            <section className={`acc subcard ${isOpen ? 'open' : ''}`} key={r.subject.id} style={{ borderLeftColor: r.subject.colour }}>
              <button className="acc-head" aria-expanded={isOpen} onClick={() => setOpenId(isOpen ? null : r.subject.id)}>
                <span className="nm">{r.subject.name}</span>
                <span className={`pct bigpct ${r.state}`} style={{ fontSize: '1.5rem' }}>{fmtPct(r.pct)}</span>
                <span className="plus" aria-hidden="true">+</span>
                <span className="acc-sub">{STATE_TEXT[r.state]} · {advice(r, 'class')}</span>
              </button>
              <Bar r={r} />
              {isOpen && (
                <div className="acc-body">
                  <div className="stats">
                    <div><span className="big">{r.T}</span><span className="muted">conducted</span></div>
                    <div><span className="big">{r.A}</span><span className="muted">attended</span></div>
                    <div><span className="big">{r.absent}</span><span className="muted">missed</span></div>
                    <div><span className="big">{r.remaining}</span><span className="muted">still to come</span></div>
                  </div>
                  <p className="muted">Required {r.required}% · <span className={`pill ${r.state}`}>{STATE_TEXT[r.state]}</span></p>
                </div>
              )}
            </section>
          )
        })}
      </div>
      <Absentees semester={semester} version={version} />
    </>
  )
}
