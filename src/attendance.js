import { supabase } from './supabaseClient.js'
import { attOf, hasStarted } from './calendarLogic.js'

const KEY = 'cap_queue_v1'
const readQueue = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] } }
const writeQueue = (q) => { try { localStorage.setItem(KEY, JSON.stringify(q)) } catch { /* ignore */ } }

// Marks that could not be sent (no internet) are shown as if saved, until they sync.
export function withQueue(rows) {
  const q = new Map(readQueue().map((m) => [m.sessionId, m]))
  if (!q.size) return rows
  return rows.map((r) => {
    const m = q.get(r.id)
    if (!m) return r
    return { ...r, attendance: m.status ? { status: m.status, reason: m.reason || null } : null }
  })
}

const looksOffline = (e) => !navigator.onLine || /fetch|network|load failed/i.test(e?.message || '')

async function send(userId, marks) {
  const sets = marks.filter((m) => m.status).map((m) => ({
    user_id: userId, session_id: m.sessionId, status: m.status,
    reason: m.status === 'absent' ? m.reason || null : null, marked_at: new Date().toISOString(),
  }))
  const clears = marks.filter((m) => !m.status).map((m) => m.sessionId)
  if (sets.length) {
    const r = await supabase.from('attendance').upsert(sets, { onConflict: 'session_id' })
    if (r.error) throw r.error
  }
  if (clears.length) {
    const r = await supabase.from('attendance').delete().in('session_id', clears)
    if (r.error) throw r.error
  }
}

// marks: [{ sessionId, status: 'present' | 'absent' | null (clear), reason }]
export async function markSessions(userId, marks) {
  try {
    await send(userId, marks)
    return { queued: false }
  } catch (e) {
    if (!looksOffline(e)) throw e
    const q = new Map(readQueue().map((m) => [m.sessionId, m]))
    marks.forEach((m) => q.set(m.sessionId, { ...m, t: Date.now() }))
    writeQueue([...q.values()])
    return { queued: true }
  }
}

export async function flushQueue(userId) {
  const q = readQueue()
  if (!q.length) return 0
  try {
    await send(userId, q)
    const sent = new Set(q.map((m) => `${m.sessionId}|${m.t}`))
    writeQueue(readQueue().filter((m) => !sent.has(`${m.sessionId}|${m.t}`)))
    return q.length
  } catch { return 0 }
}

// Classes that have started but have no Present/Absent mark yet.
export async function fetchPending(semesterId, now) {
  const { data, error } = await supabase.from('sessions')
    .select('*, subjects(name, colour), attendance(status, reason)')
    .eq('semester_id', semesterId).eq('status', 'scheduled').lte('session_date', now.date)
    .order('session_date', { ascending: false }).order('start_time', { ascending: false }).limit(1000)
  if (error) throw error
  return withQueue(data).filter((r) => hasStarted(r, now) && !attOf(r))
}

// Every session of the semester with its attendance mark (read in pages of 1000).
export async function fetchAllSessions(semesterId) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('sessions')
      .select('id, subject_id, status, session_date, start_time, end_time, attendance(status)')
      .eq('semester_id', semesterId).order('session_date').order('start_time').order('id')
      .range(from, from + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) break
  }
  return withQueue(out)
}
