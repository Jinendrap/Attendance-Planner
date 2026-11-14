import { useState } from 'react'
import { supabase } from './supabaseClient.js'

// Settings: permanently delete the account and every piece of data in it.
export default function DeleteAccount({ onDeleted }) {
  const [open, setOpen] = useState(false)
  const [word, setWord] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const remove = async () => {
    if (word.trim().toUpperCase() !== 'DELETE') { setMsg('Type DELETE to confirm.'); return }
    setBusy(true); setMsg('')
    const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' })
    if (error) {
      setBusy(false)
      setMsg('Could not delete your account. Check your internet and try again. If it keeps failing, the delete-account function may not be set up yet (see the README).')
      return
    }
    await onDeleted()
  }

  return (
    <section className="panel">
      <p className="eyebrow">Danger zone</p>
      <h2>Delete my account</h2>
      <p className="muted">This permanently removes your account and everything in it: timetable, attendance, holidays, leave plans, remarks and tasks. It cannot be undone. Export your data first if you want a copy.</p>
      {!open ? (
        <div className="row"><button className="secondary danger" onClick={() => setOpen(true)}>Delete my account…</button></div>
      ) : (
        <>
          <div className="formgrid"><label>Type DELETE to confirm<input type="text" value={word} onChange={(e) => { setWord(e.target.value); setMsg('') }} autoComplete="off" autoCapitalize="characters" /></label></div>
          {msg && <p className="error">{msg}</p>}
          <div className="row">
            <button className="secondary danger" disabled={busy || word.trim().toUpperCase() !== 'DELETE'} onClick={remove}>{busy ? 'Deleting…' : 'Delete everything'}</button>
            <button className="secondary" disabled={busy} onClick={() => { setOpen(false); setWord(''); setMsg('') }}>Cancel</button>
          </div>
        </>
      )}
    </section>
  )
}
