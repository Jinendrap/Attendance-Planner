import { useState } from 'react'
import Expand from './Expand.jsx'
import RemarksPanel, { RemarksButton } from './RemarksPanel.jsx'

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

// A switch for "experiential": the class is held but you do not have to attend, and it counts as Present.
function ExpSwitch({ on, disabled, label, hint, onChange }) {
  return (
    <label className="swrow">
      <span>{label}{hint && <small className="muted">Counts as present. You do not need to attend.</small>}</span>
      <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

// Attendance can be marked at any time, even before the class starts (for example when you already know you will miss it).
// remarks (optional): { semesterId, subjectId, date, start } adds a Remarks button that opens the remarks for this class.
export default function AttendancePanel({ list, onMark, remarks }) {
  const [picking, setPicking] = useState(null) // 'all' or a session id
  const [busy, setBusy] = useState(false)
  const [remOpen, setRemOpen] = useState(false)
  const [err, setErr] = useState('')
  const multi = list.length > 1
  const sel = choice(list)
  const allExp = list.every((p) => p.exp)

  async function run(marks) {
    setBusy(true); setErr('')
    try { await onMark(marks) } catch (e) { setErr(e?.friendly ? e.message : 'Could not save that. Please try again.') } finally { setBusy(false); setPicking(null) }
  }
  const apply = (targets, status, reason) => run(targets.map((p) => ({ sessionId: p.id, status, reason })))
  const setExp = (targets, value) => run(targets.map((p) => ({ sessionId: p.id, experiential: value })))

  const summary = sel === 'present' ? 'Present' : sel === 'absent' ? `Absent${reasonOf(list) ? ` (${reasonOf(list)})` : ''}`
    : sel === 'partial' ? 'Partly marked' : 'Not marked'

  return (
    <div className="attpanel">
      <ExpSwitch on={allExp} disabled={busy} label={multi ? 'Experiential class (all sessions)' : 'Experiential class'} hint onChange={(v) => setExp(list, v)} />
      {allExp ? <p className="muted">Experiential: counted as <strong>Present</strong> automatically.</p> : (
      <>
      <p className="muted">{multi ? `Whole class (${list.length} sessions)` : 'Attendance'}: <strong>{summary}</strong></p>
      {picking === 'all' ? (
        <ReasonPicker onPick={(r) => apply(list, 'absent', r)} onCancel={() => setPicking(null)} />
      ) : (
        <div className="row nomargin">
          <Choice kind="present" on={sel === 'present'} disabled={busy} onClick={() => apply(list, 'present')} />
          <Choice kind="absent" on={sel === 'absent'} disabled={busy} onClick={() => setPicking('all')} />
          {list.some((p) => p.att) && <button className="secondary" disabled={busy} onClick={() => apply(list.filter((p) => p.att), null)}>Clear</button>}
          {remarks && <RemarksButton open={remOpen} onClick={() => setRemOpen(!remOpen)} />}
        </div>
      )}
      </>
      )}
      {allExp && remarks && <div className="row nomargin"><RemarksButton open={remOpen} onClick={() => setRemOpen(!remOpen)} /></div>}
      {err && <p className="error">{err}</p>}
      {multi && (
        <div className="parts">
          <p className="muted">Or mark each session separately</p>
          {list.map((p, i) => (
            <div key={p.id} className="part">
              <span>Session {i + 1} · {p.start}–{p.end} · <em>{p.exp ? 'Experiential' : label(p.att)}</em></span>
              <ExpSwitch on={Boolean(p.exp)} disabled={busy} label="Experiential" onChange={(v) => setExp([p], v)} />
              {p.exp ? null : picking === p.id ? (
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
      {remarks && <Expand open={remOpen}><RemarksPanel {...remarks} /></Expand>}
    </div>
  )
}
