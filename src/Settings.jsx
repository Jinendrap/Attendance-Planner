import PhoneSetup from './PhoneSetup.jsx'
import Home from './Home.jsx'
import ExportPanel from './ExportPanel.jsx'
import ProfilePanel from './ProfilePanel.jsx'
import DeleteAccount from './DeleteAccount.jsx'

// Everything that is not a daily screen: account, install, subjects and timetable, export.
export default function Settings({ email, userId, semester, profile, onProfile, homeKey, onSignOut, onDeleted, onImport }) {
  return (
    <>
      <header className="masthead">
        <p className="eyebrow">{semester.name}</p>
        <h1 className="display">Settings</h1>
      </header>
      <section className="panel">
        <p className="eyebrow">Account</p>
        <h2 style={{ overflowWrap: 'anywhere' }}>{email}</h2>
        <div className="row"><button className="secondary" onClick={onSignOut}>Sign out</button></div>
      </section>
      <ProfilePanel profile={profile.missing ? null : profile} defaults={profile} userId={userId} onSaved={onProfile} />
      <PhoneSetup userId={userId} />
      <div className="sechead" style={{ marginTop: 8 }}><h3>Subjects &amp; timetable</h3></div>
      <Home key={homeKey} semester={semester} userId={userId} onImport={onImport} />
      <ExportPanel semester={semester} />
      <DeleteAccount onDeleted={onDeleted} />
    </>
  )
}
