// Service worker: offline reading + class reminder notifications.
const SHELL = 'cap-shell-v1'
const DATA = 'cap-data-v1' // saved copies of your timetable and attendance (cleared on sign-out)

const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))])

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL)
    const urls = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png']
    try {
      const html = await (await fetch('/index.html', { cache: 'reload' })).text()
      for (const m of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) urls.push(m[1])
    } catch { /* offline install: skip */ }
    await Promise.all(urls.map((u) => cache.add(u).catch(() => {})))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [SHELL, DATA]
    for (const k of await caches.keys()) if (!keep.includes(k)) await caches.delete(k)
    await self.clients.claim()
  })())
})

async function networkFirst(req, cacheName, timeoutMs, keyReq) {
  const cache = await caches.open(cacheName)
  const key = keyReq || req
  try {
    const res = await withTimeout(fetch(req), timeoutMs)
    try {
      if (res.status === 200) await cache.put(key, res.clone())
      else if (res.status === 206) {
        // The Cache API refuses partial responses, so store a normal copy.
        await cache.put(key, new Response(await res.clone().blob(), { status: 200, headers: res.headers }))
      }
    } catch { /* ignore cache errors */ }
    return res
  } catch (err) {
    const hit = await cache.match(key, { ignoreVary: true })
    if (hit) return hit
    throw err
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Your data (Supabase REST reads): fresh when online, last saved copy when offline.
  if (url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/rest/v1/')) {
    const range = req.headers.get('Range')
    const keyReq = range ? new Request(`${req.url}${url.search ? '&' : '?'}_r=${encodeURIComponent(range)}`) : req
    event.respondWith(networkFirst(req, DATA, 8000, keyReq))
    return
  }
  if (url.origin !== self.location.origin) return

  // App pages
  if (req.mode === 'navigate') {
    event.respondWith(
      networkFirst(req, SHELL, 4000).catch(async () =>
        (await caches.match('/index.html')) || (await caches.match('/')) || Response.error()),
    )
    return
  }
  // Built files with fingerprints never change: serve saved copy first.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL)
      const hit = await cache.match(req)
      if (hit) return hit
      const res = await fetch(req)
      if (res.status === 200) cache.put(req, res.clone())
      return res
    })())
    return
  }
  // Icons, manifest and other small files
  event.respondWith(networkFirst(req, SHELL, 4000))
})

// ---- Notifications ----
self.addEventListener('push', (event) => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { /* ignore */ }
  const isClass = Array.isArray(d.sessionIds) && d.sessionIds.length > 0
  event.waitUntil(self.registration.showNotification(d.title || 'College Attendance Planner', {
    body: d.body || '',
    tag: d.tag || 'cap',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    data: d,
    requireInteraction: isClass,
    actions: isClass ? [{ action: 'present', title: 'Present' }, { action: 'absent', title: 'Absent' }] : [],
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const d = event.notification.data || {}
  const status = event.action === 'present' || event.action === 'absent' ? event.action : null
  const ids = Array.isArray(d.sessionIds) ? d.sessionIds : []
  const label = d.subject || ''
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    if (wins.length) {
      const w = wins[0]
      if (status && ids.length) w.postMessage({ type: 'mark', ids, status, label })
      return w.focus()
    }
    const q = status && ids.length
      ? `/?mark=${ids.join(',')}&status=${status}&label=${encodeURIComponent(label)}` : '/'
    return self.clients.openWindow(q)
  })())
})
