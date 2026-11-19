// Course hours. A 4-credit subject is 60 hours (15 hours per credit); other credits scale the same way.
// One session is counted as one hour. About 20% of the hours (12 of 60) are experiential classes.

export const HOURS_PER_CREDIT = 15
export const DEFAULT_CREDITS = 4
export const hoursFor = (credits) => Math.round((Number(credits) || DEFAULT_CREDITS) * HOURS_PER_CREDIT)
export const experientialFor = (hours) => Math.round(hours * 0.2)

const real = (s) => {
  const a = Array.isArray(s.attendance) ? s.attendance[0] : s.attendance
  return Boolean(a)
}

// For each subject: how many hours are scheduled, how many are over the limit, and which ones can be removed.
// Only scheduled classes count (cancelled and holiday ones are not hours). The earliest classes are kept;
// the latest ones above the limit are the extras. A class that already has a Present/Absent mark is never removed.
export function checkHours(subjects, sessions) {
  return subjects.map((subject) => {
    const allowed = hoursFor(subject.credits)
    const mine = sessions
      .filter((s) => s.subject_id === subject.id && s.status === 'scheduled')
      .sort((a, b) => a.session_date.localeCompare(b.session_date) || String(a.start_time).localeCompare(String(b.start_time)) || (a.part || 0) - (b.part || 0))
    const extras = mine.slice(allowed)
    const removable = extras.filter((s) => !real(s))
    return {
      subject, allowed, scheduled: mine.length,
      over: extras.length, removable, keptMarked: extras.length - removable.length,
      exp: mine.filter((s) => s.experiential).length, expAllowed: experientialFor(allowed),
      firstExtra: removable[0]?.session_date || null, lastExtra: removable[removable.length - 1]?.session_date || null,
    }
  })
}
