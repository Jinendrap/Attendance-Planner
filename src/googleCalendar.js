import { TIMEZONE } from './config.js'

const BASE = 'https://www.googleapis.com/calendar/v3'

async function get(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 401 || res.status === 403) {
    const e = new Error('Google access denied')
    e.code = 'auth'
    throw e
  }
  if (!res.ok) throw new Error(`Google Calendar request failed (${res.status})`)
  return res.json()
}

export async function listCalendars(token) {
  const data = await get(`${BASE}/users/me/calendarList?minAccessRole=reader`, token)
  return (data.items || []).map((c) => ({ id: c.id, name: c.summary || c.id }))
}

// singleEvents=true makes Google expand repeating events into dated classes
// and leave out cancelled ones.
export async function listEvents(token, calendarId, startDate, endDate) {
  const items = []
  let pageToken
  do {
    const p = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '2500',
      timeZone: TIMEZONE,
      timeMin: `${startDate}T00:00:00+05:30`,
      timeMax: `${endDate}T23:59:59+05:30`,
    })
    if (pageToken) p.set('pageToken', pageToken)
    const data = await get(`${BASE}/calendars/${encodeURIComponent(calendarId)}/events?${p}`, token)
    items.push(...(data.items || []))
    pageToken = data.nextPageToken
  } while (pageToken)
  return items
}
