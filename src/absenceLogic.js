import { hhmm } from './config.js'
import { toMin } from './dateUtils.js'
import { groupKey } from './calendarLogic.js'

export const dur = (min) => {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`
}

// Turns absent sessions into one line per class (the sessions of a 2-hour class are joined together).
export function groupAbsences(rows) {
  const map = new Map()
  for (const r of rows || []) {
    const key = groupKey(r)
    const att = Array.isArray(r.attendance) ? r.attendance[0] : r.attendance
    const start = hhmm(r.start_time)
    const end = hhmm(r.end_time)
    if (!map.has(key)) map.set(key, { key, subjectId: r.subject_id, date: r.session_date, start, end, subject: r.subjects?.name || 'Class', colour: r.subjects?.colour, sessions: 0, reasons: [] })
    const b = map.get(key)
    b.sessions += 1
    if (start < b.start) b.start = start
    if (end > b.end) b.end = end
    if (att?.reason && !b.reasons.includes(att.reason)) b.reasons.push(att.reason)
  }
  // Back-to-back classes of the same subject on one day are shown as one line.
  const joined = []
  for (const b of [...map.values()].sort((a, c) => a.date.localeCompare(c.date) || (a.subjectId || '').localeCompare(c.subjectId || '') || a.start.localeCompare(c.start))) {
    const prev = joined[joined.length - 1]
    if (prev && prev.date === b.date && prev.subjectId === b.subjectId && prev.end === b.start) {
      prev.end = b.end; prev.sessions += b.sessions
      b.reasons.forEach((x) => { if (!prev.reasons.includes(x)) prev.reasons.push(x) })
    } else joined.push(b)
  }
  return joined.sort((a, b) => (a.date === b.date ? a.start.localeCompare(b.start) : b.date.localeCompare(a.date)))
}

export const absenceMinutes = (b) => toMin(b.end) - toMin(b.start)
