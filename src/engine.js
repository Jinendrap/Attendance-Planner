// The one calculation engine. The dashboard (and, in Phase 6, the leave simulator) use only this.
// Rules:
//  - Conducted (T) = sessions marked Present or Absent. Cancelled, holiday, future and unmarked sessions are not counted.
//  - Attended (A)  = sessions marked Present.
//  - Percentage    = A / T, never rounded up (74.999 stays below 75).
//  - All checks use whole numbers (A*100 vs r*T), so there are no decimal errors.
import { attOf, hasStarted } from './calendarLogic.js'
import { hoursFor } from './hoursLogic.js'

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
//  - If `assume` is true, every other unmarked class before the (first) leave starts is assumed attended.
//  - Experiential classes are attended automatically, so a leave never loses them.
//  - `range` is one { from, to } or a list of them (several plans taken together; overlaps count once).
//  - "left" = unmarked classes you can still attend outside the leave dates (after the first leave starts,
//    plus the ones before it when you did not assume them). Judgement: attend `mustAttend` of the `left`.
export function judge(after, left) {
  if (after.state === 'none') return { kind: 'none', left, need: 0, spare: left, best: null }
  const best = summarize(after.A + left, after.T + left, after.required)
  if (after.state === 'below') {
    const need = after.mustAttend
    if (need !== null && need <= left) return { kind: 'recover', left, need, spare: left - need, best: best.pct }
    return { kind: 'fail', left, need, spare: 0, best: best.pct }
  }
  return { kind: after.state === 'edge' ? 'edge' : 'safe', left, need: 0, spare: Math.min(after.canMiss, left), best: best.pct }
}

export function simulateLeave(subjects, sessions, range, assume, overallRequired, now = null) {
  const ranges = (Array.isArray(range) ? range : [range]).filter((r) => r && r.from && r.to)
  const first = ranges.reduce((m, r) => (r.from < m ? r.from : m), '9999-99-99')
  const inLeave = (d) => ranges.some((r) => d >= r.from && d <= r.to)
  const per = new Map(subjects.map((s) => [s.id, { A: 0, T: 0, F: 0, L: 0, X: 0, R: 0 }]))
  // Course hours cap: each subject has credits x 15 hours. Earliest classes are kept, later unmarked ones above the
  // limit are ignored (same rule as the course-hours clean-up). Marked classes are never dropped.
  const extra = new Map(), have = new Map()
  const ignored = new Set()
  for (const sub of subjects) {
    const mine = sessions.filter((s) => s.subject_id === sub.id && s.status === 'scheduled')
      .sort((a, b) => a.session_date.localeCompare(b.session_date) || String(a.start_time).localeCompare(String(b.start_time)) || (a.part || 0) - (b.part || 0))
    const allowed = hoursFor(sub.credits)
    have.set(sub.id, mine.length)
    let n = 0
    for (const s of mine.slice(allowed)) if (!attOf(s)) { ignored.add(s); n += 1 }
    extra.set(sub.id, n)
  }
  for (const s of sessions) {
    if (ignored.has(s)) continue
    const c = per.get(s.subject_id)
    if (!c || s.status !== 'scheduled') continue
    const att = attOf(s)
    if (att) {
      if (s.experiential && now && !hasStarted({ session_date: s.session_date, start_time: s.start_time }, now)) { c.X += 1; continue }
      c.T += 1; if (att.status === 'present') c.A += 1; continue
    }
    if (inLeave(s.session_date)) c.L += 1
    else if (s.session_date < first) c.F += 1
    else c.R += 1
  }
  const tot = { A: 0, T: 0, A2: 0, T2: 0, lost: 0, left: 0 }
  const rows = subjects.map((s) => {
    const c = per.get(s.id)
    const A2 = c.A + (assume ? c.F : 0) + c.X
    const T2 = c.T + (assume ? c.F : 0) + c.L + c.X
    const left = c.R + (assume ? 0 : c.F)
    tot.A += c.A; tot.T += c.T; tot.A2 += A2; tot.T2 += T2; tot.lost += c.L; tot.left += left
    const after = summarize(A2, T2, s.required_pct)
    return { subject: s, lost: c.L, left, hours: { allowed: hoursFor(s.credits), ignored: extra.get(s.id) || 0, missing: Math.max(0, hoursFor(s.credits) - (have.get(s.id) || 0)) }, now: summarize(c.A, c.T, s.required_pct), after, verdict: judge(after, left) }
  }).sort((a, b) => b.lost - a.lost || a.subject.name.localeCompare(b.subject.name))
  const afterAll = summarize(tot.A2, tot.T2, overallRequired)
  return {
    rows,
    overall: { lost: tot.lost, left: tot.left, now: summarize(tot.A, tot.T, overallRequired), after: afterAll, verdict: judge(afterAll, tot.left) },
  }
}
