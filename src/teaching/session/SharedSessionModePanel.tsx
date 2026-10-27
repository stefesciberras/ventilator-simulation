import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { routeToSelfDirectedAssignment } from '../../selfDirectedAssignments'
import { loadPanelCollapsed, savePanelCollapsed } from '../../panelCollapse'
import { PRODUCT_SESSION_RUNTIME_MODE_EVENT, PRODUCT_SESSION_RUNTIME_MODE_KEY, type ProductSessionRuntimeMode } from './useProductTeachingSession'
import { SharedCandidateInvitation } from './SharedCandidateInvitation'
import { SharedInstructorLiveRoom } from './SharedInstructorLiveRoom'
import type { RecoverableTeachingCandidate, RecoverableTeachingInstructor, SharedTeachingConnection, SharedTeachingMemberRow, SharedTeachingRole, SharedTeachingSessionRow } from './types'
import './session-invite-modal.css'

export function SharedConnectionBadge({ connection }: { connection: SharedTeachingConnection }) {
  const label = connection === 'connected' ? 'Connected' : connection === 'connecting' ? 'Connecting…' : connection === 'reconnecting' ? 'Reconnecting…' : connection === 'error' ? 'Connection error' : 'Offline'
  return <span className={`session-connection ${connection}`}><span className="session-connection-dot" />{label}</span>
}

interface SharedSessionLauncherProps {
  instructorAuthenticated: boolean
  connection: SharedTeachingConnection
  error?: string | null
  recoverableInstructor?: RecoverableTeachingInstructor | null
  recoverableCandidate?: RecoverableTeachingCandidate | null
  onStartInstructor: () => void | Promise<unknown>
  onResumeInstructor?: (sessionId?: string) => void | Promise<unknown>
  onJoinCandidate: (sessionKey: string, displayName: string) => void | Promise<unknown>
  onResumeCandidate?: () => void | Promise<unknown>
  onSelfDirected?: (assignmentCode: string) => void
  instructorSignInNote?: string
}

function normaliseSessionKey(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}

function removeInviteFromUrl() {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.delete('session')
  url.searchParams.delete('mode')
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
}

export function SharedSessionLauncher({ instructorAuthenticated, connection, error, recoverableInstructor, recoverableCandidate, onStartInstructor, onResumeInstructor, onJoinCandidate, onResumeCandidate, onSelfDirected, instructorSignInNote = 'Sign in to an instructor account to start or resume an instructor teaching session. Joining as a candidate does not require an account.' }: SharedSessionLauncherProps) {
  const [mode, setMode] = useState<'choose' | 'candidate' | 'self-directed'>('choose')
  const [sessionKey, setSessionKey] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [assignmentCode, setAssignmentCode] = useState('')
  const [joinModalOpen, setJoinModalOpen] = useState(false)
  const [inviteRuntimeMode, setInviteRuntimeMode] = useState<ProductSessionRuntimeMode | null>(null)
  const autoJoinAttemptedRef = useRef(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const key = normaliseSessionKey(params.get('session') ?? '')
    if (key.length !== 6) return
    const invitedMode = params.get('mode') === 'simulation' ? 'simulation' : 'teaching'
    setSessionKey(key)
    setInviteRuntimeMode(invitedMode)
    setMode('candidate')
    setJoinModalOpen(true)
  }, [])

  useEffect(() => {
    if (recoverableCandidate) {
      setSessionKey(recoverableCandidate.sessionKey)
      setDisplayName(recoverableCandidate.displayName)
    }
  }, [recoverableCandidate])

  const joinInvitedSimulation = () => {
    const key = normaliseSessionKey(sessionKey)
    if (key.length !== 6 || connection === 'connecting') return
    autoJoinAttemptedRef.current = true
    void Promise.resolve(onJoinCandidate(key, '')).then((result) => {
      if (result) removeInviteFromUrl()
    })
  }

  useEffect(() => {
    if (!joinModalOpen || inviteRuntimeMode !== 'simulation' || autoJoinAttemptedRef.current || sessionKey.length !== 6) return
    joinInvitedSimulation()
    // Invitation auto-join is intentionally attempted once; failures are retried explicitly from the modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinModalOpen, inviteRuntimeMode, sessionKey])

  const closeJoinModal = () => {
    setJoinModalOpen(false)
    setInviteRuntimeMode(null)
    setMode('choose')
    autoJoinAttemptedRef.current = false
    removeInviteFromUrl()
  }

  const launchSelfDirected = async (code: string) => {
    if (onSelfDirected) onSelfDirected(code)
    else await routeToSelfDirectedAssignment(code)
  }

  const candidateForm = (
    <form className="candidate-join-form" onSubmit={(event) => {
      event.preventDefault()
      const key = normaliseSessionKey(sessionKey)
      if (key.length !== 6) return
      void Promise.resolve(onJoinCandidate(key, displayName.trim())).then((result) => {
        if (result) removeInviteFromUrl()
      })
    }}>
      <label>
        <span>Session key</span>
        <input autoFocus value={sessionKey} onChange={(event) => setSessionKey(normaliseSessionKey(event.target.value))} placeholder="ABC123" maxLength={6} required />
      </label>
      <label>
        <span>Name <small>(optional)</small></span>
        <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Candidate" maxLength={60} />
      </label>
      <div className="session-launch-actions">
        <button type="submit" className="session-primary-button" disabled={connection === 'connecting' || sessionKey.length < 6}>{connection === 'connecting' ? 'Joining…' : 'Join session'}</button>
        <button type="button" className="session-secondary-button" onClick={joinModalOpen ? closeJoinModal : () => setMode('choose')}>Cancel</button>
      </div>
      {error && <div className="session-error">{error}</div>}
    </form>
  )

  if (joinModalOpen) {
    return (
      <div className="session-invite-modal-backdrop" role="presentation">
        <div className="session-invite-modal" role="dialog" aria-modal="true" aria-label={inviteRuntimeMode === 'simulation' ? 'Joining simulation' : 'Join session'}>
          <div className="session-invite-modal-heading">
            <div>
              <span>{inviteRuntimeMode === 'simulation' ? 'Simulation invitation' : 'Session invitation'}</span>
              <strong>{inviteRuntimeMode === 'simulation' ? 'Joining your simulation' : 'Join instructor session'}</strong>
            </div>
            {inviteRuntimeMode !== 'simulation' && <button type="button" className="session-start-close" onClick={closeJoinModal} aria-label="Close">×</button>}
          </div>
          {inviteRuntimeMode === 'simulation' ? (
            <>
              <p className="session-invite-status">You have been invited as the single candidate in this Simulation session. No manual setup is required.</p>
              <div className="session-invite-code">{sessionKey}</div>
              {connection === 'connecting' && <p className="session-invite-status">Connecting to the instructor…</p>}
              {error && <><div className="session-error">{error}</div><div className="session-launch-actions"><button type="button" className="session-primary-button" onClick={() => { autoJoinAttemptedRef.current = false; joinInvitedSimulation() }}>Retry joining</button><button type="button" className="session-secondary-button" onClick={closeJoinModal}>Cancel</button></div></>}
            </>
          ) : candidateForm}
        </div>
      </div>
    )
  }

  if (mode === 'candidate') return candidateForm
  if (mode === 'self-directed') return <form className="candidate-join-form" onSubmit={(e) => { e.preventDefault(); const code = assignmentCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); if (code.length === 8) void launchSelfDirected(code) }}><label><span>Self-directed session code</span><input value={assignmentCode} onChange={(e) => setAssignmentCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))} placeholder="A1B2C3D4" maxLength={8} required /></label><p className="session-start-note">This scenario runs independently on your device. No instructor needs to be online.</p><div className="session-launch-actions"><button type="submit" className="session-primary-button" disabled={assignmentCode.length < 8}>Start scenario</button><button type="button" className="session-secondary-button" onClick={() => setMode('choose')}>Cancel</button></div></form>
  return <><div className="session-launch-actions"><button type="button" className="session-primary-button" disabled={!instructorAuthenticated || connection === 'connecting'} onClick={() => void onStartInstructor()}>Start instructor session</button><button type="button" className="session-secondary-button" onClick={() => { setInviteRuntimeMode(null); setJoinModalOpen(true); setMode('candidate') }}>Join as candidate</button><button type="button" className="session-secondary-button" onClick={() => setMode('self-directed')}>Run self-directed scenario</button>{recoverableCandidate && onResumeCandidate && <button type="button" className="session-secondary-button" onClick={() => void onResumeCandidate()}>Rejoin candidate {recoverableCandidate.sessionKey}</button>}{recoverableInstructor && onResumeInstructor && <button type="button" className="session-secondary-button" disabled={!instructorAuthenticated} onClick={() => void onResumeInstructor(recoverableInstructor.sessionId)}>Rejoin instructor {recoverableInstructor.sessionKey}</button>}</div>{!instructorAuthenticated && <div className="session-instructor-signin-note">{instructorSignInNote}</div>}{error && <div className="session-error">{error}</div>}</>
}

export interface SharedInstructorStartOption { id: string; title: string; summary?: string; chips?: readonly string[] }
export interface SharedInstructorStartConfig { currentTitle: string; currentSummary: string; currentChips?: readonly string[]; savedOptions?: readonly SharedInstructorStartOption[]; selectedSavedId?: string; onSelectedSavedIdChange?: (id: string) => void; savedBusy?: boolean; savedMessage?: string | null; onStartCurrent: () => void | Promise<unknown>; onStartSaved?: (id: string) => void | Promise<unknown>; onLoadSaved?: (id: string) => void | Promise<unknown> }

export function SharedInstructorStartWizard({ config, onClose }: { config: SharedInstructorStartConfig; onClose: () => void }) {
  const [source, setSource] = useState<'current' | 'scenario'>('current'); const options = config.savedOptions ?? []; const selectedId = config.selectedSavedId ?? options[0]?.id ?? ''; const selected = options.find((x) => x.id === selectedId) ?? null
  return <div className="session-start-wizard"><div className="session-start-wizard-heading"><div><span>Instructor session</span><strong>Choose starting state</strong></div><button type="button" className="session-start-close" onClick={onClose}>×</button></div><div className="session-start-source-tabs"><button type="button" className={source === 'current' ? 'selected' : ''} onClick={() => setSource('current')}>Current setup</button><button type="button" className={source === 'scenario' ? 'selected' : ''} disabled={config.savedBusy || !options.length} onClick={() => setSource('scenario')}>Saved scenario</button></div>{source === 'current' ? <div className="session-start-current-card"><span>Current standalone setup</span><strong>{config.currentTitle}</strong>{config.currentChips?.length ? <div className="session-start-summary-chips">{config.currentChips.map((x) => <em key={x}>{x}</em>)}</div> : null}<small>{config.currentSummary}</small></div> : <div className="session-start-scenarios"><div className="session-start-scenario-list">{options.map((o) => <button type="button" key={o.id} className={`session-start-scenario-option ${selectedId === o.id ? 'selected' : ''}`} onClick={() => config.onSelectedSavedIdChange?.(o.id)}><strong>{o.title}</strong>{o.summary && <small>{o.summary}</small>}{o.chips?.length ? <div className="session-start-summary-chips">{o.chips.map((x) => <em key={x}>{x}</em>)}</div> : null}</button>)}</div>{selected && config.onLoadSaved && <button type="button" className="session-secondary-button" onClick={() => void config.onLoadSaved?.(selected.id)}>Load into standalone first</button>}</div>}{config.savedMessage && <p className="session-start-note">{config.savedMessage}</p>}<button type="button" className="session-primary-button session-start-primary" disabled={source === 'scenario' && !selected} onClick={() => void (source === 'current' ? config.onStartCurrent() : selected && config.onStartSaved?.(selected.id))}>{source === 'current' ? 'Start with current setup' : 'Start with saved scenario'}</button><button type="button" className="session-secondary-button session-start-cancel" onClick={onClose}>Cancel</button></div>
}

export interface SharedSessionSwitchRow { id: string; label: string; checked: boolean; disabled?: boolean; emphasis?: boolean; readOnly?: boolean; onChange?: (checked: boolean) => void | Promise<unknown> }
export interface SharedSessionDomain { id: string; title: string; status: string; active?: boolean; rows: SharedSessionSwitchRow[] }
export interface SharedInstructorDashboardConfig { runtimeBadge?: ReactNode; domains?: SharedSessionDomain[]; simulationPaused?: boolean; onSimulationPausedChange?: (paused: boolean) => void; pausedMessage?: string; onBroadcastNow?: () => void | Promise<unknown>; broadcastLabel?: string; candidateStatus?: ReactNode; instructorNotice?: ReactNode; collapseStorageKey?: string }

interface SharedBasicSessionPanelProps extends SharedSessionLauncherProps { role: SharedTeachingRole; session: SharedTeachingSessionRow | null; members?: SharedTeachingMemberRow[]; onLeaveSession: () => void | Promise<unknown>; onEndInstructorSession: () => void | Promise<unknown>; title?: string; instructorStart?: SharedInstructorStartConfig; instructorDashboard?: SharedInstructorDashboardConfig; footer?: ReactNode; productId?: string; productLabel?: string; productDescription?: string; renderCandidateTelemetry?: (member: SharedTeachingMemberRow) => ReactNode }

function initialProductRuntimeMode(): ProductSessionRuntimeMode {
  if (typeof window === 'undefined') return 'teaching'
  return window.localStorage.getItem(PRODUCT_SESSION_RUNTIME_MODE_KEY) === 'simulation' ? 'simulation' : 'teaching'
}

function sessionProductRuntimeMode(session: SharedTeachingSessionRow | null, fallback: ProductSessionRuntimeMode): ProductSessionRuntimeMode {
  const productState = (session as (SharedTeachingSessionRow & { product_state?: { runtimeMode?: ProductSessionRuntimeMode } }) | null)?.product_state
  return productState?.runtimeMode === 'simulation' ? 'simulation' : productState?.runtimeMode === 'teaching' ? 'teaching' : fallback
}

export function SharedBasicSessionPanel({ role, session, members = [], connection, error, onLeaveSession, onEndInstructorSession, title = 'Session mode', instructorStart, instructorDashboard, footer, productId = 'edusim', productLabel = 'EDUSIM', productDescription = 'interactive clinical simulation', renderCandidateTelemetry, ...launcherProps }: SharedBasicSessionPanelProps) {
  const [wizard, setWizard] = useState(false)
  const [controlsExpanded, setControlsExpanded] = useState(false)
  const collapseKey = instructorDashboard?.collapseStorageKey ?? `${productId}-instructor-dashboard`
  const [collapsed, setCollapsed] = useState(() => loadPanelCollapsed(collapseKey))
  const [runtimeMode, setRuntimeMode] = useState<ProductSessionRuntimeMode>(() => initialProductRuntimeMode())
  const candidates = members.filter((m) => m.role === 'candidate')
  const online = candidates.filter((m) => Date.now() - new Date(m.last_seen).getTime() <= 30000).length
  const activeRuntimeMode = sessionProductRuntimeMode(session, runtimeMode)
  const joinUrl = useMemo(() => {
    if (!session?.session_key || typeof window === 'undefined') return ''
    const url = new URL(window.location.href)
    url.search = ''
    url.hash = ''
    url.searchParams.set('session', session.session_key)
    url.searchParams.set('mode', activeRuntimeMode)
    return url.toString()
  }, [session?.session_key, activeRuntimeMode])
  const toggleCollapsed = () => setCollapsed((v) => { const n = !v; savePanelCollapsed(collapseKey, n); return n })
  const isEdumon = productId.toLowerCase().includes('edumon') || productId.toLowerCase().includes('ana') || productId.toLowerCase().includes('icu')
  const chooseRuntimeMode = (next: ProductSessionRuntimeMode) => {
    setRuntimeMode(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PRODUCT_SESSION_RUNTIME_MODE_KEY, next)
      window.dispatchEvent(new Event(PRODUCT_SESSION_RUNTIME_MODE_EVENT))
    }
  }

  if (role === 'standalone') return <section className="session-panel standalone-session-panel"><div className="session-panel-heading"><div><span className="session-kicker">Teaching</span><h2>{title}</h2></div><span className="session-role-pill">Standalone</span></div>{isEdumon && <div className="session-start-wizard"><div className="session-start-source-tabs"><button type="button" className={runtimeMode === 'simulation' ? 'selected' : ''} onClick={() => chooseRuntimeMode('simulation')}>Simulation</button><button type="button" className={runtimeMode === 'teaching' ? 'selected' : ''} onClick={() => chooseRuntimeMode('teaching')}>Teaching</button></div><p className="session-start-note">{runtimeMode === 'simulation' ? 'One instructor and one candidate share Drugs & Events, Sevo and ventilator changes. Patient and physiology controls remain instructor-only.' : 'One instructor can teach one or more candidates whose permitted device/actions remain local to each candidate.'}</p></div>}{wizard && instructorStart ? <SharedInstructorStartWizard config={instructorStart} onClose={() => setWizard(false)} /> : <SharedSessionLauncher connection={connection} error={error} {...launcherProps} onStartInstructor={instructorStart ? () => setWizard(true) : launcherProps.onStartInstructor} />}{footer}</section>
  if (role === 'instructor') return <section className={`session-panel instructor-session-panel ${collapsed ? 'panel-collapsed' : ''}`}><div className="session-panel-heading"><div><span className="session-kicker">Teaching</span><h2>Instructor dashboard</h2></div><div className="collapsible-heading-actions"><SharedConnectionBadge connection={connection} />{instructorDashboard?.runtimeBadge}<button className={`teaching-workspace-collapse ${collapsed ? 'collapsed' : 'expanded'}`} type="button" onClick={toggleCollapsed}><span className="teaching-collapse-caret" /></button></div></div>{!collapsed && <><div className="instructor-dashboard-summary"><div className="session-key-card session-share-card"><div className="session-key-details"><span>Candidate session key</span><strong>{session?.session_key ?? '———'}</strong><small>{activeRuntimeMode === 'simulation' ? 'Scan the QR code or open the invite link to join the single candidate automatically.' : 'Scan the QR code or open the invite link for a prominent join form; the key can also be entered manually.'}</small>{session?.id && session.session_key && joinUrl && <SharedCandidateInvitation sessionId={session.id} sessionKey={session.session_key} joinUrl={joinUrl} productId={productId} productLabel={productLabel} productDescription={productDescription} />}</div></div><div className="candidate-count-card"><span>Candidates</span><strong>{online}<small> online</small></strong><em>{candidates.length} joined</em></div></div>{instructorDashboard?.simulationPaused && <div className="instructor-pause-banner">{instructorDashboard.pausedMessage ?? 'All candidate simulations are paused by the instructor.'}</div>}{instructorDashboard?.instructorNotice}{instructorDashboard?.domains?.length ? <div className="instructor-session-controls"><button type="button" className="instructor-session-controls-toggle" onClick={() => setControlsExpanded((v) => !v)}><span><strong>Sharing & control policy</strong><small>{instructorDashboard.domains.map((d) => d.title).join(' • ')}</small></span><b>{controlsExpanded ? 'Collapse' : 'Configure'}</b></button>{controlsExpanded && <div className="session-domain-grid instructor-domain-grid">{instructorDashboard.domains.map((d) => <div key={d.id} className={`session-domain-card ${d.active ? 'shared' : ''}`}><div className="session-domain-title"><strong>{d.title}</strong><span>{d.status}</span></div>{d.rows.map((r) => <label key={r.id} className={`session-switch-row ${r.emphasis ? 'session-switch-row-emphasis' : ''} ${r.readOnly ? 'session-switch-row-readonly' : ''}`}><span>{r.label}</span>{r.readOnly ? <strong className="session-policy-value">{r.checked ? 'Shared' : 'Local'}</strong> : <input type="checkbox" checked={r.checked} disabled={r.disabled} onChange={(e) => void r.onChange?.(e.target.checked)} />}</label>)}</div>)}</div>}</div> : null}<div className="session-action-row">{instructorDashboard?.onSimulationPausedChange && <button type="button" className={instructorDashboard.simulationPaused ? 'session-primary-button' : 'session-secondary-button'} onClick={() => instructorDashboard.onSimulationPausedChange?.(!instructorDashboard.simulationPaused)}>{instructorDashboard.simulationPaused ? 'Resume all simulations' : 'Pause all simulations'}</button>}{instructorDashboard?.onBroadcastNow && <button type="button" className="session-secondary-button" onClick={() => void instructorDashboard.onBroadcastNow?.()}>{instructorDashboard.broadcastLabel ?? 'Push current settings'}</button>}<button type="button" className="session-danger-button" onClick={() => void onEndInstructorSession()}>End session</button></div>{error && <div className="session-error">{error}</div>}<SharedInstructorLiveRoom role={role} members={members} renderTelemetry={renderCandidateTelemetry} storageKey={`${productId}-instructor-live-room`} /></>}{footer}</section>
  return <section className="session-panel candidate-session-panel"><div className="session-panel-heading"><div><span className="session-kicker">Teaching</span><h2>Candidate session</h2></div><SharedConnectionBadge connection={connection} /></div><div className="candidate-session-body"><div className="candidate-session-summary"><span>Session <strong>{session?.session_key ?? '———'}</strong></span>{instructorDashboard?.candidateStatus}</div>{instructorDashboard?.simulationPaused && <div className="session-warning">Simulation paused by instructor. The instructor controls when it resumes.</div>}{connection === 'reconnecting' && <div className="session-warning">Connection lost. Simulation continues with the last received settings while EDUSIM reconnects.</div>}{error && <div className="session-error">{error}</div>}<button type="button" className="session-secondary-button" onClick={() => void onLeaveSession()}>Leave session</button></div>{footer}</section>
}
