import { useEffect, useState } from 'react'
import type { InstructorAccountAuthState } from '../../components/InstructorAccountAuth'
import {
  clearSupabaseLocalOverride,
  getSupabaseConfiguration,
  getSupabaseLocalOverride,
  saveSupabaseLocalOverride,
} from '../../session/supabase'

const INSTRUCTOR_DETAILS_STORAGE_KEY = 'edusim.instructor-details'

interface InstructorDetails { name: string; email: string; centre: string }

function loadInstructorDetails(): InstructorDetails {
  if (typeof window === 'undefined') return { name: '', email: '', centre: '' }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(INSTRUCTOR_DETAILS_STORAGE_KEY) ?? window.localStorage.getItem('eduvent.instructor-details') ?? '{}') as Partial<InstructorDetails>
    return {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      email: typeof parsed.email === 'string' ? parsed.email : '',
      centre: typeof parsed.centre === 'string' ? parsed.centre : '',
    }
  } catch {
    return { name: '', email: '', centre: '' }
  }
}

function MenuIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>
}

export interface InstructorSettingsControllerProps {
  productLabel: string
  version: string
  role: 'standalone' | 'instructor' | 'candidate'
  auth: InstructorAccountAuthState
}

export function InstructorSettingsController({ productLabel, version, role, auth }: InstructorSettingsControllerProps) {
  const [open, setOpen] = useState(false)
  const initialSupabaseConfig = getSupabaseLocalOverride()
  const activeSupabaseConfig = getSupabaseConfiguration()
  const [supabaseProject, setSupabaseProject] = useState(initialSupabaseConfig?.project ?? activeSupabaseConfig.url)
  const [supabasePublishableKey, setSupabasePublishableKey] = useState(initialSupabaseConfig?.publishableKey ?? activeSupabaseConfig.publishableKey)
  const [supabaseConfigMessage, setSupabaseConfigMessage] = useState<string | null>(null)
  const [supabaseConfigError, setSupabaseConfigError] = useState<string | null>(null)
  const initialInstructorDetails = loadInstructorDetails()
  const [instructorName, setInstructorName] = useState(initialInstructorDetails.name)
  const [instructorEmail, setInstructorEmail] = useState(initialInstructorDetails.email)
  const [instructorCentre, setInstructorCentre] = useState(initialInstructorDetails.centre)
  const [instructorDetailsMessage, setInstructorDetailsMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const local = getSupabaseLocalOverride()
    const active = getSupabaseConfiguration()
    setSupabaseProject(local?.project ?? active.url)
    setSupabasePublishableKey(local?.publishableKey ?? active.publishableKey)
    setSupabaseConfigMessage(null)
    setSupabaseConfigError(null)
    const details = loadInstructorDetails()
    setInstructorName(details.name)
    setInstructorEmail(details.email || auth.account?.email || '')
    setInstructorCentre(details.centre)
    setInstructorDetailsMessage(null)
  }, [open, auth.account?.email])

  const saveInstructorDetails = () => {
    const details = { name: instructorName.trim(), email: instructorEmail.trim(), centre: instructorCentre.trim() }
    try {
      window.localStorage.setItem(INSTRUCTOR_DETAILS_STORAGE_KEY, JSON.stringify(details))
      setInstructorName(details.name)
      setInstructorEmail(details.email)
      setInstructorCentre(details.centre)
      setInstructorDetailsMessage('Instructor details saved.')
    } catch {
      setInstructorDetailsMessage('Unable to save instructor details in this browser.')
    }
  }

  const saveCentreSupabase = () => {
    if (role !== 'standalone') { setSupabaseConfigError('End or leave the teaching session before changing centre configuration.'); return }
    setSupabaseConfigMessage(null); setSupabaseConfigError(null)
    try {
      saveSupabaseLocalOverride(supabaseProject, supabasePublishableKey)
      setSupabaseConfigMessage('Centre configuration saved. EDUSIM is reconnecting…')
      window.setTimeout(() => window.location.reload(), 250)
    } catch (cause) { setSupabaseConfigError(cause instanceof Error ? cause.message : 'Unable to save Supabase configuration.') }
  }

  const resetCentreSupabase = () => {
    if (role !== 'standalone') { setSupabaseConfigError('End or leave the teaching session before changing centre configuration.'); return }
    clearSupabaseLocalOverride()
    setSupabaseConfigMessage('Local override cleared. EDUSIM is reconnecting to the deployment default…')
    setSupabaseConfigError(null)
    window.setTimeout(() => window.location.reload(), 250)
  }

  return <>
    <button type="button" className="top-account-button" title={`${productLabel} settings`} aria-label={`Open ${productLabel} settings`} onClick={() => setOpen(true)}><MenuIcon /></button>
    {open && <div className="account-dialog-backdrop" onMouseDown={() => setOpen(false)}>
      <section className="account-dialog settings-dialog" role="dialog" aria-modal="true" aria-label={`${productLabel} settings`} onMouseDown={(event) => event.stopPropagation()}>
        <div className="account-dialog-heading"><div><span>{productLabel}</span><h2>Settings</h2></div><button type="button" className="account-close-button" onClick={() => setOpen(false)} aria-label="Close settings">×</button></div>
        <div className="settings-summary-grid">
          <div><span>Version</span><strong>v{version}</strong></div>
          <div><span>Teaching room</span><strong>2-hour lifetime</strong></div>
          <div><span>Cloud</span><strong>{auth.account ? 'Connected' : 'Not signed in'}</strong></div>
        </div>
        <section className="instructor-details-section">
          <div className="scenario-settings-heading"><div><span>Instructor</span><h3>Instructor details</h3></div></div>
          <div className="instructor-details-fields">
            <label><span>Name</span><input value={instructorName} onChange={(event) => setInstructorName(event.target.value)} placeholder="Instructor name" /></label>
            <label><span>Email</span><input type="email" value={instructorEmail} onChange={(event) => setInstructorEmail(event.target.value)} placeholder="name@example.com" /></label>
            <label><span>Centre</span><input value={instructorCentre} onChange={(event) => setInstructorCentre(event.target.value)} placeholder="Hospital / simulation centre" /></label>
          </div>
          <button type="button" className="account-primary-button instructor-details-save" onClick={saveInstructorDetails}>Save instructor details</button>
          {instructorDetailsMessage && <div className="account-message">{instructorDetailsMessage}</div>}
        </section>
        <section className="supabase-settings-section">
          <div className="scenario-settings-heading"><div><span>Centre configuration</span><h3>Supabase</h3></div><small>{getSupabaseConfiguration().source === 'local' ? 'Local override' : getSupabaseConfiguration().source === 'environment' ? 'Deployment environment' : 'Built-in default'}</small></div>
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
      </section>
    </div>}
  </>
}
