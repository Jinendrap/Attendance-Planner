// All dates are plain 'YYYY-MM-DD' strings; weeks start on Monday; time zone is India (IST).
const toDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) }
const toIso = (dt) => dt.toISOString().slice(0, 10)

export const addDays = (iso, n) => { const d = toDate(iso); d.setUTCDate(d.getUTCDate() + n); return toIso(d) }
export const addMonths = (iso, n) => { const d = toDate(iso); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); return toIso(d) }
export const mondayOf = (iso) => addDays(iso, -((toDate(iso).getUTCDay() + 6) % 7))
export const monthGrid = (iso) => {
  const start = mondayOf(`${iso.slice(0, 8)}01`)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}
export const fmt = (iso, opts) => toDate(iso).toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts })
export const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }

export function nowIST() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date())
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) }
}

export const toHHMM = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`

export const weekdayOf = (iso) => toDate(iso).getUTCDay() // 0 = Sunday
