import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { SessionRole } from '../session/useTeachingSession'
import {
  createInstructorAccount,
  createInstructorPreset,
  deleteInstructorPreset,
  getInstructorAccount,
  listInstructorPresets,
  signInInstructor,
  signOutInstructor,
  subscribeToInstructorAccount,
  type InstructorPresetRow,
  type InstructorScenarioSnapshot,
} from '../instructorAccount'
import '../account.css'

interface InstructorAccountControlsProps {
  role: SessionRole
  currentScenario: InstructorScenarioSnapshot
  onLoadScenario: (scenario: InstructorScenarioSnapshot) => void
}

function CloudIcon({ connected }: { connected: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.2 18.2h10.1a4 4 0 0 0 .7-7.9A6.2 6.2 0 0 0 6.2 8.6a4.9 4.9 0 0 0 1 9.6Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      {connected && <path d="m9.2 13.2 1.8 1.8 3.9-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14M5 12h14M5 17h14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  )
}

function CloseIcon() {
  return <span aria-hidden="true">×</span>
}

function accountLabel(user: User | null) {
  return user?.email ?? 'Instructor cloud account'
}

export function InstructorAccountControls({ role, currentScenario, onLoadScenario }: InstructorAccountControlsProps) {
  const [account, setAccount] = useState<User | null>(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [presets, setPresets] = useState<InstructorPresetRow[]>([])
  const [presetName, setPresetName] = useState('')
  const [presetBusy, setPresetBusy] = useState(false)
  const [presetMessage, setPresetMessage] = useState<string | null>(null)

  const refreshPresets = async (nextAccount: User | null = account) => {
    if (!nextAccount) {
      setPresets([])
      return
    }
    try {
      setPresets(await listInstructorPresets())
    } catch (cause) {
      setPresetMessage(cause instanceof Error ? cause.message : 'Unable to load instructor scenarios.')
    }
  }

  useEffect(() => {
    let active = true
    void getInstructorAccount()
      .then((user) => {
        if (!active) return
        setAccount(user)
        if (user) void refreshPresets(user)
      })
      .catch(() => undefined)

    const unsubscribe = subscribeToInstructorAccount((user) => {
      if (!active) return
      setAccount(user)
      setMessage(null)
      setError(null)
      if (user) void refreshPresets(user)
      else setPresets([])
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const accountChangeLocked = role !== 'standalone'

  const submitAuth = async (event: React.FormEvent) => {
    event.preventDefault()
    if (accountChangeLocked) {
      setError('End or leave the teaching session before changing instructor account.')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      if (authMode === 'signin') {
        const user = await signInInstructor(email, password)
        setAccount(user)
        setMessage('Instructor account connected.')
        setPassword('')
        await refreshPresets(user)
      } else {
        const created = await createInstructorAccount(email, password)
        setPassword('')
        if (created.confirmationRequired) {
          setMessage('Account created. Check your email to confirm the address, then return to EDUVENT and sign in.')
        } else if (created.user) {
          setAccount(created.user)
          setMessage('Instructor account created and connected.')
          await refreshPresets(created.user)
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to complete account request.')
    } finally {
      setBusy(false)
    }
  }

  const logout = async () => {
    if (accountChangeLocked) {
      setError('End or leave the teaching session before signing out.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await signOutInstructor()
      setAccount(null)
      setPresets([])
      setMessage('Instructor cloud account disconnected.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign out.')
    } finally {
      setBusy(false)
    }
  }

  const saveScenario = async () => {
    if (!account) {
      setPresetMessage('Connect an instructor cloud account first.')
      return
    }
    setPresetBusy(true)
    setPresetMessage(null)
    try {
      const created = await createInstructorPreset(presetName, currentScenario)
      setPresetName('')
      setPresetMessage(`Saved “${created.name}”.`)
      await refreshPresets(account)
    } catch (cause) {
      setPresetMessage(cause instanceof Error ? cause.message : 'Unable to save scenario.')
    } finally {
      setPresetBusy(false)
    }
  }

  const loadScenario = (preset: InstructorPresetRow) => {
    onLoadScenario(preset.scenario)
    setPresetMessage(`Loaded “${preset.name}”.`)
  }

  const removeScenario = async (preset: InstructorPresetRow) => {
    if (!account || !window.confirm(`Delete scenario “${preset.name}”?`)) return
    setPresetBusy(true)
    setPresetMessage(null)
    try {
      await deleteInstructorPreset(preset.id)
      setPresetMessage(`Deleted “${preset.name}”.`)
      await refreshPresets(account)
    } catch (cause) {
      setPresetMessage(cause instanceof Error ? cause.message : 'Unable to delete scenario.')
    } finally {
      setPresetBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={`top-account-button ${account ? 'connected' : ''}`}
        title={accountLabel(account)}
        aria-label={account ? `Instructor cloud account connected as ${account.email}` : 'Instructor cloud account sign in'}
        onClick={() => { setAccountOpen(true); setMessage(null); setError(null) }}
      >
        <CloudIcon connected={Boolean(account)} />
      </button>
      <button
        type="button"
        className="top-account-button"
        title="EDUVENT settings"
        aria-label="Open EDUVENT settings"
        onClick={() => { setSettingsOpen(true); setPresetMessage(null); if (account) void refreshPresets(account) }}
      >
        <MenuIcon />
      </button>

      {accountOpen && (
        <div className="account-dialog-backdrop" onMouseDown={() => setAccountOpen(false)}>
          <section className="account-dialog" role="dialog" aria-modal="true" aria-label="Instructor cloud account" onMouseDown={(event) => event.stopPropagation()}>
            <div className="account-dialog-heading">
              <div><span>Cloud</span><h2>Instructor account</h2></div>
              <button type="button" className="account-close-button" onClick={() => setAccountOpen(false)} aria-label="Close account dialog"><CloseIcon /></button>
            </div>

            {account ? (
              <div className="account-connected-card">
                <span>Connected instructor</span>
                <strong>{account.email}</strong>
                <small>Cloud scenarios are private to this account.</small>
                <button type="button" className="account-secondary-button" disabled={busy || accountChangeLocked} onClick={() => void logout()}>Sign out</button>
                {accountChangeLocked && <p>Finish the current teaching session before changing accounts.</p>}
              </div>
            ) : (
              <>
                <div className="account-auth-tabs" role="tablist" aria-label="Instructor account action">
                  <button type="button" className={authMode === 'signin' ? 'selected' : ''} onClick={() => { setAuthMode('signin'); setError(null); setMessage(null) }}>Sign in</button>
                  <button type="button" className={authMode === 'signup' ? 'selected' : ''} onClick={() => { setAuthMode('signup'); setError(null); setMessage(null) }}>Create account</button>
                </div>
                <form className="account-auth-form" onSubmit={submitAuth}>
                  <label><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
                  <label><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} minLength={8} required /></label>
                  <button type="submit" className="account-primary-button" disabled={busy || accountChangeLocked}>{busy ? 'Please wait…' : authMode === 'signin' ? 'Sign in' : 'Create instructor account'}</button>
                </form>
                {accountChangeLocked && <p className="account-hint">Finish the current teaching session before changing accounts.</p>}
              </>
            )}
            {message && <div className="account-message">{message}</div>}
            {error && <div className="account-error" role="alert">{error}</div>}
          </section>
        </div>
      )}

      {settingsOpen && (
        <div className="account-dialog-backdrop" onMouseDown={() => setSettingsOpen(false)}>
          <section className="account-dialog settings-dialog" role="dialog" aria-modal="true" aria-label="EDUVENT settings" onMouseDown={(event) => event.stopPropagation()}>
            <div className="account-dialog-heading">
              <div><span>EDUVENT</span><h2>Settings</h2></div>
              <button type="button" className="account-close-button" onClick={() => setSettingsOpen(false)} aria-label="Close settings"><CloseIcon /></button>
            </div>

            <div className="settings-summary-grid">
              <div><span>Version</span><strong>v0.55</strong></div>
              <div><span>Teaching room</span><strong>2-hour lifetime</strong></div>
              <div><span>Cloud</span><strong>{account ? 'Connected' : 'Not signed in'}</strong></div>
            </div>

            <section className="scenario-settings-section">
              <div className="scenario-settings-heading">
                <div><span>Instructor presets</span><h3>Cloud scenarios</h3></div>
                {account && <small>{account.email}</small>}
              </div>
              <p>Save the current patient, ventilator, alarm, transition and waveform setup as an instructor scenario.</p>

              {account ? (
                <>
                  <div className="scenario-save-row">
                    <input value={presetName} onChange={(event) => setPresetName(event.target.value)} maxLength={80} placeholder="e.g. Flow starvation" aria-label="Scenario name" />
                    <button type="button" className="account-primary-button" disabled={presetBusy || !presetName.trim()} onClick={() => void saveScenario()}>Save current</button>
                  </div>

                  <div className="scenario-list">
                    {presets.length ? presets.map((preset) => (
                      <article className="scenario-row" key={preset.id}>
                        <div>
                          <strong>{preset.name}</strong>
                          <small>Updated {new Date(preset.updated_at).toLocaleString()}</small>
                        </div>
                        <div className="scenario-row-actions">
                          <button type="button" disabled={presetBusy} onClick={() => loadScenario(preset)}>Load</button>
                          <button type="button" className="scenario-delete-button" disabled={presetBusy} onClick={() => void removeScenario(preset)}>Delete</button>
                        </div>
                      </article>
                    )) : <div className="scenario-empty">No cloud scenarios saved yet.</div>}
                  </div>
                </>
              ) : (
                <button type="button" className="account-secondary-button" onClick={() => { setSettingsOpen(false); setAccountOpen(true) }}>Sign in to use cloud scenarios</button>
              )}
              {presetMessage && <div className="account-message">{presetMessage}</div>}
            </section>
          </section>
        </div>
      )}
    </>
  )
}
