import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  getInstructorAccount,
  signInInstructor,
  signOutInstructor,
  subscribeToInstructorAccount,
} from '../instructorAccount'
import {
  deleteEdusimAction,
  listEdusimActions,
  saveEdusimAction,
  type EdusimActionDefinition,
  type EdusimActionDraft,
  type EdusimActionKind,
  type EdusimActionSetting,
  type EdusimShortPressAction,
} from '../edumon/actionLibrary'
import './actionEditor.css'

const emptyDraft = (): EdusimActionDraft => ({
  id: '',
  kind: 'drug',
  name: '',
  short_press_action: 'momentary',
  long_press_action: null,
  duration_seconds: 0,
  description: '',
  setting: 'ana',
  sort_order: 0,
})

function toDraft(action: EdusimActionDefinition): EdusimActionDraft {
  return {
    id: action.id,
    kind: action.kind,
    name: action.name,
    short_press_action: action.short_press_action,
    long_press_action: action.long_press_action,
    duration_seconds: action.duration_seconds,
    description: action.description,
    setting: action.setting,
    sort_order: action.sort_order,
  }
}

export function ActionEditorApp() {
  const [account, setAccount] = useState<User | null>(null)
  const [actions, setActions] = useState<EdusimActionDefinition[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<EdusimActionDraft>(emptyDraft)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selected = useMemo(() => actions.find((action) => action.id === selectedId) ?? null, [actions, selectedId])

  const refresh = async (preferredId?: string) => {
    const rows = await listEdusimActions()
    setActions(rows)
    const id = preferredId ?? selectedId ?? rows[0]?.id ?? null
    setSelectedId(id)
    const row = rows.find((action) => action.id === id)
    setDraft(row ? toDraft(row) : emptyDraft())
  }

  useEffect(() => {
    let active = true
    void getInstructorAccount()
      .then(async (user) => {
        if (!active) return
        setAccount(user)
        if (user) await refresh()
      })
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : 'Unable to open the action library.'))
      .finally(() => active && setLoading(false))

    const unsubscribe = subscribeToInstructorAccount((user) => {
      if (!active) return
      setAccount(user)
      if (user) void refresh()
      else {
        setActions([])
        setSelectedId(null)
        setDraft(emptyDraft())
      }
    })
    return () => { active = false; unsubscribe() }
  }, [])

  useEffect(() => {
    if (selected) setDraft(toDraft(selected))
  }, [selected])

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true); setError(null); setMessage(null)
    try {
      const user = await signInInstructor(email, password)
      setAccount(user)
      setPassword('')
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in.')
    } finally { setBusy(false) }
  }

  const signOut = async () => {
    setBusy(true)
    try {
      await signOutInstructor()
      setAccount(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign out.')
    } finally { setBusy(false) }
  }

  const beginNew = (kind: EdusimActionKind = 'drug') => {
    setSelectedId(null)
    setDraft({ ...emptyDraft(), kind, sort_order: actions.filter((action) => action.kind === kind).length * 10 + 10 })
    setMessage(null); setError(null)
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    const id = draft.id.trim().toLowerCase()
    if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      setError('ID must use lowercase letters, numbers and hyphens only.')
      return
    }
    if (!draft.name.trim()) { setError('Name is required.'); return }
    setBusy(true); setError(null); setMessage(null)
    try {
      const row = await saveEdusimAction({ ...draft, id })
      await refresh(row.id)
      setMessage(`Saved “${row.name}”.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save action.')
    } finally { setBusy(false) }
  }

  const remove = async () => {
    if (!selected) return
    if (!window.confirm(`Delete “${selected.name}” from the shared action library?`)) return
    setBusy(true); setError(null); setMessage(null)
    try {
      await deleteEdusimAction(selected.id)
      await refresh()
      setMessage(`Deleted “${selected.name}”.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to delete action.')
    } finally { setBusy(false) }
  }

  const close = () => window.location.assign('/edumon/ana')

  return (
    <main className="action-editor-app">
      <header className="action-editor-appbar">
        <div>
          <span>EDUSIM shared authoring</span>
          <h1>Drug & Event Editor</h1>
          <small>Shared action definitions for EDUMON-Ana and EDUMON-ICU</small>
        </div>
        <div className="action-editor-appbar-actions">
          {account && <span>{account.email}</span>}
          {account && <button type="button" onClick={() => void signOut()} disabled={busy}>Sign out</button>}
          <button type="button" className="primary" onClick={close}>Return to EDUMON</button>
        </div>
      </header>

      {loading ? <section className="action-editor-state">Loading action library…</section> : !account ? (
        <section className="action-editor-signin">
          <div><span>Instructor only</span><h2>Sign in to edit actions</h2><p>The action library is shared between permanent instructor accounts.</p></div>
          <form onSubmit={signIn}>
            <label><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
            <label><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
            <button type="submit" className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
          {error && <div className="action-editor-error">{error}</div>}
        </section>
      ) : (
        <section className="action-editor-workspace">
          <aside className="action-editor-list">
            <div className="action-editor-list-actions">
              <button type="button" onClick={() => beginNew('drug')}>+ Drug</button>
              <button type="button" onClick={() => beginNew('event')}>+ Event</button>
            </div>
            {(['drug', 'event'] as const).map((kind) => (
              <div key={kind} className="action-editor-group">
                <h2>{kind === 'drug' ? 'Drugs' : 'Events'}</h2>
                {actions.filter((action) => action.kind === kind).map((action) => (
                  <button key={action.id} type="button" className={selectedId === action.id ? 'selected' : ''} onClick={() => setSelectedId(action.id)}>
                    <strong>{action.name}</strong><small>{action.id} · {action.short_press_action} · {action.setting.toUpperCase()}</small>
                  </button>
                ))}
              </div>
            ))}
          </aside>

          <form className="action-editor-form" onSubmit={save}>
            <div className="action-editor-heading">
              <div><span>{selected ? 'Edit definition' : 'New definition'}</span><h2>{draft.name || 'Untitled action'}</h2></div>
              {selected && <button type="button" className="danger" onClick={() => void remove()} disabled={busy}>Delete</button>}
            </div>

            <div className="action-editor-grid">
              <label><span>ID</span><input value={draft.id} disabled={Boolean(selected)} onChange={(event) => setDraft({ ...draft, id: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} placeholder="e.g. propofol" required /></label>
              <label><span>Name</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label>
              <label><span>Type</span><select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as EdusimActionKind })}><option value="drug">Drug</option><option value="event">Event</option></select></label>
              <label><span>Setting</span><select value={draft.setting} onChange={(event) => setDraft({ ...draft, setting: event.target.value as EdusimActionSetting })}><option value="ana">Ana</option><option value="itu">ITU</option><option value="all">All</option></select></label>
              <label><span>Short press</span><select value={draft.short_press_action} onChange={(event) => setDraft({ ...draft, short_press_action: event.target.value as EdusimShortPressAction })}><option value="momentary">Momentary</option><option value="toggle">Toggle</option></select></label>
              <label><span>Long press</span><input value="Not configured yet" disabled /></label>
              <label><span>Duration of action</span><div className="action-editor-number"><input type="number" min="0" step="0.1" value={draft.duration_seconds} onChange={(event) => setDraft({ ...draft, duration_seconds: Math.max(0, Number(event.target.value) || 0) })} /><small>seconds</small></div></label>
              <label><span>Order</span><input type="number" step="1" value={draft.sort_order} onChange={(event) => setDraft({ ...draft, sort_order: Number(event.target.value) || 0 })} /></label>
            </div>

            <label className="action-editor-description"><span>Description</span><textarea rows={5} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Instructor-facing description of the action and intended physiological effect." /></label>

            <div className="action-editor-footer">
              <button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save action'}</button>
              {message && <span className="action-editor-message">{message}</span>}
              {error && <span className="action-editor-error">{error}</span>}
            </div>
          </form>
        </section>
      )}
    </main>
  )
}

export default ActionEditorApp
