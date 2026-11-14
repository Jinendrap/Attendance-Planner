import { supabase } from './supabaseClient.js'

// Classes that fall on a holiday get the status "holiday", so they are left out of every
// attendance calculation (just like cancelled classes). Safe to run any number of times.
export async function syncHolidays(semesterId) {
  const h = await supabase.from('holidays').select('start_date, end_date').eq('semester_id', semesterId)
  if (h.error) return // table not created yet
  for (const x of h.data) {
    await supabase.from('sessions').update({ status: 'holiday' })
      .eq('semester_id', semesterId).eq('status', 'scheduled')
      .gte('session_date', x.start_date).lte('session_date', x.end_date)
  }
}

// After a holiday is deleted: classes in its dates that no other holiday covers become normal classes again.
export async function releaseHolidayRange(semesterId, from, to) {
  const h = await supabase.from('holidays').select('start_date, end_date').eq('semester_id', semesterId)
  if (h.error) return
  const s = await supabase.from('sessions').select('id, session_date')
    .eq('semester_id', semesterId).eq('status', 'holiday').gte('session_date', from).lte('session_date', to)
  if (s.error) return
  const free = s.data.filter((r) => !h.data.some((x) => r.session_date >= x.start_date && r.session_date <= x.end_date)).map((r) => r.id)
  for (let i = 0; i < free.length; i += 100) {
    await supabase.from('sessions').update({ status: 'scheduled' }).in('id', free.slice(i, i + 100))
  }
}
