import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { SessionRole } from '../session/useTeachingSession'
import {
  asStaticScenario,
  createInstructorAccount,
  createInstructorPreset,
  deleteInstructorPreset,
  getInstructorAccount,
  listInstructorPresets,
  signInInstructor,
  signOutInstructor,
  subscribeToInstructorAccount,
  updateInstructorPreset,
  type InstructorPresetRow,
  type InstructorScenarioSnapshot,
} from '../instructorAccount'
import {
  clearSupabaseLocalOverride,
  getSupabaseConfiguration,
  getSupabaseLocalOverride,
  saveSupabaseLocalOverride,
} from '../session/supabase'
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

function ScenarioIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5.5h14v13H5z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M8 9h8M8 12h5M8 15h7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8 3.5h8v4H8z" fill="#0e171c" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
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

function summaryItems(scenario: InstructorScenarioSnapshot) {
  const patient = scenario.patient
  const ventilator = scenario.ventilator
  return [
    ventilator.mode,
    `FiO₂ ${Math.round(ventilator.fio2 * 100)}%`,
    `PEEP ${ventilator.peep}`,
    `RR ${ventilator.rate}`,
    `VT ${ventilator.tidalVolume} mL`,
    `C ${patient.compliance}`,
    `Rexp ${patient.expiratoryResistance}`,
    `Spont ${patient.spontaneousRate}`,
    `Shunt ${Math.round((patient.shuntFraction ?? 0.03) * 100)}%`,
    `Media ${scenario.mediaIds?.length ?? 0}`,
  ]
}

function nextCopyName(baseName: string, presets: InstructorPresetRow[]) {
  const names = new Set(presets.map((preset) => preset.name.toLocaleLowerCase()))
  let candidate = `${baseName} copy`
  let suffix = 2
  while (names.has(candidate.toLocaleLowerCase())) {
    candidate = `${baseName} copy ${suffix}`
    suffix += 1
  }
  return candidate
}

export function InstructorAccountControls({ role, currentScenario, onLoadScenario }: InstructorAccountControlsProps) {
  const [account, setAccount] = useState<User | null>(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [scenarioOpen, setScenarioOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [presets, setPresets] = useState<InstructorPresetRow[]>([])
  const [presetName, setPresetName] = useState('')
  const [presetDescription, setPresetDescription] = useState('')
  const [presetBusy, setPresetBusy] = useState(false)
  const [presetMessage, setPresetMessage] = useState<string | null>(null)
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const initialSupabaseConfig = getSupabaseLocalOverride()
  const activeSupabaseConfig = getSupabaseConfiguration()
  const [supabaseProject, setSupabaseProject] = useState(initialSupabaseConfig?.project ?? activeSupabaseConfig.url)
  const [supabasePublishableKey, setSupabasePublishableKey] = useState(initialSupabaseConfig?.publishableKey ?? activeSupabaseConfig.publishableKey)
  const [supabaseConfigMessage, setSupabaseConfigMessage] = useState<string | null>(null)
  const [supabaseConfigError, setSupabaseConfigError] = useState<string | null>(null)

  useEffect(() => {
    if (!settingsOpen) return
    const local = getSupabaseLocalOverride()
    const active = getSupabaseConfiguration()
    setSupabaseProject(local?.project ?? active.url)
    setSupabasePublishableKey(local?.publishableKey ?? active.publishableKey)
    setSupabaseConfigMessage(null)
    setSupabaseConfigError(null)
  }, [settingsOpen])

  const saveCentreSupabase = () => {
    if (role !== 'standalone') { setSupabaseConfigError('End or leave the teaching session before changing centre configuration.'); return }
    setSupabaseConfigMessage(null); setSupabaseConfigError(null)
    try {
      saveSupabaseLocalOverride(supabaseProject, supabasePublishableKey)
      setSupabaseConfigMessage('Centre configuration saved. EDUVENT is reconnecting…')
      window.setTimeout(() => window.location.reload(), 250)
    } catch (cause) { setSupabaseConfigError(cause instanceof Error ? cause.message : 'Unable to save Supabase configuration.') }
  }

  const resetCentreSupabase = () => {
    if (role !== 'standalone') { setSupabaseConfigError('End or leave the teaching session before changing centre configuration.'); return }
    clearSupabaseLocalOverride()
    setSupabaseConfigMessage('Local override cleared. EDUVENT is reconnecting to the deployment default…')
    setSupabaseConfigError(null)
    window.setTimeout(() => window.location.reload(), 250)
  }

  const staticPresets = useMemo(
    () => presets.filter((preset) => (preset.scenario.kind ?? 'static') === 'static'),
    [presets],
  )

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

  const openScenarios = () => {
    setScenarioOpen(true)
    setPresetMessage(null)
    setEditingPresetId(null)
    if (account) void refreshPresets(account)
  }

  const saveScenario = async () => {
    if (!account) {
      setPresetMessage('Connect an instructor cloud account first.')
      return
    }
    setPresetBusy(true)
    setPresetMessage(null)
    try {
      const created = await createInstructorPreset(
        presetName,
        asStaticScenario(currentScenario, presetDescription),
      )
      setPresetName('')
      setPresetDescription('')
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
    setScenarioOpen(false)
  }

  const updateFromCurrent = async (preset: InstructorPresetRow) => {
    if (!account || !window.confirm(`Replace the saved state in “${preset.name}” with the current simulator settings?`)) return
    setPresetBusy(true)
    setPresetMessage(null)
    try {
      await updateInstructorPreset(preset.id, {
        scenario: asStaticScenario(currentScenario, preset.scenario.description ?? ''),
      })
      setPresetMessage(`Updated “${preset.name}” from the current simulator state.`)
      await refreshPresets(account)
    } catch (cause) {
      setPresetMessage(cause instanceof Error ? cause.message : 'Unable to update scenario.')
    } finally {
      setPresetBusy(false)
    }
  }

  const duplicateScenario = async (preset: InstructorPresetRow) => {
    if (!account) return
    setPresetBusy(true)
    setPresetMessage(null)
    try {
      const created = await createInstructorPreset(nextCopyName(preset.name, presets), preset.scenario)
      setPresetMessage(`Duplicated as “${created.name}”.`)
      await refreshPresets(account)
    } catch (cause) {
      setPresetMessage(cause instanceof Error ? cause.message : 'Unable to duplicate scenario.')
    } finally {
      setPresetBusy(false)
    }
  }

  const beginEdit = (preset: InstructorPresetRow) => {
    setEditingPresetId(preset.id)
    setEditName(preset.name)
    setEditDescription(preset.scenario.description ?? '')
    setPresetMessage(null)
  }

  const saveDetails = async (preset: InstructorPresetRow) => {
    if (!account) return
    setPresetBusy(true)
    setPresetMessage(null)
    try {
      const updated = await updateInstructorPreset(preset.id, {
        name: editName,
        scenario: asStaticScenario(preset.scenario, editDescription),
      })
      setEditingPresetId(null)
      setPresetMessage(`Updated details for “${updated.name}”.`)
      await refreshPresets(account)
    } catch (cause) {
      setPresetMessage(cause instanceof Error ? cause.message : 'Unable to update scenario details.')
    } finally {
      setPresetBusy(false)
    }
  }

  const removeScenario = async (preset: InstructorPresetRow) => {
    if (!account || !window.confirm(`Delete scenario “${preset.name}”?`)) return
    setPresetBusy(true)
    setPresetMessage(null)
    try {
      await deleteInstructorPreset(preset.id)
      if (editingPresetId === preset.id) setEditingPresetId(null)
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
      {role !== 'candidate' && (
        <button
          type="button"
          className="top-account-button scenario-top-button"
          title="Instructor scenarios"
          aria-label="Open instructor scenarios"
          onClick={openScenarios}
        >
          <ScenarioIcon />
        </button>
      )}
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

      {scenarioOpen && (
        <div className="account-dialog-backdrop" onMouseDown={() => setScenarioOpen(false)}>
          <section className="account-dialog scenario-manager-dialog" role="dialog" aria-modal="true" aria-label="Instructor scenarios" onMouseDown={(event) => event.stopPropagation()}>
            <div className="account-dialog-heading">
              <div><span>Instructor tools</span><h2>Scenarios</h2></div>
              <button type="button" className="account-close-button" onClick={() => setScenarioOpen(false)} aria-label="Close scenarios"><CloseIcon /></button>
            </div>

            <div className="scenario-type-tabs" role="tablist" aria-label="Scenario type">
              <button type="button" className="selected" role="tab" aria-selected="true">Static presets</button>
              <button type="button" role="tab" aria-selected="false" disabled>Dynamic scenarios <small>later</small></button>
            </div>
            <p className="scenario-intro">A static preset captures the complete patient, ventilator, alarm, transition and waveform setup at one point in time. Load it before or during an instructor session. Dynamic timelines will build on the same base state later.</p>

            {account ? (
              <>
                <section className="scenario-create-card">
                  <div className="scenario-settings-heading">
                    <div><span>New static preset</span><h3>Capture current simulator state</h3></div>
                    <small>{account.email}</small>
                  </div>
                  <div className="scenario-create-fields">
                    <label>
                      <span>Name</span>
                      <input value={presetName} onChange={(event) => setPresetName(event.target.value)} maxLength={80} placeholder="e.g. Severe ARDS – initial state" />
                    </label>
                    <label>
                      <span>Instructor notes</span>
                      <textarea value={presetDescription} onChange={(event) => setPresetDescription(event.target.value)} maxLength={500} rows={3} placeholder="Optional teaching notes, expected problem or objective…" />
                    </label>
                  </div>
                  <button type="button" className="account-primary-button scenario-save-current" disabled={presetBusy || !presetName.trim()} onClick={() => void saveScenario()}>Save current state as preset</button>
                </section>

                <div className="scenario-library-heading">
                  <div><span>Library</span><strong>{staticPresets.length} static {staticPresets.length === 1 ? 'preset' : 'presets'}</strong></div>
                  <small>Most recently updated first</small>
                </div>

                <div className="scenario-card-list">
                  {staticPresets.length ? staticPresets.map((preset) => {
                    const editing = editingPresetId === preset.id
                    return (
                      <article className="scenario-card" key={preset.id}>
                        <div className="scenario-card-heading">
                          <div>
                            <span className="scenario-kind-badge">Static</span>
                            <strong>{preset.name}</strong>
                            <small>Updated {new Date(preset.updated_at).toLocaleString()}</small>
                          </div>
                        </div>

                        {editing ? (
                          <div className="scenario-edit-fields">
                            <label><span>Name</span><input value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={80} /></label>
                            <label><span>Instructor notes</span><textarea value={editDescription} onChange={(event) => setEditDescription(event.target.value)} maxLength={500} rows={3} /></label>
                            <div className="scenario-edit-actions">
                              <button type="button" className="account-primary-button" disabled={presetBusy || !editName.trim()} onClick={() => void saveDetails(preset)}>Save details</button>
                              <button type="button" disabled={presetBusy} onClick={() => setEditingPresetId(null)}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {preset.scenario.description ? <p className="scenario-description">{preset.scenario.description}</p> : <p className="scenario-description empty">No instructor notes.</p>}
                            <div className="scenario-summary-chips">
                              {summaryItems(preset.scenario).map((item) => <span key={item}>{item}</span>)}
                            </div>
                            <div className="scenario-card-actions">
                              <button type="button" className="scenario-load-button" disabled={presetBusy} onClick={() => loadScenario(preset)}>Load</button>
                              <button type="button" disabled={presetBusy} onClick={() => void updateFromCurrent(preset)}>Update from current</button>
                              <button type="button" disabled={presetBusy} onClick={() => beginEdit(preset)}>Edit details</button>
                              <button type="button" disabled={presetBusy} onClick={() => void duplicateScenario(preset)}>Duplicate</button>
                              <button type="button" className="scenario-delete-button" disabled={presetBusy} onClick={() => void removeScenario(preset)}>Delete</button>
                            </div>
                          </>
                        )}
                      </article>
                    )
                  }) : <div className="scenario-empty">No static scenarios saved yet. Configure the patient and ventilator, then capture the current state above.</div>}
                </div>
              </>
            ) : (
              <div className="scenario-signin-card">
                <strong>Cloud account required</strong>
                <p>Static scenarios are saved privately to your instructor account so they are available on any device.</p>
                <button type="button" className="account-primary-button" onClick={() => { setScenarioOpen(false); setAccountOpen(true) }}>Sign in to instructor account</button>
              </div>
            )}
            {presetMessage && <div className="account-message">{presetMessage}</div>}
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
              <div><span>Version</span><strong>v0.68</strong></div>
              <div><span>Teaching room</span><strong>2-hour lifetime</strong></div>
              <div><span>Cloud</span><strong>{account ? 'Connected' : 'Not signed in'}</strong></div>
            </div>

            <section className="supabase-settings-section">
              <div className="scenario-settings-heading">
                <div><span>Centre configuration</span><h3>Supabase</h3></div>
                <small>{getSupabaseConfiguration().source === 'local' ? 'Local override' : getSupabaseConfiguration().source === 'environment' ? 'Deployment environment' : 'Built-in default'}</small>
              </div>
              <p>Each centre can connect this EDUVENT installation to its own Supabase project. The configuration is stored only in this browser and overrides deployment environment variables.</p>
              <div className="supabase-settings-fields">
                <label><span>Project URL or project reference</span><input value={supabaseProject} disabled={role !== 'standalone'} onChange={(event) => setSupabaseProject(event.target.value)} placeholder="e.g. abcdefghijklmnop or https://abcdefgh.supabase.co" autoCapitalize="none" autoCorrect="off" spellCheck={false} /></label>
                <label><span>Publishable key</span><input value={supabasePublishableKey} disabled={role !== 'standalone'} onChange={(event) => setSupabasePublishableKey(event.target.value)} placeholder="sb_publishable_…" autoCapitalize="none" autoCorrect="off" spellCheck={false} /></label>
              </div>
              <div className="supabase-settings-actions">
                <button type="button" className="account-primary-button" disabled={role !== 'standalone'} onClick={saveCentreSupabase}>Save & reconnect</button>
                <button type="button" className="account-secondary-button" disabled={role !== 'standalone' || !getSupabaseLocalOverride()} onClick={resetCentreSupabase}>Use deployment default</button>
              </div>
              <small className="supabase-settings-note">The publishable key is browser-visible by design. Never enter a Supabase service-role or secret key here. Database and media security must be enforced with RLS.</small>
              {role !== 'standalone' && <div className="account-hint">Centre configuration is locked while a teaching session is active.</div>}
              {supabaseConfigMessage && <div className="account-message">{supabaseConfigMessage}</div>}
              {supabaseConfigError && <div className="account-error">{supabaseConfigError}</div>}
            </section>

            {role !== 'candidate' && (
              <section className="scenario-settings-section">
                <div className="scenario-settings-heading">
                  <div><span>Instructor tools</span><h3>Scenarios</h3></div>
                  {account && <small>{staticPresets.length} saved</small>}
                </div>
                <p>Prepare and manage reusable static teaching states. Dynamic scenario timelines will be added later.</p>
                <button type="button" className="account-secondary-button" onClick={() => { setSettingsOpen(false); openScenarios() }}>Manage scenarios</button>
              </section>
            )}
          </section>
        </div>
      )}
    </>
  )
}
