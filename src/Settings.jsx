import PhoneSetup from './PhoneSetup.jsx'
import Home from './Home.jsx'
import ExportPanel from './ExportPanel.jsx'
import ProfilePanel from './ProfilePanel.jsx'
import DeleteAccount from './DeleteAccount.jsx'

const I = (d) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
)
const ICONS = {
  profile: I(<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></>),
  timetable: I(<><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></>),
  install: I(<><rect x="7" y="2" width="10" height="20" rx="3" /><path d="M11 18h2" /></>),
  export: I(<><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 21h14" /></>),
  account: I(<><rect x="4" y="10" width="16" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>),
}

// Each settings area opens as its own page.
const PAGES = {
  profile: { title: 'Your details', icon: 'profile' },
  timetable: { title: 'Subjects & timetable', icon: 'timetable' },
  install: { title: 'Install app & reminders', icon: 'install' },
  export: { title: 'Export & backup', icon: 'export' },
  account: { title: 'Account', icon: 'account' },
}

// Settings: a list of options. Tapping one opens that option on its own page.
export default function Settings({ email, userId, semester, profile, onProfile, homeKey, onSignOut, onDeleted, onImport, page, onPage }) {
  const current = PAGES[page] ? page : null

  if (current) {
    return (
      <>
        <header className="masthead">
          <button className="secondary small" onClick={() => onPage(null)}>← Settings</button>
          <h1 className="display" style={{ marginTop: 14 }}>{PAGES[current].title}</h1>
        </header>
        {current === 'profile' && <ProfilePanel profile={profile.missing ? null : profile} defaults={profile} userId={userId} onSaved={onProfile} />}
        {current === 'timetable' && <Home key={homeKey} semester={semester} userId={userId} onImport={onImport} />}
        {current === 'install' && <PhoneSetup userId={userId} />}
        {current === 'export' && <ExportPanel semester={semester} />}
        {current === 'account' && (
          <>
            <section className="panel">
              <p className="eyebrow">Signed in as</p>
              <h2 style={{ overflowWrap: 'anywhere' }}>{email}</h2>
              <div className="row"><button className="secondary" onClick={onSignOut}>Sign out</button></div>
            </section>
            <DeleteAccount onDeleted={onDeleted} />
          </>
        )}
      </>
    )
  }

  const who = !profile.missing && profile.full_name ? profile.full_name : 'Name, college and course'
  const rows = [
    { id: 'profile', text: who },
    { id: 'timetable', text: 'Add, edit or import your classes' },
    { id: 'install', text: 'Add to your home screen, class reminders' },
    { id: 'export', text: 'Download your attendance as a file' },
    { id: 'account', text: email },
  ]
  return (
    <>
      <header className="masthead">
        <p className="eyebrow">{semester.name}</p>
        <h1 className="display">Settings</h1>
      </header>
      <div className="setlist">
        {rows.map((r) => (
          <button key={r.id} className="setrow" onClick={() => onPage(r.id)}>
            <span className="ico">{ICONS[PAGES[r.id].icon]}</span>
            <span className="txt"><strong>{PAGES[r.id].title}</strong><span>{r.text}</span></span>
            <span className="chev" aria-hidden="true">›</span>
          </button>
        ))}
      </div>
    </>
  )
}
