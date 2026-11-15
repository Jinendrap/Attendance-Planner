import { toMin, toHHMM } from './dateUtils.js'
import { groupKey } from './calendarLogic.js'

// Works out how to change the dated sessions of one weekly slot after it was edited.
// Existing sessions are updated in place (so cancelled status etc. is kept);
// extra parts are added or removed when the number of sessions per class changes.
export function planResync(rows, vals) {
  const groups = new Map()
  for (const r of rows) {
    const k = groupKey(r)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(r)
  }
  const n = vals.sessions
  const s = toMin(vals.start)
  const len = (toMin(vals.end) - s) / n
  const upserts = []
  const inserts = []
  const deleteIds = []
  for (const g of groups.values()) {
    g.sort((a, b) => a.part - b.part)
    const base = g[0]
    for (let i = 0; i < n; i++) {
      const fields = {
        start_time: toHHMM(s + Math.round(i * len)),
        end_time: i === n - 1 ? vals.end : toHHMM(s + Math.round((i + 1) * len)),
        room: vals.room,
        faculty: vals.faculty,
      }
      const ex = g.find((r) => r.part === i + 1)
      if (ex) {
        upserts.push({ ...ex, ...fields })
      } else {
        inserts.push({
          user_id: base.user_id, semester_id: base.semester_id, slot_id: base.slot_id,
          subject_id: base.subject_id, google_event_id: base.google_event_id, part: i + 1,
          session_date: base.session_date, status: base.status, is_extra: base.is_extra, ...fields,
        })
      }
    }
    g.filter((r) => r.part > n).forEach((r) => deleteIds.push(r.id))
  }
  return { upserts, inserts, deleteIds }
}

import { weekdayOf, addDays } from './dateUtils.js'

export function timeError(start, end) {
  const ok = (t) => /^\d{2}:\d{2}$/.test(t) && toMin(t) < 24 * 60
  if (!ok(start) || !ok(end)) return 'Pick a start and end time.'
  if (toMin(end) <= toMin(start)) return 'The end time must be after the start time.'
  return ''
}

// Dated sessions for a new weekly class, from `from` to the end of the semester.
export function generateSessions({ slotId, subjectId, semesterId, weekday, start, end, n, room, faculty, from, to }) {
  const rows = []
  const len = (toMin(end) - toMin(start)) / n
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (weekdayOf(d) !== weekday) continue
    for (let i = 0; i < n; i++) {
      rows.push({
        semester_id: semesterId, slot_id: slotId, subject_id: subjectId, session_date: d, part: i + 1,
        start_time: toHHMM(toMin(start) + Math.round(i * len)),
        end_time: i === n - 1 ? end : toHHMM(toMin(start) + Math.round((i + 1) * len)),
        room, faculty,
      })
    }
  }
  return rows
}
