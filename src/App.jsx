import { useCallback, useEffect, useState } from 'react'
import { supabase, isConfigured } from './supabaseClient.js'
import { SEMESTER, CALENDAR_NAME } from './config.js'
import ImportScreen from './ImportScreen.jsx'
import CalendarView from './CalendarView.jsx'
import PendingView from './PendingView.jsx'
import Dashboard from './Dashboard.jsx'
import LeavePlanner from './LeavePlanner.jsx'
import Settings from './Settings.jsx'
import IdIntro from './IdIntro.jsx'
import ProfilePanel from './ProfilePanel.jsx'
import { Logo } from './Logo.jsx'
import useBackClose from './useBack.js'
import Overview from './Overview.jsx'
import Tasks from './Tasks.jsx'
import GettingStarted from './GettingStarted.jsx'
import { clearOfflineData, onSwMessage, syncPush } from './pwa.js'
import { nowIST } from './dateUtils.js'
import { attOf } from './calendarLogic.js'
import { BottomNav, FidgetButton, LiveClock, NavMenu, Roll, ThemeToggle, useTheme } from './Shell.jsx'
import { fetchPending, flushQueue, markSessions, withQueue } from './attendance.js'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [semester, setSemester] = useState(null)
  const [view, setView] = useState('overview')
  const [homeKey, setHomeKey] = useState(0)
  const [pending, setPending] = useState([])
  const [notice, setNotice] = useState('')
  const [marksVersion, setMarksVersion] = useState(0)
  const [online, setOnline] = useState(navigator.onLine)
  const [markJob, setMarkJob] = useState(null) // a Present/Absent tap from a notification
  const [menuOpen, setMenuOpen] = useState(false)
  const [fidget, setFidget] = useState(false)
  const [firstDefaults, setFirstDefaults] = useState(null)
  const [hasSubjects, setHasSubjects] = useState(null) // null = not known yet
  const [profile, setProfile] = useState(undefined) // undefined = loading, null = first sign-in, object = ready
  const [theme, toggleTheme] = useTheme()
  const [intro, setIntro] = useState(() => { try { return !sessionStorage.getItem('cap_intro') } catch { return true } })
  useBackClose(menuOpen, () => setMenuOpen(false))
  useBackClose(fidget, () => setFidget(false))
  const userId = session?.user?.id

  useEffect(() => {
    if (!isConfigured) { setLoading(false); return }
    const params = new URLSearchParams(window.location.hash.replace('#', '?'))
    const query = new URLSearchParams(window.location.search)
    if (query.get('error_description') || params.get('error_description')) {
      setError('Sign-in was not allowed for this Google account.')
    }
    window.history.replaceState({ view: 'overview' }, '')
    try {
      if (localStorage.getItem('cap_next') === 'import') {
        window.history.pushState({ view: 'import' }, '')
        setView('import')
        localStorage.removeItem('cap_next')
      }
    } catch { /* ignore */ }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => listener.subscription.unsubscribe()
  }, [])

  // Online / offline banner.
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // Enter saves: in a text box, press Enter to use the main button of the same form (Ctrl+Enter in a multi-line note).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Enter' || e.isComposing || e.defaultPrevented) return
      const t = e.target
      if (!t || !t.tagName) return
      if (t.tagName === 'TEXTAREA') { if (!(e.ctrlKey || e.metaKey)) return } else if (t.tagName !== 'INPUT' || ['checkbox', 'radio', 'button', 'submit', 'file', 'color'].includes(t.type)) return
      const SKIP = '.secondary,.link,.danger,.iconbtn,.ghost,.present,.absent,.choice,.dchip,.seg button,.tabs button,.bnav button,.dlink'
      let a = t.parentElement
      while (a && a !== document.body) {
        const container = a.matches('.row,.editform,.modal,.reason,.attpanel,.remarks') || (a.matches('.panel,.card') && a.hasAttribute('data-enter'))
        if (container) {
          const btn = [...a.querySelectorAll('button')].find((b) => !b.disabled && !b.matches(SKIP))
          if (btn) { e.preventDefault(); btn.click(); return }
        }
        if (a.matches('.panel,.card,.modal')) return
        a = a.parentElement
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Back / forward buttons move between screens instead of leaving the app.
  useEffect(() => {
    const onPop = (e) => { const v = e.state && e.state.view; if (v) setView(v) }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Present/Absent tapped in a notification: arrives as a link (app was closed) or a message (app was open).
  useEffect(() => {
    const isId = (x) => /^[0-9a-f-]{36}$/i.test(x)
    const q = new URLSearchParams(window.location.search)
    const ids = (q.get('mark') || '').split(',').filter(isId)
    const status = q.get('status')
    if (ids.length && (status === 'present' || status === 'absent')) {
      setMarkJob({ ids, status, label: q.get('label') || '' })
      window.history.replaceState({}, '', window.location.pathname)
    }
    return onSwMessage((m) => {
      if (m.type === 'mark' && Array.isArray(m.ids) && m.ids.every(isId) && (m.status === 'present' || m.status === 'absent')) {
        setMarkJob({ ids: m.ids, status: m.status, label: m.label || '' })
      }
    })
  }, [])

  useEffect(() => { if (userId) syncPush(userId) }, [userId])

  // Load this user's profile (name, college, semester, ID photo).
  useEffect(() => {
    if (!userId) { setProfile(undefined); return }
    let cancelled = false
    ;(async () => {
      const defaults = { semester_name: SEMESTER.name, semester_start: SEMESTER.start, semester_end: SEMESTER.end, calendar_name: CALENDAR_NAME, missing: true }
      const r = await supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle()
      if (cancelled) return
      if (r.error) {
        let cached = null
        try { cached = JSON.parse(localStorage.getItem('cap_profile') || 'null') } catch { /* ignore */ }
        setProfile(cached && cached.user_id === userId ? cached : defaults) // table missing or offline: use this user's saved copy only
      } else {
        if (r.data) { try { localStorage.setItem('cap_profile', JSON.stringify(r.data)) } catch { /* ignore */ } }
        if (r.data) setProfile(r.data)
        else {
          // First sign-in. If a semester already exists (your earlier data), offer its details as the answers.
          const sem = await supabase.from('semesters').select('name, start_date, end_date').order('created_at', { ascending: false }).limit(1).maybeSingle()
          if (cancelled) return
          setFirstDefaults(sem.data ? { semester_name: sem.data.name, semester_start: sem.data.start_date, semester_end: sem.data.end_date, calendar_name: CALENDAR_NAME } : null)
          setProfile(null)
        }
      }
    })()
    return () => { cancelled = true }
  }, [userId])

  const semName = profile ? profile.semester_name || SEMESTER.name : null
  const semStart = profile ? profile.semester_start || SEMESTER.start : null
  const semEnd = profile ? profile.semester_end || SEMESTER.end : null

  useEffect(() => {
    if (!userId || !semName) { setSemester(null); return }
    let cancelled = false
    ;(async () => {
      let res = await supabase.from('semesters').select('*').eq('name', semName).maybeSingle()
      if (!res.error && !res.data) {
        res = await supabase.from('semesters')
          .insert({ user_id: userId, name: semName, start_date: semStart, end_date: semEnd })
          .select().single()
      } else if (!res.error && res.data && (res.data.start_date !== semStart || res.data.end_date !== semEnd)) {
        const up = await supabase.from('semesters').update({ start_date: semStart, end_date: semEnd }).eq('id', res.data.id).select().single()
        if (!up.error) res = up
      }
      if (cancelled) return
      if (res.error) setError('The database tables are missing. Run the Phase 2 SQL in Supabase, then refresh.')
      else setSemester(res.data)
    })()
    return () => { cancelled = true }
  }, [userId, semName, semStart, semEnd])

  // Does this person have any subjects yet? If not, show a short "getting started" card.
  useEffect(() => {
    if (!semester) { setHasSubjects(null); return }
    let cancelled = false
    supabase.from('subjects').select('id', { count: 'exact', head: true }).eq('semester_id', semester.id)
      .then(({ count, error: e }) => { if (!cancelled && !e) setHasSubjects((count || 0) > 0) })
    return () => { cancelled = true }
  }, [semester, homeKey, view])

  const refreshPending = useCallback(async () => {
    if (!semester) return
    try {
      setPending(await fetchPending(semester.id, nowIST()))
    } catch {
      setPending((p) => withQueue(p).filter((r) => !attOf(r)))
    }
  }, [semester])

  // Send any marks saved while offline, then refresh the pending list every minute.
  useEffect(() => {
    if (!semester || !userId) return
    const sync = async () => {
      const sent = await flushQueue(userId)
      if (sent) { setNotice(''); setHomeKey((k) => k + 1); setMarksVersion((v) => v + 1) }
      refreshPending()
    }
    sync()
    window.addEventListener('online', sync)
    const t = setInterval(sync, 60000)
    return () => { window.removeEventListener('online', sync); clearInterval(t) }
  }, [semester, userId, refreshPending])

  const handleMark = async (marks) => {
    const r = await markSessions(userId, marks)
    setNotice(r.queued ? 'No internet: saved on this phone and will sync automatically.' : '')
    await refreshPending()
    setMarksVersion((v) => v + 1)
    return r
  }

  useEffect(() => {
    if (!markJob || !userId || !semester) return
    const job = markJob
    setMarkJob(null)
    ;(async () => {
      try {
        const r = await markSessions(userId, job.ids.map((id) => ({ sessionId: id, status: job.status, reason: null })))
        setNotice(r.queued
          ? 'No internet: saved on this phone and will sync automatically.'
          : `${job.label || 'Class'} marked ${job.status === 'present' ? 'Present' : 'Absent'}.`)
        if (!r.queued) setTimeout(() => setNotice(''), 6000)
        await refreshPending()
        setMarksVersion((v) => v + 1)
        setHomeKey((k) => k + 1)
      } catch {
        setNotice('Could not save that mark. Open the Pending tab and mark it there.')
      }
    })()
  }, [markJob, userId, semester, refreshPending])

  const signIn = () =>
    supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
  const signOut = async () => { await clearOfflineData(); try { localStorage.removeItem('cap_profile') } catch { /* ignore */ } supabase.auth.signOut() }

  // After the account is deleted: clear this phone, then leave without calling the server (the account is gone).
  const afterDelete = async () => {
    try { // stop this phone's reminders (the saved subscription went with the account)
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = reg ? await reg.pushManager.getSubscription() : null
      if (sub) await sub.unsubscribe()
    } catch { /* ignore */ }
    await clearOfflineData()
    try { localStorage.removeItem('cap_profile') } catch { /* ignore */ }
    await supabase.auth.signOut({ scope: 'local' })
  }

  const pendingCount = new Set(pending.map((r) => r.google_event_id || r.id)).size
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'attendance', label: 'Attendance' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'leave', label: 'Leave & holidays' },
    { id: 'pending', label: 'Pending', badge: pendingCount || '' },
    { id: 'settings', label: 'Settings' },
  ]
  // Go to a screen and remember it in the browser history, so Back returns here.
  const go = (v) => {
    setMenuOpen(false)
    const st = window.history.state
    if (!(st && st.view === v)) {
      if (st && st.layer) window.history.replaceState({ view: v }, '')
      else window.history.pushState({ view: v }, '')
    }
    setView(v)
    window.scrollTo(0, 0)
  }
  const endIntro = () => { try { sessionStorage.setItem('cap_intro', '1') } catch { /* ignore */ } setIntro(false) }

  if (!isConfigured) {
    return (
      <div className="center"><main className="card">
        <h1>Setup needed</h1>
        <p>The app cannot find its Supabase settings. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel, then redeploy.</p>
      </main></div>
    )
  }
  if (loading) return <div className="center"><main className="card"><p>Loading…</p></main></div>

  if (!session) {
    return (
      <div className="center"><main className="card">
        <Logo size={56} />
        <h1>College Attendance Planner</h1>
        <p>Sign in to see your timetable and attendance.</p>
        {error && <p className="error">{error}</p>}
        <button onClick={signIn}>Sign in with Google</button>
      </main></div>
    )
  }

  if (profile === undefined) return <div className="center"><p className="muted">Loading…</p></div>
  if (profile === null) {
    return (
      <div className="page">
        <ProfilePanel first userId={userId} defaults={firstDefaults || { semester_name: '', semester_start: '', semester_end: '', calendar_name: '' }} onSaved={(row) => { try { localStorage.setItem('cap_profile', JSON.stringify(row)) } catch { /* ignore */ } setProfile(row) }} />
      </div>
    )
  }

  return (
    <div className={`page ${semester && view !== 'import' ? 'has-bnav' : ''}`}>
      <header className="topbar">
        <Logo size={32} />
        <strong className="brand"><span className="brand-long">College Attendance Planner</span><span className="brand-short">Attendance</span></strong>
        <LiveClock />
        <FidgetButton onClick={() => setFidget(true)} />
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </header>
      {error && <p className="error">{error}</p>}
      {!online && <p className="notice">You are offline. Showing your last saved data. Marks are saved on this phone and sync when you are back online.</p>}
      {!semester ? (
        !error && <section className="panel"><p>Loading…</p></section>
      ) : view === 'import' ? (
        <ImportScreen
          session={session}
          semester={semester}
          calendarName={profile.calendar_name}
          onCancel={() => go('settings')}
          onDone={() => { setHomeKey(homeKey + 1); go('calendar') }}
        />
      ) : (
        <>
          <nav className="tabs" aria-label="Main">
            {tabs.map((t) => (
              <button key={t.id} className={view === t.id ? 'on' : ''} onClick={() => go(t.id)}>
                <Roll>{t.label}</Roll>{t.badge ? <span className="count">{t.badge}</span> : null}
              </button>
            ))}
          </nav>
          {notice && <p className="notice">{notice}</p>}
          {hasSubjects === false && ['overview', 'calendar', 'attendance'].includes(view) && <GettingStarted onImport={() => go('import')} onManual={() => go('settings')} />}
          {view === 'overview' && <Overview semester={semester} version={marksVersion + homeKey} pendingCount={pendingCount} onGo={go} onMark={handleMark} />}
          {view === 'tasks' && <Tasks semester={semester} version={homeKey} />}
          {view === 'calendar' && <CalendarView key={homeKey} semester={semester} onMark={handleMark} />}
          {view === 'attendance' && <Dashboard semester={semester} version={marksVersion + homeKey} />}
          {view === 'leave' && <LeavePlanner semester={semester} userId={userId} version={marksVersion + homeKey} />}
          {view === 'pending' && <PendingView rows={pending} onMark={handleMark} />}
          {view === 'settings' && <Settings email={session.user.email} userId={userId} semester={semester} profile={profile} onProfile={setProfile} homeKey={homeKey} onSignOut={signOut} onDeleted={afterDelete} onImport={() => go('import')} />}
        </>
      )}
      {semester && view !== 'import' && <BottomNav view={view} onGo={go} onMore={() => setMenuOpen(true)} pendingCount={pendingCount} />}
      {menuOpen && <NavMenu items={tabs} view={view} onGo={go} onClose={() => setMenuOpen(false)} />}
      {intro && <IdIntro profile={profile} onDone={endIntro} />}
      {fidget && !intro && <IdIntro fidget profile={profile} onDone={() => setFidget(false)} />}
    </div>
  )
}
