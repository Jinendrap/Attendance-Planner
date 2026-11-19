import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabaseClient.js'
import { fetchAllSessions } from './attendance.js'
import { checkHours } from './hoursLogic.js'
import { fmt } from './dateUtils.js'

// "Course hours": checks every subject against its credits (4 credits = 60 hours) and can remove the extra classes above the limit.
export default function HoursPanel({ semester, subjects, version, onChanged }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    try { setRows(await fetchAllSessions(semester.id)); setError('') } catch { setError('Could not check the hours. Check your internet connection.') }
  }, [semester.id])
  useEffect(() => { load() }, [load, version])

  if (error) return <section className="panel"><h3>Course hours</h3><p className="error">{error}</p></section>
  if (!rows) return <section className="panel"><h3>Course hours</h3><p className="muted">Checking…</p></section>

  const report = checkHours(subjects, rows)
  const totalOver = report.reduce((n, r) => n + r.removable.length, 0)

  async function removeExtras(list, label) {
    const ids = list.flatMap((r) => r.removable.map((s) => s.id))
    if (!ids.length) return
    const ok = window.confirm(`Remove ${ids.length} extra ${ids.length === 1 ? 'class' : 'classes'} above the credit hours (${label})?\n\nOnly the latest unmarked classes are removed. Marked classes are never touched. This cannot be undone.`)
    if (!ok) return
    setBusy(true); setNote('')
    try {
      for (let i = 0; i < ids.length; i += 100) {
        const r = await supabase.from('sessions').delete().in('id', ids.slice(i, i + 100))
        if (r.error) throw r.error
      }
      setNote(`Removed ${ids.length} extra ${ids.length === 1 ? 'class' : 'classes'}.`)
      await load()
      onChanged?.()
    } catch {
      setNote('Could not remove them. Check your internet connection and try again.')
    }
    setBusy(false)
  }

  return (
    <section className="panel">
      <div className="row spread">
        <div>
          <h3 style={{ margin: 0 }}>Course hours</h3>
          <p className="muted" style={{ margin: '4px 0 0' }}>4 credits = 60 hours (15 per credit). One session counts as one hour.</p>
        </div>
        {totalOver > 0 && <button className="small" disabled={busy} onClick={() => removeExtras(report, 'all subjects')}>Remove all {totalOver} extras</button>}
      </div>
      {note && <p className="muted">{note}</p>}
      {totalOver === 0 && !report.some((r) => r.keptMarked) && <p className="muted">Every subject is within its credit hours.</p>}
      <div className="chours">
        {report.map((r) => (
          <div className="chrow" key={r.subject.id} style={{ borderLeftColor: r.subject.colour }}>
            <div className="grow">
              <strong>{r.subject.name}</strong>
              <span className="muted small-text">{r.subject.credits || 4} {(r.subject.credits || 4) === 1 ? "credit" : "credits"} · {r.scheduled} of {r.allowed} hours scheduled · experiential {r.exp} of about {r.expAllowed}</span>
              {r.removable.length > 0 && (
                <span className="warn small-text">{r.removable.length} extra {r.removable.length === 1 ? 'class' : 'classes'} above {r.allowed} hours ({fmt(r.firstExtra, { day: 'numeric', month: 'short' })} to {fmt(r.lastExtra, { day: 'numeric', month: 'short' })})</span>
              )}
              {r.keptMarked > 0 && <span className="muted small-text">{r.keptMarked} marked {r.keptMarked === 1 ? 'class is' : 'classes are'} above the limit and kept.</span>}
            </div>
            {r.removable.length > 0 && <button className="secondary small danger" disabled={busy} onClick={() => removeExtras([r], r.subject.name)}>Remove {r.removable.length}</button>}
          </div>
        ))}
      </div>
    </section>
  )
}
