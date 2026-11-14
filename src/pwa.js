import { supabase } from './supabaseClient.js'

export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

// Register the service worker (offline reading + notifications) in the live app only.
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* ignore */ })
  })
}

// Chrome offers the install prompt once; keep it until the Phone setup screen asks for it.
let installEvent = null
export function listenForInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    installEvent = e
    window.dispatchEvent(new Event('cap-install-ready'))
  })
  window.addEventListener('appinstalled', () => {
    installEvent = null
    window.dispatchEvent(new Event('cap-install-ready'))
  })
}
export const canPromptInstall = () => Boolean(installEvent)
export async function promptInstall() {
  if (!installEvent) return false
  installEvent.prompt()
  const choice = await installEvent.userChoice
  installEvent = null
  return choice.outcome === 'accepted'
}
export const isInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true

// Messages from the service worker (a tap on Present/Absent in a notification while the app is open).
export function onSwMessage(cb) {
  if (!('serviceWorker' in navigator)) return () => {}
  const h = (e) => cb(e.data || {})
  navigator.serviceWorker.addEventListener('message', h)
  return () => navigator.serviceWorker.removeEventListener('message', h)
}

// Remove the saved offline copies of your data (used on sign-out).
export async function clearOfflineData() {
  try { await caches.delete('cap-data-v1') } catch { /* ignore */ }
}

// ---- Push notifications ----
export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

function keyToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

async function saveSubscription(userId, sub) {
  const j = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: userId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth,
    user_agent: navigator.userAgent.slice(0, 200),
  }, { onConflict: 'endpoint' })
  if (error) throw error
}

export async function getPushState() {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = reg ? await reg.pushManager.getSubscription() : null
  return Notification.permission === 'granted' && sub ? 'on' : 'off'
}

export async function enablePush(userId) {
  if (!VAPID_PUBLIC_KEY) throw new Error('The notification key is missing in Vercel (VITE_VAPID_PUBLIC_KEY).')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Notification permission was not allowed.')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription())
    || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(VAPID_PUBLIC_KEY) }))
  await saveSubscription(userId, sub)
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = reg ? await reg.pushManager.getSubscription() : null
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

// Quietly keep the saved subscription up to date each time the app opens.
export async function syncPush(userId) {
  try {
    if (!pushSupported() || !VAPID_PUBLIC_KEY || Notification.permission !== 'granted') return
    const reg = await navigator.serviceWorker.ready
    const sub = (await reg.pushManager.getSubscription())
      || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(VAPID_PUBLIC_KEY) }))
    await saveSubscription(userId, sub)
  } catch { /* ignore */ }
}

// Asks the server to send a real test notification to this phone.
export async function sendServerTest() {
  const { data, error } = await supabase.functions.invoke('class-reminders', { body: { test: true } })
  if (error) throw error
  return data?.sent || 0
}
