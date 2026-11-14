import { addDays } from './dateUtils.js'

const dayNum = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000) }

// Open tasks are grouped by urgency; finished ones go last.
export function groupTasks(tasks, today) {
  const g = { overdue: [], today: [], soon: [], later: [], nodate: [], done: [] }
  const soonEnd = addDays(today, 7)
  for (const t of tasks) {
    if (t.done) g.done.push(t)
    else if (!t.due_date) g.nodate.push(t)
    else if (t.due_date < today) g.overdue.push(t)
    else if (t.due_date === today) g.today.push(t)
    else if (t.due_date <= soonEnd) g.soon.push(t)
    else g.later.push(t)
  }
  const byDue = (a, b) => a.due_date.localeCompare(b.due_date) || a.created_at.localeCompare(b.created_at)
  for (const k of ['overdue', 'today', 'soon', 'later']) g[k].sort(byDue)
  g.nodate.sort((a, b) => a.created_at.localeCompare(b.created_at))
  g.done.sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''))
  return g
}

export function dueLabel(due, today) {
  if (!due) return 'No deadline'
  const n = dayNum(due) - dayNum(today)
  if (n === 0) return 'Due today'
  if (n === 1) return 'Due tomorrow'
  if (n > 1) return `Due in ${n} days`
  return `Overdue by ${-n} day${n === -1 ? '' : 's'}`
}
