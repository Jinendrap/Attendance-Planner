import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient.js'
import { fmt } from './dateUtils.js'
import Expand from './Expand.jsx'

// Remarks for one class (one subject, one date, one start time). A remark can also create a task with a deadline.
export default function RemarksPanel({ semesterId, subjectId, date, start, onChanged }) {
  const [list, setList] = useState([])
  const [note, setNote] = useState('')
  const [hasDue, setHasDue] = useState(false)
  const [due, setDue] = useState('')
  const [kind, setKind] = useState('task')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [adding, setAdding] = useState(false) // the writing box is hidden until you ask for it
  const box = useRef(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('class_remarks').select('*')
      .eq('subject_id', subjectId).eq('class_date', date).eq('class_start', start).order('created_at')
    if (error) setMsg('Remarks are not set up yet. Run phase8_remarks_tasks.sql in Supabase.')
    else setList(data)
    setLoaded(true)
  }, [subjectId, date, start])

  useEffect(() => { load() }, [load])

  async function save() {
    const text = note.trim()
    if (!text) return
    if (hasDue && !due) { setMsg('Pick a deadline date, or untick the deadline.'); return }
    setBusy(true); setMsg('')
    try {
      const r = await supabase.from('class_remarks').insert({
        semester_id: semesterId, subject_id: subjectId, class_date: date, class_start: start,
        note: text, due_date: hasDue ? due : null,
      }).select().single()
      if (r.error) throw r.error
      if (hasDue) {
        const t = await supabase.from('tasks').insert({
          semester_id: semesterId, subject_id: subjectId, remark_id: r.data.id,
          title: text.length > 80 ? `${text.slice(0, 77)}…` : text, kind, due_date: due,
        })
        if (t.error) throw t.error
      }
      setNote(''); setHasDue(false); setDue(''); setAdding(false)
      await load()
      onChanged?.()
    } catch {
      setMsg('Could not save. Check your internet connection and try again.')
    }
    setBusy(false)
  }

  async function remove(x) {
    if (!window.confirm('Delete this remark? A task made from it is kept.')) return
    const r = await supabase.from('class_remarks').delete().eq('id', x.id)
    if (r.error) { setMsg('Could not delete the remark.'); return }
    await load()
    onChanged?.()
  }

  const showForm = adding || (loaded && list.length === 0 && !msg.startsWith('Remarks are not'))
  const startAdding = () => { setAdding(true); setTimeout(() => box.current && box.current.focus(), 60) }

  return (
    <div className="remarks">
      <h4>Remarks</h4>
      {list.map((x) => (
        <div className="remark" key={x.id}>
          <div className="grow">
            <p>{x.note}</p>
            {x.due_date && <span className="pill edge">Deadline {fmt(x.due_date, { day: 'numeric', month: 'short' })}</span>}
          </div>
          <button className="secondary small danger" onClick={() => remove(x)} aria-label="Delete remark">✕</button>
        </div>
      ))}
      {!showForm && <div className="row"><button className="secondary small" onClick={startAdding}>+ Add a remark</button></div>}
      {showForm && (<>
      <textarea ref={box} rows="2" placeholder="What was taught, homework, reminders…" value={note} onChange={(e) => setNote(e.target.value)} />
      <label className="check">
        <input type="checkbox" checked={hasDue} onChange={(e) => setHasDue(e.target.checked)} />
        This has a deadline (adds it to Tasks)
      </label>
      {hasDue && (
        <div className="formgrid">
          <label>Deadline<input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
          <label>Type
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="task">Task</option>
              <option value="assignment">Assignment</option>
            </select>
          </label>
        </div>
      )}
      {msg && <p className="error">{msg}</p>}
      <div className="row">
        <button className="small" disabled={busy || !note.trim()} onClick={save}>Save remark</button>
        {list.length > 0 && <button className="secondary small" onClick={() => { setAdding(false); setNote('') }}>Cancel</button>}
      </div>
      </>)}
      {!showForm && msg && <p className="error">{msg}</p>}
    </div>
  )
}

// The "Remarks" button and the section it opens. Remarks can be written at any time, before, during or after the class.
export function RemarksButton({ open, onClick }) {
  return <button className="secondary" aria-expanded={open} onClick={onClick}>Remarks {open ? '▴' : '▾'}</button>
}

export function RemarksToggle(props) {
  const [open, setOpen] = useState(false)
  return (
    <div className="attpanel">
      <div className="row nomargin"><RemarksButton open={open} onClick={() => setOpen(!open)} /></div>
      <Expand open={open}><RemarksPanel {...props} /></Expand>
    </div>
  )
}
