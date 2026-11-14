import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient.js'
import { nowIST, fmt } from './dateUtils.js'
import { groupTasks, dueLabel } from './taskLogic.js'

const SECTIONS = [
  ['overdue', 'Overdue'], ['today', 'Due today'], ['soon', 'Next 7 days'],
  ['later', 'Later'], ['nodate', 'No deadline'],
]

export default function Tasks({ semester, version, onChanged }) {
  const [subjects, setSubjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [state, setState] = useState('loading')
  const [msg, setMsg] = useState('')
  const [reload, setReload] = useState(0)
  const [showDone, setShowDone] = useState(false)
  const [f, setF] = useState({ title: '', subject: '', kind: 'task', due: '' })
  const today = nowIST().date

  useEffect(() => {
    let off = false
    ;(async () => {
      const [s, t] = await Promise.all([
        supabase.from('subjects').select('id, name, colour').eq('semester_id', semester.id).order('name'),
        supabase.from('tasks').select('*').eq('semester_id', semester.id),
      ])
      if (off) return
      if (s.error || t.error) { setState(t.error && !s.error ? 'missing' : 'error'); return }
      setSubjects(s.data); setTasks(t.data); setState('ready')
    })()
    return () => { off = true }
  }, [semester.id, reload, version])

  const subj = (id) => subjects.find((s) => s.id === id)
  const refresh = () => { setReload((r) => r + 1); onChanged?.() }

  async function add() {
    const title = f.title.trim()
    if (!title) return
    const r = await supabase.from('tasks').insert({
      semester_id: semester.id, subject_id: f.subject || null, title, kind: f.kind, due_date: f.due || null,
    })
    if (r.error) { setMsg('Could not add the task. Check your internet connection.'); return }
    setF({ ...f, title: '', due: '' }); setMsg(''); refresh()
  }
  async function toggle(t) {
    const r = await supabase.from('tasks').update({ done: !t.done, done_at: t.done ? null : new Date().toISOString() }).eq('id', t.id)
    if (r.error) { setMsg('Could not update the task.'); return }
    refresh()
  }
  async function remove(t) {
    if (!window.confirm(`Delete "${t.title}"?`)) return
    const r = await supabase.from('tasks').delete().eq('id', t.id)
    if (r.error) { setMsg('Could not delete the task.'); return }
    refresh()
  }

  if (state === 'loading') return <section className="panel"><p className="muted">Loading…</p></section>
  if (state === 'missing') return <section className="panel"><p className="error">The Phase 8 tables are missing. Run <strong>phase8_remarks_tasks.sql</strong> in Supabase, then refresh.</p></section>
  if (state === 'error') return <section className="panel"><p className="error">Could not load tasks. Check your internet connection.</p></section>

  const g = groupTasks(tasks, today)
  const Row = ({ t }) => {
    const s = subj(t.subject_id)
    return (
      <div className={`task ${t.done ? 'isdone' : ''}`} style={{ borderLeftColor: s?.colour || 'var(--line)' }}>
        <input type="checkbox" checked={t.done} onChange={() => toggle(t)} aria-label={`Mark ${t.title} ${t.done ? 'not done' : 'done'}`} />
        <div className="grow">
          <strong>{t.title}</strong>
          <div className="muted small-text">
            {s ? `${s.name} · ` : ''}{t.kind === 'assignment' ? 'Assignment' : 'Task'}
            {t.due_date ? ` · ${fmt(t.due_date, { day: 'numeric', month: 'short' })} · ${t.done ? '' : dueLabel(t.due_date, today)}` : ''}
          </div>
        </div>
        <button className="secondary small danger" onClick={() => remove(t)} aria-label="Delete task">✕</button>
      </div>
    )
  }

  return (
    <>
      <section className="panel">
        <h2>Add a task</h2>
        <div className="formgrid">
          <label>Title<input type="text" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Lab record" /></label>
          <label>Subject
            <select value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })}>
              <option value="">General</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label>Type
            <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
              <option value="task">Task</option>
              <option value="assignment">Assignment</option>
            </select>
          </label>
          <label>Deadline (optional)<input type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></label>
        </div>
        <div className="row"><button disabled={!f.title.trim()} onClick={add}>Add task</button></div>
        {msg && <p className="error">{msg}</p>}
      </section>

      <section className="panel">
        <h2>Tasks &amp; deadlines</h2>
        {SECTIONS.every(([k]) => !g[k].length) && <p className="muted">Nothing open. Add a task above, or add a remark with a deadline to a class in the Calendar.</p>}
        {SECTIONS.map(([k, label]) => g[k].length > 0 && (
          <div key={k}>
            <h4 className={k === 'overdue' ? 'error' : ''}>{label} ({g[k].length})</h4>
            {g[k].map((t) => <Row key={t.id} t={t} />)}
          </div>
        ))}
        {g.done.length > 0 && (
          <div>
            <div className="row"><button className="secondary small" onClick={() => setShowDone(!showDone)}>{showDone ? 'Hide' : 'Show'} completed ({g.done.length})</button></div>
            {showDone && g.done.map((t) => <Row key={t.id} t={t} />)}
          </div>
        )}
      </section>
    </>
  )
}
