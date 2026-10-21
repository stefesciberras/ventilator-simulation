import { useEffect, useMemo, useRef, useState } from 'react'
import { CandidateInvitation } from './CandidateInvitation'
import { SharedInstructorStartWizard, SharedSessionLauncher } from '../teaching/session'
import type { RuntimeTransportKind, SessionConnection, SessionRole } from '../session/useTeachingSession'
import type { LocalRuntimeConnection } from '../session/localRuntimeTransport'
import type { SessionMemberRow, TeachingSessionRow } from '../session/supabase'
import type { PatientSettings, VentilatorSettings } from '../simulation/types'
import { loadPanelCollapsed, savePanelCollapsed } from '../panelCollapse'
import {
  getInstructorAccount,
  listInstructorPresets,
  type InstructorPresetRow,
  type InstructorScenarioSnapshot,
} from '../instructorAccount'
import '../instructor.css'

interface SessionPanelProps {
  role: SessionRole
  instructorAuthenticated: boolean
  simulatorExpanded: boolean
  onSimulatorExpandedChange: (expanded: boolean) => void
  connection: SessionConnection
  localRuntimeConnection: LocalRuntimeConnection
  localRuntimeUrl: string | null
  runtimeTransportKind: RuntimeTransportKind
  session: TeachingSessionRow | null
  simulationPaused: boolean
  onSimulationPausedChange: (paused: boolean) => void
  members: SessionMemberRow[]
  error: string | null
  recoverableInstructor?: { sessionId: string; sessionKey: string } | null
  recoverableCandidate?: { sessionKey: string; displayName: string; expiresAt: string } | null
  currentScenario: InstructorScenarioSnapshot
  onLoadScenario: (scenario: InstructorScenarioSnapshot) => void
  onStartInstructor: (scenario?: InstructorScenarioSnapshot) => Promise<void>
  onResumeInstructor?: (sessionId?: string) => Promise<void>
  onJoinCandidate: (sessionKey: string, displayName: string) => Promise<void>
  onResumeCandidate?: () => Promise<void>
  onLeaveSession: () => Promise<void>
  onEndInstructorSession: () => Promise<void>
  onUpdatePolicy: (patch: {
    syncPatient?: boolean
    syncVentilator?: boolean
    candidateCanEditPatient?: boolean
    candidateCanEditVentilator?: boolean
    candidateControlsVisible?: boolean
    syncAlarms?: boolean
    candidateCanEditAlarms?: boolean
    alarmsSilent?: boolean
    candidateCanEditWaveforms?: boolean
    allowOesophagealPressure?: boolean
    showPatientEffort?: boolean
  }) => Promise<void>
  onBroadcastNow: () => Promise<void>
}

function ConnectionBadge({ connection }: { connection: SessionConnection }) {
  const label = connection === 'connected'
    ? 'Connected'
    : connection === 'connecting'
      ? 'Connecting…'
      : connection === 'reconnecting'
        ? 'Reconnecting…'
        : connection === 'error'
          ? 'Connection error'
          : 'Offline'
  return <span className={`session-connection ${connection}`}><span className="session-connection-dot" />{label}</span>
}

function RuntimeTransportBadge({ connection, url, kind }: { connection: LocalRuntimeConnection; url: string | null; kind: RuntimeTransportKind }) {
  if (connection === 'disabled' || kind === 'cloud') return null
  const name = kind === 'webrtc' ? 'P2P' : kind === 'appliance' ? 'EDUVENT box' : 'LAN server'
  const label = connection === 'connected'
    ? `${name} live`
    : connection === 'connecting'
      ? `${name} connecting…`
      : connection === 'reconnecting'
        ? `${name} reconnecting…`
        : `${name} unavailable`
  const title = kind === 'webrtc' ? 'Direct WebRTC DataChannel; Supabase signalling/fallback' : (url ?? 'Local runtime relay')
  return <span className={`local-runtime-badge ${connection}`} title={title}><i />{label}</span>
}

function hasVentilatorSettings(value: SessionMemberRow['ventilator_settings']): value is VentilatorSettings {
  return Boolean(value && typeof value === 'object' && 'mode' in value)
}

function hasPatientSettings(value: SessionMemberRow['patient_settings']): value is PatientSettings {
  return Boolean(value && typeof value === 'object' && 'compliance' in value)
}

function CandidateCard({ member, now }: { member: SessionMemberRow; now: number }) {
  const lastSeen = new Date(member.last_seen).getTime()
  const ageSeconds = Number.isFinite(lastSeen) ? Math.max(0, Math.round((now - lastSeen) / 1000)) : Number.POSITIVE_INFINITY
  const online = ageSeconds <= 30
  const vent = hasVentilatorSettings(member.ventilator_settings) ? member.ventilator_settings : null
  const patient = hasPatientSettings(member.patient_settings) ? member.patient_settings : null

  return (
    <article className={`candidate-card ${online ? 'online' : 'offline'}`}>
      {member.alarm_level && <div className={`candidate-alarm-strip ${member.alarm_level}`} aria-label={`${member.alarm_level} candidate alarm`} />}
      <div className="candidate-card-heading">
        <div>
          <strong>{member.display_name?.trim() || 'Candidate'}</strong>
          <small>{online ? 'Online' : `Last seen ${Number.isFinite(ageSeconds) ? `${ageSeconds}s ago` : '—'}`}</small>
        </div>
        <span className={`candidate-presence ${online ? 'online' : 'offline'}`}><i />{online ? 'LIVE' : 'OFFLINE'}</span>
      </div>
      <div className="candidate-state-grid">
        <div><span>Mode</span><strong>{vent?.mode ?? '—'}</strong></div>
        <div><span>FiO₂</span><strong>{vent ? `${Math.round(vent.fio2 * 100)}%` : '—'}</strong></div>
        <div><span>PEEP</span><strong>{vent?.peep ?? '—'}</strong></div>
        <div><span>RR set</span><strong>{vent?.rate ?? '—'}</strong></div>
        <div><span>Compliance</span><strong>{patient ? patient.compliance.toFixed(0) : '—'}</strong></div>
        <div><span>Rinsp</span><strong>{patient ? patient.resistance.toFixed(0) : '—'}</strong></div>
        <div><span>Spont RR</span><strong>{patient ? patient.spontaneousRate.toFixed(0) : '—'}</strong></div>
        <div><span>Effort</span><strong>{patient ? patient.effort.toFixed(0) : '—'}</strong></div>
      </div>
    </article>
  )
}


export function InstructorLiveRoom({ role, members }: { role: SessionRole; members: SessionMemberRow[] }) {
  const [now, setNow] = useState(() => Date.now())
  const [collapsed, setCollapsed] = useState(() => loadPanelCollapsed('instructor-live-room'))
  const toggleCollapsed = () => setCollapsed((current) => {
    const next = !current
    savePanelCollapsed('instructor-live-room', next)
    return next
  })
  useEffect(() => {
    if (role !== 'instructor') return
    const timer = window.setInterval(() => setNow(Date.now()), 5000)
    return () => window.clearInterval(timer)
  }, [role])

  const candidates = useMemo(() => members.filter((member) => member.role === 'candidate'), [members])
  const onlineCandidates = candidates.filter((member) => {
    const lastSeen = new Date(member.last_seen).getTime()
    return Number.isFinite(lastSeen) && now - lastSeen <= 30000
  }).length

  if (role !== 'instructor') return null

  return (
    <section className={`candidate-roster instructor-live-room ${collapsed ? 'panel-collapsed' : ''}`} aria-label="Candidates">
      <div className="candidate-roster-heading">
        <div><span className="session-kicker">Live room</span><h3>Candidates</h3></div>
        <div className="collapsible-heading-actions">
          <span>{onlineCandidates}/{candidates.length} online</span>
          <button className="panel-collapse-button" type="button" onClick={toggleCollapsed} aria-expanded={!collapsed} aria-label={collapsed ? 'Expand candidates' : 'Collapse candidates'} title={collapsed ? 'Expand candidates' : 'Collapse candidates'}>{collapsed ? '▾' : '▴'}</button>
        </div>
      </div>
      {candidates.length ? (
        <div className="candidate-card-list">
          {candidates.map((member) => <CandidateCard key={member.id} member={member} now={now} />)}
        </div>
      ) : (
        <div className="candidate-empty-state">No candidates have joined yet. Keep this dashboard open while candidates enter the session key.</div>
      )}
    </section>
  )
}

export function SessionPanel({
  role,
  instructorAuthenticated,
  simulatorExpanded,
  onSimulatorExpandedChange,
  connection,
  localRuntimeConnection,
  localRuntimeUrl,
  runtimeTransportKind,
  session,
  simulationPaused,
  onSimulationPausedChange,
  members,
  error,
  recoverableInstructor,
  recoverableCandidate,
  currentScenario,
  onLoadScenario,
  onStartInstructor,
  onResumeInstructor,
  onJoinCandidate,
  onResumeCandidate,
  onLeaveSession,
  onEndInstructorSession,
  onUpdatePolicy,
  onBroadcastNow,
}: SessionPanelProps) {
  const [sessionControlsExpanded, setSessionControlsExpanded] = useState(false)
  const [candidateCollapsed, setCandidateCollapsed] = useState(true)
  const [dashboardCollapsed, setDashboardCollapsed] = useState(() => loadPanelCollapsed('instructor-dashboard'))
  const toggleDashboardCollapsed = () => setDashboardCollapsed((current) => {
    const next = !current
    savePanelCollapsed('instructor-dashboard', next)
    return next
  })
  const [now, setNow] = useState(() => Date.now())
  const [startWizardOpen, setStartWizardOpen] = useState(false)
  const [startPresets, setStartPresets] = useState<InstructorPresetRow[]>([])
  const [selectedStartPresetId, setSelectedStartPresetId] = useState('')
  const [startPresetsBusy, setStartPresetsBusy] = useState(false)
  const [startPresetMessage, setStartPresetMessage] = useState<string | null>(null)


  useEffect(() => {
    if (role === 'candidate') setCandidateCollapsed(true)
  }, [role, session?.id])

  useEffect(() => {
    const body = document.body
    const instructorMode = role === 'instructor'
    body.classList.toggle('eduvent-instructor-mode', instructorMode)
    body.classList.toggle('eduvent-instructor-simulator-open', instructorMode && simulatorExpanded)
    return () => {
      body.classList.remove('eduvent-instructor-mode')
      body.classList.remove('eduvent-instructor-simulator-open')
    }
  }, [role, simulatorExpanded])

  useEffect(() => {
    if (role !== 'instructor' && simulatorExpanded) onSimulatorExpandedChange(false)
  }, [role, simulatorExpanded, onSimulatorExpandedChange])

  useEffect(() => {
    if (role !== 'instructor') return
    const timer = window.setInterval(() => setNow(Date.now()), 5000)
    return () => window.clearInterval(timer)
  }, [role])


  const candidates = useMemo(() => members.filter((member) => member.role === 'candidate'), [members])
  const onlineCandidates = candidates.filter((member) => {
    const lastSeen = new Date(member.last_seen).getTime()
    return Number.isFinite(lastSeen) && now - lastSeen <= 30000
  }).length

  const candidateJoinUrl = useMemo(() => {
    if (!session?.session_key || typeof window === 'undefined') return ''
    const url = new URL(window.location.href)
    url.search = ''
    url.hash = ''
    url.searchParams.set('session', session.session_key)
    return url.toString()
  }, [session?.session_key])

  const selectedStartPreset = useMemo(
    () => startPresets.find((preset) => preset.id === selectedStartPresetId) ?? null,
    [startPresets, selectedStartPresetId],
  )

  const openInstructorStart = async () => {
    if (!instructorAuthenticated) return
    setStartWizardOpen(true)
    setSelectedStartPresetId('')
    setStartPresets([])
    setStartPresetMessage(null)
    setStartPresetsBusy(true)
    try {
      const account = await getInstructorAccount()
      if (!account) {
        setStartPresetMessage('Current setup is ready. Sign in to the instructor cloud account to start from a saved scenario.')
        return
      }
      const presets = (await listInstructorPresets()).filter((preset) => (preset.scenario.kind ?? 'static') === 'static')
      setStartPresets(presets)
      if (presets.length) setSelectedStartPresetId(presets[0].id)
      else setStartPresetMessage('No static scenarios are saved yet. You can start from the current setup.')
    } catch (cause) {
      setStartPresetMessage(cause instanceof Error ? cause.message : 'Unable to load saved scenarios.')
    } finally {
      setStartPresetsBusy(false)
    }
  }

  const loadSelectedScenarioIntoStandalone = () => {
    if (!selectedStartPreset) return
    onLoadScenario(selectedStartPreset.scenario)
    setStartWizardOpen(false)
  }

  const summaryFor = (scenario: InstructorScenarioSnapshot) => [
    scenario.ventilator.mode,
    `FiO₂ ${Math.round(scenario.ventilator.fio2 * 100)}%`,
    `PEEP ${scenario.ventilator.peep}`,
    `RR ${scenario.ventilator.rate}`,
    `C ${scenario.patient.compliance.toFixed(0)}`,
    `R ${scenario.patient.resistance.toFixed(0)}`,
    `Shunt ${Math.round((scenario.patient.shuntFraction ?? 0.03) * 100)}%`,
    `Media ${scenario.mediaIds?.length ?? 0}`,
  ]

  if (role === 'standalone') {
    return (
      <section className="session-panel standalone-session-panel">
        <div className="session-panel-heading">
          <div><span className="session-kicker">Teaching</span><h2>Session mode</h2></div>
          <span className="session-role-pill">Standalone</span>
        </div>
        {startWizardOpen ? (
          <SharedInstructorStartWizard config={{ currentTitle: `${currentScenario.ventilator.mode} · FiO₂ ${Math.round(currentScenario.ventilator.fio2 * 100)}% · PEEP ${currentScenario.ventilator.peep}`, currentSummary: 'Configure the patient and ventilator in standalone mode before opening the room.', currentChips: summaryFor(currentScenario), savedOptions: startPresets.map((preset) => ({ id: preset.id, title: preset.name, summary: summaryFor(preset.scenario).slice(0, 3).join(' · '), chips: summaryFor(preset.scenario) })), selectedSavedId: selectedStartPresetId, onSelectedSavedIdChange: setSelectedStartPresetId, savedBusy: startPresetsBusy, savedMessage: startPresetMessage, onStartCurrent: () => onStartInstructor(), onStartSaved: async (id) => { const preset = startPresets.find((item) => item.id === id); if (preset) await onStartInstructor(preset.scenario) }, onLoadSaved: (id) => { const preset = startPresets.find((item) => item.id === id); if (preset) { onLoadScenario(preset.scenario); setStartWizardOpen(false) } } }} onClose={() => setStartWizardOpen(false)} />
        ) : (
          <SharedSessionLauncher
            instructorAuthenticated={instructorAuthenticated}
            connection={connection}
            error={error}
            recoverableInstructor={recoverableInstructor}
            recoverableCandidate={recoverableCandidate}
            onStartInstructor={() => void openInstructorStart()}
            onResumeInstructor={onResumeInstructor}
            onJoinCandidate={onJoinCandidate}
            onResumeCandidate={onResumeCandidate}
          />
        )}
        {connection === 'connecting' && <ConnectionBadge connection={connection} />}
      </section>
    )
  }

  if (role === 'instructor') {
    return (
      <section className={`session-panel instructor-session-panel ${simulatorExpanded ? 'simulator-expanded' : 'simulator-collapsed'} ${dashboardCollapsed ? 'panel-collapsed' : ''}`}>
        <div className="session-panel-heading">
          <div><span className="session-kicker">Teaching</span><h2>Instructor dashboard</h2></div>
          <div className="collapsible-heading-actions">
            <ConnectionBadge connection={connection} />
            <RuntimeTransportBadge connection={localRuntimeConnection} url={localRuntimeUrl} kind={runtimeTransportKind} />
            <button className={`teaching-workspace-collapse ${dashboardCollapsed ? 'collapsed' : 'expanded'}`} type="button" onClick={toggleDashboardCollapsed} aria-expanded={!dashboardCollapsed} aria-label={dashboardCollapsed ? 'Expand instructor dashboard' : 'Collapse instructor dashboard'} title={dashboardCollapsed ? 'Expand instructor dashboard' : 'Collapse instructor dashboard'}><span className="teaching-collapse-caret" aria-hidden="true" /></button>
          </div>
        </div>

        <div className="instructor-dashboard-summary">
          <div className="session-key-card session-share-card">
            <div className="session-key-details">
              <span>Candidate session key</span>
              <strong>{session?.session_key ?? '———'}</strong>
              <small>Scan the QR code or enter this key manually.</small>
              {candidateJoinUrl && session?.session_key && (
                <CandidateInvitation sessionId={session.id} sessionKey={session.session_key} joinUrl={candidateJoinUrl} />
              )}
            </div>
          </div>
          <div className="candidate-count-card">
            <span>Candidates</span>
            <strong>{onlineCandidates}<small> online</small></strong>
            <em>{candidates.length} joined</em>
          </div>
        </div>

        {simulationPaused && <div className="instructor-pause-banner">All candidate simulations are paused by the instructor.</div>}

        <div className="instructor-session-controls">
          <button
            type="button"
            className="instructor-session-controls-toggle"
            onClick={() => setSessionControlsExpanded((value) => !value)}
            aria-expanded={sessionControlsExpanded}
          >
            <span>
              <strong>Sharing & alarm controls</strong>
              <small>Patient • Ventilator • Alarms</small>
            </span>
            <b>{sessionControlsExpanded ? 'Collapse' : 'Configure'}</b>
          </button>

          {sessionControlsExpanded && (
            <div className="session-domain-grid instructor-domain-grid">
              <div className={`session-domain-card ${session?.sync_patient ? 'shared' : ''}`}>
                <div className="session-domain-title"><strong>Patient</strong><span>{session?.sync_patient ? 'Shared' : 'Local'}</span></div>
                <label className="session-switch-row session-switch-row-emphasis">
                  <span>Show Controls view to candidate</span>
                  <input type="checkbox" checked={session?.candidate_controls_visible !== false} onChange={(event) => void onUpdatePolicy({ candidateControlsVisible: event.target.checked })} />
                </label>
                <label className="session-switch-row">
                  <span>Share patient settings</span>
                  <input type="checkbox" checked={Boolean(session?.sync_patient)} onChange={(event) => void onUpdatePolicy({ syncPatient: event.target.checked })} />
                </label>
                <label className="session-switch-row">
                  <span>Candidate may change</span>
                  <input type="checkbox" checked={Boolean(session?.candidate_can_edit_patient)} disabled={!session?.sync_patient} onChange={(event) => void onUpdatePolicy({ candidateCanEditPatient: event.target.checked })} />
                </label>
                <label className="session-switch-row">
                  <span>Show patient effort to candidate</span>
                  <input type="checkbox" checked={Boolean(session?.show_patient_effort)} onChange={(event) => void onUpdatePolicy({ showPatientEffort: event.target.checked })} />
                </label>
              </div>

              <div className={`session-domain-card ${session?.sync_ventilator ? 'shared' : ''}`}>
                <div className="session-domain-title"><strong>Ventilator</strong><span>{session?.sync_ventilator ? 'Shared' : 'Local'}</span></div>
                <label className="session-switch-row">
                  <span>Share ventilator settings</span>
                  <input type="checkbox" checked={Boolean(session?.sync_ventilator)} onChange={(event) => void onUpdatePolicy({ syncVentilator: event.target.checked })} />
                </label>
                <label className="session-switch-row">
                  <span>Candidate may change</span>
                  <input type="checkbox" checked={Boolean(session?.candidate_can_edit_ventilator)} disabled={!session?.sync_ventilator} onChange={(event) => void onUpdatePolicy({ candidateCanEditVentilator: event.target.checked })} />
                </label>
                <label className="session-switch-row">
                  <span>Candidate may change waveforms</span>
                  <input type="checkbox" checked={Boolean(session?.candidate_can_edit_waveforms)} onChange={(event) => void onUpdatePolicy({ candidateCanEditWaveforms: event.target.checked })} />
                </label>
                <label className="session-switch-row">
                  <span>Allow oesophageal pressure</span>
                  <input type="checkbox" checked={Boolean(session?.allow_oesophageal_pressure)} onChange={(event) => void onUpdatePolicy({ allowOesophagealPressure: event.target.checked })} />
                </label>
              </div>

              <div className={`session-domain-card ${session?.sync_alarms ? 'shared' : ''}`}>
                <div className="session-domain-title"><strong>Alarms</strong><span>{session?.sync_alarms ? 'Shared' : 'Local'}</span></div>
                <label className="session-switch-row">
                  <span>Share alarm settings</span>
                  <input type="checkbox" checked={Boolean(session?.sync_alarms)} onChange={(event) => void onUpdatePolicy({ syncAlarms: event.target.checked })} />
                </label>
                <label className="session-switch-row">
                  <span>Candidate may change</span>
                  <input type="checkbox" checked={Boolean(session?.candidate_can_edit_alarms)} disabled={!session?.sync_alarms} onChange={(event) => void onUpdatePolicy({ candidateCanEditAlarms: event.target.checked })} />
                </label>
                <label className="session-switch-row session-switch-row-emphasis">
                  <span>Keep candidate alarms silent</span>
                  <input type="checkbox" checked={Boolean(session?.alarms_silent)} disabled={!session?.sync_alarms} onChange={(event) => void onUpdatePolicy({ alarmsSilent: event.target.checked })} />
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="session-action-row">
          <button type="button" className={simulationPaused ? 'session-primary-button' : 'session-secondary-button'} aria-pressed={simulationPaused} onClick={() => onSimulationPausedChange(!simulationPaused)}>{simulationPaused ? 'Resume all simulations' : 'Pause all simulations'}</button>
          <button type="button" className="session-secondary-button" onClick={() => void onBroadcastNow()}>Push current settings</button>
          <button type="button" className="session-danger-button" onClick={() => void onEndInstructorSession()}>End session</button>
        </div>
        {error && <div className="session-error" role="alert">{error}</div>}
      </section>
    )
  }

  return (
    <section className={`session-panel candidate-session-panel ${candidateCollapsed ? 'candidate-mobile-collapsed' : ''}`}>
      <div className="session-panel-heading">
        <div><span className="session-kicker">Teaching</span><h2>Candidate session</h2></div>
        <div className="candidate-session-heading-actions">
          <div className="session-transport-badges">
            <ConnectionBadge connection={connection} />
            <RuntimeTransportBadge connection={localRuntimeConnection} url={localRuntimeUrl} kind={runtimeTransportKind} />
          </div>
          <button
            className="panel-collapse-button candidate-session-collapse-button"
            type="button"
            onClick={() => setCandidateCollapsed((value) => !value)}
            aria-expanded={!candidateCollapsed}
            aria-label={candidateCollapsed ? 'Expand candidate session' : 'Collapse candidate session'}
            title={candidateCollapsed ? 'Expand candidate session' : 'Collapse candidate session'}
          >{candidateCollapsed ? '▾' : '▴'}</button>
        </div>
      </div>
      <div className="candidate-session-body">
        <div className="candidate-session-summary">
          <span>Session <strong>{session?.session_key ?? '———'}</strong></span>
          <div className="candidate-control-status">
            <span className={session?.sync_patient && !session?.candidate_can_edit_patient ? 'locked' : 'available'}>
              Patient: {session?.sync_patient ? (session.candidate_can_edit_patient ? 'shared / editable' : 'instructor controlled') : 'candidate local'}
            </span>
            <span className={session?.sync_ventilator && !session?.candidate_can_edit_ventilator ? 'locked' : 'available'}>
              Ventilator: {session?.sync_ventilator ? (session.candidate_can_edit_ventilator ? 'shared / editable' : 'instructor controlled') : 'candidate local'}
            </span>
            <span className={!session?.candidate_can_edit_waveforms ? 'locked' : 'available'}>
              Waveforms: {session?.candidate_can_edit_waveforms ? 'editable' : 'instructor locked'} • Oesophageal pressure: {session?.allow_oesophageal_pressure ? 'available' : 'hidden'}
            </span>
            <span className={session?.sync_alarms && !session?.candidate_can_edit_alarms ? 'locked' : 'available'}>
              Alarms: {session?.sync_alarms ? (session.candidate_can_edit_alarms ? 'shared / editable' : 'instructor controlled') : 'candidate local'}{session?.sync_alarms && session?.alarms_silent ? ' / silent' : ''}
            </span>
          </div>
        </div>
        {simulationPaused && <div className="session-warning">Simulation paused by instructor. The instructor controls when it resumes.</div>}
        {connection === 'reconnecting' && <div className="session-warning">Connection lost. Simulation continues with the last received settings while EDUVENT reconnects.</div>}
        {error && <div className="session-error" role="alert">{error}</div>}
        <button type="button" className="session-secondary-button" onClick={() => void onLeaveSession()}>Leave session</button>
      </div>
    </section>
  )
}
