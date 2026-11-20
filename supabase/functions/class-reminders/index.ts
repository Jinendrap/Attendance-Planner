// Supabase Edge Function "class-reminders".
// Runs every minute (see supabase/phase7_schedule.sql). Sends a push notification
// about 5 minutes before each class, with Present / Absent buttons on the phone.
// Needs these secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET.
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const MINUTES_BEFORE = 5 // remind when the class starts within this many minutes
const LATE_GRACE = 3 // still remind if the class started up to this many minutes ago

const hhmmToMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const hhmm = (t: string) => t.slice(0, 5)

function nowIST() {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000)
  return { date: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  )

  // Send to every saved phone of one user; forget phones that no longer exist.
  async function sendTo(userId: string, payload: Record<string, unknown>) {
    const { data: subs } = await admin.from('push_subscriptions').select('*').eq('user_id', userId)
    let sent = 0
    for (const s of subs || []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload), { TTL: 300, urgency: 'high' },
        )
        sent++
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('id', s.id)
      }
    }
    return sent
  }

  const secret = Deno.env.get('CRON_SECRET')
  const isCron = Boolean(secret) && req.headers.get('x-cron-secret') === secret

  // A signed-in user asking for a test notification (from the Phone setup screen).
  if (!isCron) {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    const { data } = token ? await admin.auth.getUser(token) : { data: { user: null } }
    if (!data?.user) return json({ error: 'Not allowed' }, 401)
    const sent = await sendTo(data.user.id, {
      title: 'Test notification', body: 'Class reminders are working on this phone.', tag: 'cap-test',
    })
    return json({ sent })
  }

  // Scheduled run: find classes starting soon.
  const now = nowIST()
  const { data: rows, error } = await admin.from('sessions')
    .select('id, user_id, google_event_id, start_time, end_time, room, reminder_sent_at, experiential, subjects(name), attendance(status)')
    .eq('status', 'scheduled').eq('session_date', now.date)
  if (error) return json({ error: error.message }, 500)

  // One class can have several sessions (e.g. a 2-hour lab): remind once per class.
  const groups = new Map<string, typeof rows>()
  for (const r of rows || []) {
    const key = `${r.user_id}|${r.google_event_id || r.id}`
    groups.set(key, [...(groups.get(key) || []), r])
  }

  let reminded = 0
  for (const list of groups.values()) {
    if (list.some((r) => r.reminder_sent_at)) continue
    const start = Math.min(...list.map((r) => hhmmToMin(r.start_time)))
    const diff = start - now.minutes
    if (diff > MINUTES_BEFORE || diff < -LATE_GRACE) continue

    // Experiential classes need no attendance, so they get no reminder.
    const unmarked = list.filter((r) => !r.experiential && !(Array.isArray(r.attendance) ? r.attendance.length : r.attendance))
    const first = list[0]
    const ids = list.map((r) => r.id)
    if (unmarked.length) {
      const startStr = hhmm([...list].sort((a, b) => a.start_time.localeCompare(b.start_time))[0].start_time)
      const endStr = hhmm([...list].sort((a, b) => b.end_time.localeCompare(a.end_time))[0].end_time)
      const subject = (Array.isArray(first.subjects) ? first.subjects[0]?.name : first.subjects?.name) || 'Class'
      await sendTo(first.user_id, {
        title: `${subject} at ${startStr}`,
        body: `${startStr}–${endStr}${first.room ? ` · ${first.room}` : ''}. Tap Present or Absent.`,
        subject, sessionIds: unmarked.map((r) => r.id), tag: `class-${first.google_event_id || first.id}`,
      })
      reminded++
    }
    await admin.from('sessions').update({ reminder_sent_at: new Date().toISOString() }).in('id', ids)
  }
  return json({ ok: true, reminded })
})
