// Shown to someone who has no subjects yet (a brand-new account): two ways to fill the planner.
export default function GettingStarted({ onImport, onManual }) {
  return (
    <section className="panel">
      <p className="eyebrow">Getting started</p>
      <h2>Add your timetable</h2>
      <p className="muted">Your planner is empty. Pick one way to fill it:</p>
      <ol className="steps">
        <li><strong>Import from Google Calendar</strong>: reads the calendar that holds your timetable (read-only).</li>
        <li><strong>Add by hand</strong>: in Settings, under Subjects &amp; timetable, add your subjects and weekly classes.</li>
      </ol>
      <div className="row">
        <button onClick={onImport}>Import from Google Calendar</button>
        <button className="secondary" onClick={onManual}>Add by hand</button>
      </div>
    </section>
  )
}
