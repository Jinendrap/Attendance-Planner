// The one calculation engine. The dashboard (and, in Phase 6, the leave simulator) use only this.
// Rules:
//  - Conducted (T) = sessions marked Present or Absent. Cancelled, holiday, future and unmarked sessions are not counted.
//  - Attended (A)  = sessions marked Present.
//  - Percentage    = A / T, never rounded up (74.999 stays below 75).
//  - All checks use whole numbers (A*100 vs r*T), so there are no decimal errors.
import { attOf, hasStarted } from './calendarLogic.js'

export function summarize(A, T, r) {
  if (T === 0) return { A, T, absent: 0, pct: null, required: r, state: 'none', canMiss: null, mustAttend: null }
  const meets = A * 100 >= r * T
  const canMiss = meets ? Math.floor((A * 100 - r * T) / r) : 0
  const mustAttend = meets ? 0 : r >= 100 ? null : Math.ceil((r * T - A * 100) / (100 - r))
  return {
    A, T, absent: T - A, required: r,
    pct: Math.floor((A * 10000) / T) / 100, // cut to 2 decimals, never rounded up
    state: !meets ? 'below' : canMiss === 0 ? 'edge' : 'safe',
    canMiss, mustAttend,
  }
}

const ORDER = { below: 0, edge: 1, safe: 2, none: 3 }

export function buildDashboard(subjects, sessions, overallRequired, now) {
  const by = new Map(subjects.map((s) => [s.id, { A: 0, T: 0, remaining: 0 }]))
  let pending = 0
  for (const s of sessions) {
    const c = by.get(s.subject_id)
    if (!c || s.status !== 'scheduled') continue
    const att = attOf(s)
    if (att) {
      // Experiential classes count (as attended) once they have started; before that they are just "still to come".
      if (s.experiential && !hasStarted({ session_date: s.session_date, start_time: s.start_time }, now)) { c.remaining += 1; continue }
      c.T += 1
      if (att.status === 'present') c.A += 1
    } else if (hasStarted({ session_date: s.session_date, start_time: s.start_time }, now)) {
      pending += 1
    } else {
      c.remaining += 1
    }
  }
  const rows = subjects.map((s) => {
    const c = by.get(s.id)
    return { subject: s, remaining: c.remaining, ...summarize(c.A, c.T, s.required_pct) }
  }).sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.subject.name.localeCompare(b.subject.name))
  const A = rows.reduce((x, r) => x + r.A, 0)
  const T = rows.reduce((x, r) => x + r.T, 0)
  return { rows, overall: summarize(A, T, overallRequired), pending }
}


// Leave simulator. Same rules and the same summarize() as the dashboard.
//  - Real marks (present/absent) stay exactly as they are.
//  - Unmarked classes inside the leave dates are counted as missed (lost).
//  - Holiday and cancelled classes are never counted.
//  - If `assume` is true, every other unmarked class before the leave starts is assumed attended.
//  - Experiential classes are attended automatically, so a leave never loses them.
export function simulateLeave(subjects, sessions, range, assume, overallRequired, now = null) {
  const per = new Map(subjects.map((s) => [s.id, { A: 0, T: 0, F: 0, L: 0, X: 0 }]))
  for (const s of sessions) {
    const c = per.get(s.subject_id)
    if (!c || s.status !== 'scheduled') continue
    const att = attOf(s)
    if (att) {
      if (s.experiential && now && !hasStarted({ session_date: s.session_date, start_time: s.start_time }, now)) { c.X += 1; continue }
      c.T += 1; if (att.status === 'present') c.A += 1; continue
    }
    if (s.session_date >= range.from && s.session_date <= range.to) c.L += 1
    else if (s.session_date < range.from) c.F += 1
  }
  const tot = { A: 0, T: 0, A2: 0, T2: 0, lost: 0 }
  const rows = subjects.map((s) => {
    const c = per.get(s.id)
    const A2 = c.A + (assume ? c.F : 0) + c.X
    const T2 = c.T + (assume ? c.F : 0) + c.L + c.X
    tot.A += c.A; tot.T += c.T; tot.A2 += A2; tot.T2 += T2; tot.lost += c.L
    return { subject: s, lost: c.L, now: summarize(c.A, c.T, s.required_pct), after: summarize(A2, T2, s.required_pct) }
  }).sort((a, b) => b.lost - a.lost || a.subject.name.localeCompare(b.subject.name))
  return {
    rows,
    overall: { lost: tot.lost, now: summarize(tot.A, tot.T, overallRequired), after: summarize(tot.A2, tot.T2, overallRequired) },
  }
}
