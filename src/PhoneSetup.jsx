import { useEffect, useState } from 'react'
import {
  VAPID_PUBLIC_KEY, canPromptInstall, disablePush, enablePush, getPushState,
  isInstalled, promptInstall, pushSupported,
} from './pwa.js'

// Install button, plus one small switch for class reminders.
export default function PhoneSetup({ userId }) {
  const [push, setPush] = useState('loading')
  const [canInstall, setCanInstall] = useState(canPromptInstall())
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const installed = isInstalled()

  useEffect(() => {
    getPushState().then(setPush)
    const h = () => setCanInstall(canPromptInstall())
    window.addEventListener('cap-install-ready', h)
    return () => window.removeEventListener('cap-install-ready', h)
  }, [])

  const run = async (fn, ok) => {
    setBusy(true); setMsg('')
    try { await fn(); if (ok) setMsg(ok) } catch (e) { setMsg(e?.message || 'Something went wrong. Try again.') }
    setBusy(false)
    setPush(await getPushState())
  }

  return (
    <section className="panel">
      <p className="eyebrow">App</p>
      <h2>Install</h2>
      {installed ? <p className="muted">✓ Installed. You are using the app version.</p> : canInstall ? (
        <div className="row"><button className="cta" disabled={busy} onClick={() => run(promptInstall)}>Install app</button></div>
      ) : (
        <p className="muted">Open this page in Chrome, tap the ⋮ menu, then <strong>Install app</strong> (or <strong>Add to Home screen</strong>).</p>
      )}
      {pushSupported() && VAPID_PUBLIC_KEY && push !== 'blocked' && (
        <div className="row spread" style={{ marginTop: 14, alignItems: 'center' }}>
          <span className="muted">Class reminders {push === 'on' ? 'are on' : 'are off'}</span>
          {push === 'on'
            ? <button className="secondary small" disabled={busy} onClick={() => run(disablePush, 'Reminders turned off.')}>Turn off</button>
            : <button className="small" disabled={busy || push === 'loading'} onClick={() => run(() => enablePush(userId), 'Reminders are on.')}>Turn on</button>}
        </div>
      )}
      {push === 'blocked' && <p className="error">Notifications are blocked. Phone Settings → Apps → this app → Notifications → Allow.</p>}
      {msg && <p className="notice phonemsg">{msg}</p>}
    </section>
  )
}
