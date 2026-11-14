import { useState } from 'react'

const REASONS = ['Unwell', 'Travel', 'Family', 'Personal work', 'Overslept', 'Transport issue']

function ReasonPicker({ onPick, onCancel }) {
  const [text, setText] = useState('')
  return (
    <div className="reason">
      <p className="muted">Reason for absence (optional)</p>
      <div className="chips">
        {REASONS.map((r) => <button key={r} className="secondary small" onClick={() => onPick(r)}>{r}</button>)}
      </div>
      <div className="row">
        <input type="text" placeholder="Other reason" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="small" onClick={() => onPick(text.trim() || null)}>{text.trim() ? 'Save' : 'No reason'}</button>
        <button className="secondary small" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// What is currently chosen for a set of sessions: 'present', 'absent', 'partial' or none.
function choice(list) {
  const marked = list.filter((p) => p.att)
  if (!marked.length) return null
  if (marked.length < list.length) return 'partial'
  if (marked.every((p) => p.att.status === 'present')) return 'present'
  if (marked.every((p) => p.att.status === 'absent')) return 'absent'
  return 'partial'
}

const reasonOf = (list) => list.find((p) => p.att?.status === 'absent' && p.att.reason)?.att.reason || ''

const label = (att) => (!att ? 'Not marked' : att.status === 'present' ? 'Present' : `Absent${att.reason ? ` (${att.reason})` : ''}`)

function Choice({ kind, on, small, disabled, onClick }) {
  return (
    <button
      className={`choice ${kind} ${on ? 'on' : ''} ${small ? 'small' : ''}`}
      aria-pressed={on} disabled={disabled} onClick={onClick}
    >
      {on ? '✓ ' : ''}{kind === 'present' ? 'Present' : 'Absent'}
    </button>
  )
}

// Attendance can be marked at any time, even before the class starts (for example when you already know you will miss it).
export default function AttendancePanel({ list, onMark }) {
  const [picking, setPicking] = useState(null) // 'all' or a session id
  const [busy, setBusy] = useState(false)
  const multi = list.length > 1
  const sel = choice(list)

  async function apply(targets, status, reason) {
    setBusy(true)
    try { await onMark(targets.map((p) => ({ sessionId: p.id, status, reason }))) } finally { setBusy(false); setPicking(null) }
  }

  const summary = sel === 'present' ? 'Present' : sel === 'absent' ? `Absent${reasonOf(list) ? ` (${reasonOf(list)})` : ''}`
    : sel === 'partial' ? 'Partly marked' : 'Not marked'

  return (
    <div className="attpanel">
      <p className="muted">{multi ? `Whole class (${list.length} sessions)` : 'Attendance'}: <strong>{summary}</strong></p>
      {picking === 'all' ? (
        <ReasonPicker onPick={(r) => apply(list, 'absent', r)} onCancel={() => setPicking(null)} />
      ) : (
        <div className="row nomargin">
          <Choice kind="present" on={sel === 'present'} disabled={busy} onClick={() => apply(list, 'present')} />
          <Choice kind="absent" on={sel === 'absent'} disabled={busy} onClick={() => setPicking('all')} />
          {list.some((p) => p.att) && <button className="secondary" disabled={busy} onClick={() => apply(list.filter((p) => p.att), null)}>Clear</button>}
        </div>
      )}
      {multi && (
        <div className="parts">
          <p className="muted">Or mark each session separately</p>
          {list.map((p, i) => (
            <div key={p.id} className="part">
              <span>Session {p.part} · {p.start}–{p.end} · <em>{label(p.att)}</em></span>
              {picking === p.id ? (
                <ReasonPicker onPick={(r) => apply([p], 'absent', r)} onCancel={() => setPicking(null)} />
              ) : (
                <span className="row nomargin">
                  <Choice kind="present" small on={p.att?.status === 'present'} disabled={busy} onClick={() => apply([p], 'present')} />
                  <Choice kind="absent" small on={p.att?.status === 'absent'} disabled={busy} onClick={() => setPicking(p.id)} />
                  {p.att && <button className="secondary small" disabled={busy} onClick={() => apply([p], null)}>Clear</button>}
                </span>
              )}
              {i < list.length - 1 && <hr />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
