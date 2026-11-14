import { toBlocks } from './calendarLogic.js'
import { fmt, nowIST } from './dateUtils.js'
import AttendancePanel from './AttendancePanel.jsx'

export default function PendingView({ rows, onMark }) {
  const now = nowIST()
  const blocks = toBlocks(rows)
  const dates = [...new Set(blocks.map((b) => b.date))].sort().reverse()

  if (!blocks.length) {
    return <section className="panel"><h2>All caught up</h2><p className="muted">Every class that has started has its attendance marked.</p></section>
  }
  return (
    <section className="panel">
      <h2>Pending attendance</h2>
      <p className="muted">Classes that have started but are not marked yet. Tap Present or Absent.</p>
      {dates.map((d) => (
        <div key={d} className="day">
          <h4>{fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}</h4>
          {blocks.filter((b) => b.date === d).sort((a, b) => a.start.localeCompare(b.start)).map((b) => (
            <div className="pend" key={b.key} style={{ borderLeftColor: b.colour }}>
              <div><strong>{b.subject}</strong> <span className="muted">{b.start}–{b.end}{b.room ? ` · ${b.room}` : ''}</span></div>
              <AttendancePanel list={b.list} date={b.date} now={now} onMark={onMark} />
            </div>
          ))}
        </div>
      ))}
    </section>
  )
}
