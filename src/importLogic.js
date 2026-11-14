import { PALETTE } from './config.js'

const clean = (s) => (s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
const toHHMM = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
const weekdayOf = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = Sunday
}

// A 2-hour class counts as 2 sessions; a 50 or 60 minute class counts as 1.
export const sessionsPerClass = (minutes) => Math.max(1, Math.floor((minutes + 10) / 60))
export const slotKey = (subject, weekday, start) => `${subject.toLowerCase()}|${weekday}|${start}`

export function parseEvents(items) {
  const events = []
  for (const ev of items) {
    if (ev.status === 'cancelled') continue
    if (!ev.start?.dateTime || !ev.end?.dateTime) continue // skip all-day events
    const subject = clean(ev.summary)
    if (!subject) continue
    const date = ev.start.dateTime.slice(0, 10)
    if (ev.end.dateTime.slice(0, 10) !== date) continue
    const start = ev.start.dateTime.slice(11, 16)
    const end = ev.end.dateTime.slice(11, 16)
    const minutes = toMin(end) - toMin(start)
    if (minutes <= 0) continue
    events.push({
      googleId: ev.id, subject, date, start, end, minutes,
      weekday: weekdayOf(date), room: clean(ev.location), faculty: clean(ev.description),
    })
  }
  return events
}

export function buildPlan(events) {
  const subjects = new Map()
  const slots = new Map()
  for (const ev of events) {
    const sKey = ev.subject.toLowerCase()
    if (!subjects.has(sKey)) {
      subjects.set(sKey, { key: sKey, name: ev.subject, colour: PALETTE[subjects.size % PALETTE.length] })
    }
    const key = slotKey(ev.subject, ev.weekday, ev.start)
    if (!slots.has(key)) {
      slots.set(key, {
        key, subjectKey: sKey, subject: subjects.get(sKey).name, weekday: ev.weekday,
        start: ev.start, end: ev.end, room: ev.room, faculty: ev.faculty,
        sessionsPerClass: sessionsPerClass(ev.minutes), count: 0,
      })
    }
    slots.get(key).count += 1
  }
  const slotList = [...slots.values()].sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start))
  return { subjects: [...subjects.values()], slots: slotList, events }
}

// One database row per session (a 2-hour class becomes 2 rows).
export function buildSessionRows(events, perClass, ids, userId, semesterId) {
  const rows = []
  for (const ev of events) {
    const key = slotKey(ev.subject, ev.weekday, ev.start)
    const n = perClass[key] ?? sessionsPerClass(ev.minutes)
    const startMin = toMin(ev.start)
    const part = ev.minutes / n
    for (let i = 0; i < n; i++) {
      rows.push({
        user_id: userId, semester_id: semesterId,
        slot_id: ids.slotIds.get(key) || null,
        subject_id: ids.subjectIds.get(ev.subject.toLowerCase()),
        google_event_id: ev.googleId, part: i + 1, session_date: ev.date,
        start_time: toHHMM(startMin + Math.round(i * part)),
        end_time: toHHMM(i === n - 1 ? toMin(ev.end) : startMin + Math.round((i + 1) * part)),
        room: ev.room, faculty: ev.faculty,
      })
    }
  }
  return rows
}
