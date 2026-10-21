import { useEffect, useMemo, useState } from 'react'
import { SharedBasicSessionPanel, type SharedInstructorDashboardConfig } from '../teaching/session'
import type { RuntimeTransportKind, SessionConnection, SessionRole } from '../session/useTeachingSession'
import type { LocalRuntimeConnection } from '../session/localRuntimeTransport'
import type { SessionMemberRow, TeachingSessionRow } from '../session/supabase'
import type { PatientSettings, VentilatorSettings } from '../simulation/types'
import type { InstructorScenarioSnapshot } from '../instructorAccount'
import { useEduventScenarioLibrary } from '../teaching/scenario/useEduventScenarioLibrary'

interface EduventSessionPanelProps {
  role: SessionRole
  instructorAuthenticated: boolean
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

function hasVentilatorSettings(value: SessionMemberRow['ventilator_settings']): value is VentilatorSettings {
  return Boolean(value && typeof value === 'object' && 'mode' in value)
}
function hasPatientSettings(value: SessionMemberRow['patient_settings']): value is PatientSettings {
  return Boolean(value && typeof value === 'object' && 'compliance' in value)
}

function RuntimeTransportBadge({ connection, url, kind }: { connection: LocalRuntimeConnection; url: string | null; kind: RuntimeTransportKind }) {
  if (connection === 'disabled' || kind === 'cloud') return null
  const name = kind === 'webrtc' ? 'P2P' : kind === 'appliance' ? 'EDUVENT box' : 'LAN server'
  const label = connection === 'connected' ? `${name} live` : connection === 'connecting' ? `${name} connecting…` : connection === 'reconnecting' ? `${name} reconnecting…` : `${name} unavailable`
  return <span className={`local-runtime-badge ${connection}`} title={kind === 'webrtc' ? 'Direct WebRTC DataChannel; Supabase signalling/fallback' : (url ?? 'Local runtime relay')}><i />{label}</span>
}

function summaryFor(scenario: InstructorScenarioSnapshot) {
  return [scenario.ventilator.mode, `FiO₂ ${Math.round(scenario.ventilator.fio2 * 100)}%`, `PEEP ${scenario.ventilator.peep}`, `RR ${scenario.ventilator.rate}`, `C ${scenario.patient.compliance.toFixed(0)}`, `R ${scenario.patient.resistance.toFixed(0)}`, `Shunt ${Math.round((scenario.patient.shuntFraction ?? 0.03) * 100)}%`, `Media ${scenario.mediaIds?.length ?? 0}`]
}

export function EduventSessionPanel(props: EduventSessionPanelProps) {
  const library = useEduventScenarioLibrary(props.instructorAuthenticated)
  const staticPresets = useMemo(() => library.items.filter((preset) => (preset.scenario.kind ?? 'static') === 'static'), [library.items])
  const [selectedId, setSelectedId] = useState('')
  useEffect(() => { setSelectedId((current) => staticPresets.some((row) => row.id === current) ? current : (staticPresets[0]?.id ?? '')) }, [staticPresets])
  const session = props.session
  const dashboard: SharedInstructorDashboardConfig = {
    runtimeBadge: <RuntimeTransportBadge connection={props.localRuntimeConnection} url={props.localRuntimeUrl} kind={props.runtimeTransportKind} />,
    simulationPaused: props.simulationPaused,
    onSimulationPausedChange: props.onSimulationPausedChange,
    pausedMessage: 'All candidate simulations are paused by the instructor.',
    onBroadcastNow: props.onBroadcastNow,
    collapseStorageKey: 'eduvent-instructor-dashboard',
    domains: session ? [
      { id: 'patient', title: 'Patient', status: session.sync_patient ? 'Shared' : 'Local', active: Boolean(session.sync_patient), rows: [
        { id: 'controls', label: 'Show Controls view to candidate', checked: session.candidate_controls_visible !== false, emphasis: true, onChange: (checked) => props.onUpdatePolicy({ candidateControlsVisible: checked }) },
        { id: 'share', label: 'Share patient settings', checked: Boolean(session.sync_patient), onChange: (checked) => props.onUpdatePolicy({ syncPatient: checked }) },
        { id: 'edit', label: 'Candidate may change', checked: Boolean(session.candidate_can_edit_patient), disabled: !session.sync_patient, onChange: (checked) => props.onUpdatePolicy({ candidateCanEditPatient: checked }) },
        { id: 'effort', label: 'Show patient effort to candidate', checked: Boolean(session.show_patient_effort), onChange: (checked) => props.onUpdatePolicy({ showPatientEffort: checked }) },
      ]},
      { id: 'ventilator', title: 'Ventilator', status: session.sync_ventilator ? 'Shared' : 'Local', active: Boolean(session.sync_ventilator), rows: [
        { id: 'share', label: 'Share ventilator settings', checked: Boolean(session.sync_ventilator), onChange: (checked) => props.onUpdatePolicy({ syncVentilator: checked }) },
        { id: 'edit', label: 'Candidate may change', checked: Boolean(session.candidate_can_edit_ventilator), disabled: !session.sync_ventilator, onChange: (checked) => props.onUpdatePolicy({ candidateCanEditVentilator: checked }) },
        { id: 'waveforms', label: 'Candidate may change waveforms', checked: Boolean(session.candidate_can_edit_waveforms), onChange: (checked) => props.onUpdatePolicy({ candidateCanEditWaveforms: checked }) },
        { id: 'pes', label: 'Allow oesophageal pressure', checked: Boolean(session.allow_oesophageal_pressure), onChange: (checked) => props.onUpdatePolicy({ allowOesophagealPressure: checked }) },
      ]},
      { id: 'alarms', title: 'Alarms', status: session.sync_alarms ? 'Shared' : 'Local', active: Boolean(session.sync_alarms), rows: [
        { id: 'share', label: 'Share alarm settings', checked: Boolean(session.sync_alarms), onChange: (checked) => props.onUpdatePolicy({ syncAlarms: checked }) },
        { id: 'edit', label: 'Candidate may change', checked: Boolean(session.candidate_can_edit_alarms), disabled: !session.sync_alarms, onChange: (checked) => props.onUpdatePolicy({ candidateCanEditAlarms: checked }) },
        { id: 'silent', label: 'Keep candidate alarms silent', checked: Boolean(session.alarms_silent), disabled: !session.sync_alarms, emphasis: true, onChange: (checked) => props.onUpdatePolicy({ alarmsSilent: checked }) },
      ]},
    ] : [],
    candidateStatus: session ? <div className="candidate-control-status">
      <span className={session.sync_patient && !session.candidate_can_edit_patient ? 'locked' : 'available'}>Patient: {session.sync_patient ? (session.candidate_can_edit_patient ? 'shared / editable' : 'instructor controlled') : 'candidate local'}</span>
      <span className={session.sync_ventilator && !session.candidate_can_edit_ventilator ? 'locked' : 'available'}>Ventilator: {session.sync_ventilator ? (session.candidate_can_edit_ventilator ? 'shared / editable' : 'instructor controlled') : 'candidate local'}</span>
      <span className={!session.candidate_can_edit_waveforms ? 'locked' : 'available'}>Waveforms: {session.candidate_can_edit_waveforms ? 'editable' : 'instructor locked'} • Oesophageal pressure: {session.allow_oesophageal_pressure ? 'available' : 'hidden'}</span>
      <span className={session.sync_alarms && !session.candidate_can_edit_alarms ? 'locked' : 'available'}>Alarms: {session.sync_alarms ? (session.candidate_can_edit_alarms ? 'shared / editable' : 'instructor controlled') : 'candidate local'}{session.sync_alarms && session.alarms_silent ? ' / silent' : ''}</span>
    </div> : null,
  }

  return <SharedBasicSessionPanel
    role={props.role}
    instructorAuthenticated={props.instructorAuthenticated}
    connection={props.connection}
    error={props.error}
    recoverableInstructor={props.recoverableInstructor}
    recoverableCandidate={props.recoverableCandidate}
    onStartInstructor={props.onStartInstructor}
    onResumeInstructor={props.onResumeInstructor}
    onJoinCandidate={props.onJoinCandidate}
    onResumeCandidate={props.onResumeCandidate}
    session={props.session}
    members={props.members}
    onLeaveSession={props.onLeaveSession}
    onEndInstructorSession={props.onEndInstructorSession}
    productId="eduvent"
    productLabel="EDUVENT"
    productDescription="mechanical ventilation simulator"
    instructorDashboard={dashboard}
    instructorStart={{
      currentTitle: `${props.currentScenario.ventilator.mode} · FiO₂ ${Math.round(props.currentScenario.ventilator.fio2 * 100)}% · PEEP ${props.currentScenario.ventilator.peep}`,
      currentSummary: 'Configure the patient and ventilator in standalone mode before opening the room.',
      currentChips: summaryFor(props.currentScenario),
      savedOptions: staticPresets.map((preset) => ({ id: preset.id, title: preset.name, summary: summaryFor(preset.scenario).slice(0, 3).join(' · '), chips: summaryFor(preset.scenario) })),
      selectedSavedId: selectedId,
      onSelectedSavedIdChange: setSelectedId,
      savedBusy: library.busy,
      savedMessage: library.message ?? (!library.busy && props.instructorAuthenticated && !staticPresets.length ? 'No static scenarios are saved yet. You can start from the current setup.' : null),
      onStartCurrent: () => props.onStartInstructor(),
      onStartSaved: async (id) => { const preset = staticPresets.find((row) => row.id === id); if (preset) await props.onStartInstructor(preset.scenario) },
      onLoadSaved: (id) => { const preset = staticPresets.find((row) => row.id === id); if (preset) props.onLoadScenario(preset.scenario) },
    }}
    renderCandidateTelemetry={(member) => {
      const row = member as SessionMemberRow
      const vent = hasVentilatorSettings(row.ventilator_settings) ? row.ventilator_settings : null
      const patient = hasPatientSettings(row.patient_settings) ? row.patient_settings : null
      return <div className="candidate-state-grid"><div><span>Mode</span><strong>{vent?.mode ?? '—'}</strong></div><div><span>FiO₂</span><strong>{vent ? `${Math.round(vent.fio2 * 100)}%` : '—'}</strong></div><div><span>PEEP</span><strong>{vent?.peep ?? '—'}</strong></div><div><span>RR set</span><strong>{vent?.rate ?? '—'}</strong></div><div><span>Compliance</span><strong>{patient ? patient.compliance.toFixed(0) : '—'}</strong></div><div><span>Rinsp</span><strong>{patient ? patient.resistance.toFixed(0) : '—'}</strong></div><div><span>Spont RR</span><strong>{patient ? patient.spontaneousRate.toFixed(0) : '—'}</strong></div><div><span>Effort</span><strong>{patient ? patient.effort.toFixed(0) : '—'}</strong></div></div>
    }}
  />
}
