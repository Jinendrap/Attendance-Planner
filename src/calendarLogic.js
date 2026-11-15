import { hhmm } from './config.js'
import { toMin } from './dateUtils.js'

export const attOf = (row) => (Array.isArray(row.attendance) ? row.attendance[0] : row.attendance) || null

export const isStarted = (date, start, now) =>
  date < now.date || (date === now.date && toMin(start) <= now.minutes)
export const hasStarted = (row, now) => isStarted(row.session_date, hhmm(row.start_time), now)

// Which sessions belong to one class: imported and extra classes share a google_event_id;
// classes added by hand share their weekly slot and date.
export const groupKey = (r) => r.google_event_id || (r.slot_id ? `${r.slot_id}|${r.session_date}` : r.id)

// Sessions of one class (e.g. the parts of a 2-hour class) are shown as one block.
// Classes of the same subject that run straight after each other on a day are joined into one block too.
export function toBlocks(rows) {
  const map = new Map()
  for (const r of rows) {
    const key = groupKey(r)
    const start = hhmm(r.start_time)
    const end = hhmm(r.end_time)
    if (!map.has(key)) {
      map.set(key, {
        key, subjectId: r.subject_id, isExtra: Boolean(r.is_extra), ids: [], list: [], statuses: [], date: r.session_date, start, end,
        subject: r.subjects?.name || 'Class', colour: r.subjects?.colour || '#1f3a5f',
        room: r.room, faculty: r.faculty,
      })
    }
    const b = map.get(key)
    b.ids.push(r.id); b.statuses.push(r.status)
    b.list.push({ id: r.id, part: r.part, start, end, att: attOf(r) })
    if (start < b.start) b.start = start
    if (end > b.end) b.end = end
  }
  const statusOf = (s) => (s.every((x) => x === 'cancelled') ? 'cancelled' : s.every((x) => x === 'holiday') ? 'holiday' : 'scheduled')
  const sorted = [...map.values()].sort((a, b) => a.date.localeCompare(b.date) || (a.subjectId || '').localeCompare(b.subjectId || '') || a.start.localeCompare(b.start))
  const merged = []
  for (const b of sorted) {
    const prev = merged[merged.length - 1]
    if (prev && prev.date === b.date && prev.subjectId === b.subjectId && prev.isExtra === b.isExtra
      && prev.end === b.start && statusOf(prev.statuses) === statusOf(b.statuses)) {
      prev.ids.push(...b.ids); prev.statuses.push(...b.statuses); prev.list.push(...b.list)
      prev.end = b.end
    } else {
      merged.push(b)
    }
  }
  return merged.map((b) => ({
    ...b,
    parts: b.list.length,
    list: b.list.sort((x, y) => x.start.localeCompare(y.start) || x.part - y.part),
    status: statusOf(b.statuses),
  }))
}

export function blockState(b, now) {
  if (b.status !== 'scheduled') return b.status
  const marked = b.list.filter((p) => p.att)
  if (marked.length === b.list.length) {
    if (marked.every((p) => p.att.status === 'present')) return 'present'
    if (marked.every((p) => p.att.status === 'absent')) return 'absent'
    return 'partial'
  }
  if (marked.length > 0) return 'partial'
  if (b.date > now.date) return 'upcoming'
  if (b.date === now.date && toMin(b.start) > now.minutes) return 'upcoming'
  if (b.date === now.date && toMin(b.end) > now.minutes) return 'live'
  return 'pending'
}

export const STATE_LABEL = {
  upcoming: 'Upcoming', live: 'In progress', pending: 'Needs attendance', present: 'Present',
  absent: 'Absent', partial: 'Partly marked', cancelled: 'Cancelled', holiday: 'Holiday',
}
export const STATE_BADGE = { present: '✓ Present', absent: '✗ Absent', partial: '◐ Partly', pending: '! Mark attendance' }

// Side-by-side lanes for any classes that overlap in time on the same day.
export function layout(blocks) {
  const ends = []
  const placed = [...blocks].sort((a, b) => a.start.localeCompare(b.start)).map((b) => {
    let lane = ends.findIndex((e) => e <= b.start)
    if (lane < 0) { lane = ends.length; ends.push(b.end) } else ends[lane] = b.end
    return { ...b, lane }
  })
  const lanes = Math.max(1, ends.length)
  return placed.map((b) => ({ ...b, lanes }))
}
