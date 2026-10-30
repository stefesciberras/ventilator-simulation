import { useEffect, useMemo, useState } from 'react'
import { SharedBasicSessionPanel, buildProductInstructorDashboard, ProductCandidateTelemetry } from '../teaching/session'
import type { RuntimeTransportKind, SessionConnection, SessionRole } from '../session/useTeachingSession'
import {
  getPreferredLocalSessionRuntimeMode,
  savePreferredLocalSessionRuntimeMode,
  type LocalRuntimeConnection,
  type LocalSessionRuntimeMode,
} from '../session/localRuntimeTransport'
import type { SessionMemberRow, TeachingSessionRow } from '../session/supabase'
import type { InstructorScenarioSnapshot } from '../instructorAccount'
import { useProductScenarioLibrary } from '../teaching/scenario/useProductScenarioLibrary'
import { EDUVENT_SCENARIO_CODEC } from './scenarioCodec'
import { getSimulationProduct } from '../core/products'

const PENDING_TEACHING_DYNAMIC_SCENARIO_KEY = 'loppjusim.mv.pendingTeachingDynamicScenario'

interface EduventSessionPanelProps {
  role: SessionRole
  instructorAuthenticated: boolean
  simulatorExpanded?: boolean
  onSimulatorExpandedChange?: (expanded: boolean) => void
  connection: SessionConnection
  localRuntimeConnection: LocalRuntimeConnection
  localRuntimeUrl: string | null
  runtimeTransportKind: RuntimeTransportKind
  runtimeMode?: 'standalone' | LocalSessionRuntimeMode
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

function RuntimeTransportBadge({ connection, url, kind }: { connection: LocalRuntimeConnection; url: string | null; kind: RuntimeTransportKind }) {
  if (connection === 'disabled' || kind === 'cloud') return null
  const name = kind === 'webrtc' ? 'P2P' : kind === 'appliance' ? 'LoppjuSIM box' : 'LAN server'
  const label = connection === 'connected' ? `${name} live` : connection === 'connecting' ? `${name} connecting…` : connection === 'reconnecting' ? `${name} reconnecting…` : `${name} unavailable`
  return <span className={`local-runtime-badge ${connection}`} title={kind === 'webrtc' ? 'Direct WebRTC DataChannel; Supabase signalling/fallback' : (url ?? 'Local runtime relay')}><i />{label}</span>
}

function summaryFor(scenario: InstructorScenarioSnapshot) {
  return [scenario.ventilator.mode, `FiO₂ ${Math.round(scenario.ventilator.fio2 * 100)}%`, `PEEP ${scenario.ventilator.peep}`, `RR ${scenario.ventilator.rate}`, `C ${scenario.patient.compliance.toFixed(0)}`, `R ${scenario.patient.resistance.toFixed(0)}`, `Shunt ${Math.round((scenario.patient.shuntFraction ?? 0.03) * 100)}%`, `Media ${scenario.mediaIds?.length ?? 0}`]
}

export function EduventSessionPanel(props: EduventSessionPanelProps) {
  const library = useProductScenarioLibrary<InstructorScenarioSnapshot>('mv', props.instructorAuthenticated, EDUVENT_SCENARIO_CODEC)
  const presets = library.items
  const [selectedId, setSelectedId] = useState('')
  const [launchMode, setLaunchMode] = useState<LocalSessionRuntimeMode>(() => getPreferredLocalSessionRuntimeMode())
  useEffect(() => { setSelectedId((current) => presets.some((row) => row.id === current) ? current : (presets[0]?.id ?? '')) }, [presets])
  useEffect(() => {
    if (launchMode === 'simulation' && !props.localRuntimeUrl) setLaunchMode('teaching')
  }, [launchMode, props.localRuntimeUrl])

  const session = props.session
  const product = getSimulationProduct('mv')
  const activeMode = props.runtimeMode === 'simulation' ? 'Simulation' : 'Teaching'
  const dashboard = buildProductInstructorDashboard(product, session, {
    onUpdatePolicy: (patch) => props.onUpdatePolicy(patch as Parameters<typeof props.onUpdatePolicy>[0]),
    runtimeBadge: <RuntimeTransportBadge connection={props.localRuntimeConnection} url={props.localRuntimeUrl} kind={props.runtimeTransportKind} />,
    simulationPaused: props.simulationPaused,
    onSimulationPausedChange: props.onSimulationPausedChange,
    pausedMessage: props.runtimeMode === 'simulation' ? 'The shared simulation is paused.' : 'All candidate simulations are paused by the instructor.',
    onBroadcastNow: props.onBroadcastNow,
    collapseStorageKey: 'mv-instructor-dashboard',
  })

  const selectLaunchMode = (mode: LocalSessionRuntimeMode) => {
    setLaunchMode(mode)
    savePreferredLocalSessionRuntimeMode(mode)
  }
  const startWithSelectedMode = async (scenario?: InstructorScenarioSnapshot) => {
    savePreferredLocalSessionRuntimeMode(launchMode)
    await props.onStartInstructor(scenario)
  }

  const startSavedScenario = async (id: string) => {
    const preset = presets.find((row) => row.id === id)
    if (!preset) return
    if (preset.scenario.kind === 'dynamic') {
      try { window.sessionStorage.setItem(PENDING_TEACHING_DYNAMIC_SCENARIO_KEY, preset.id) } catch { /* optional handoff */ }
    }
    await startWithSelectedMode(preset.scenario)
  }

  const modeSelector = props.role === 'standalone' ? <section className="session-panel standalone-session-panel">
    <div className="session-panel-heading">
      <div><span className="session-kicker">Runtime</span><h2>Choose session mode</h2></div>
      <span className="session-role-pill">{launchMode === 'simulation' ? 'Simulation' : 'Teaching'}</span>
    </div>
    <div className="session-start-source-tabs">
      <button type="button" className={launchMode === 'simulation' ? 'selected' : ''} disabled={!props.localRuntimeUrl} onClick={() => selectLaunchMode('simulation')}>Simulation</button>
      <button type="button" className={launchMode === 'teaching' ? 'selected' : ''} onClick={() => selectLaunchMode('teaching')}>Teaching</button>
    </div>
    <p className="session-start-note">
      {launchMode === 'simulation'
        ? 'One instructor and one candidate control the same shared simulator. Candidate device changes are reflected back to the instructor.'
        : 'One instructor can teach one or more candidates. Each candidate keeps an independent simulator runtime.'}
    </p>
    {!props.localRuntimeUrl && <p className="session-start-note">Simulation mode is local-first and is enabled when LoppjuSIM-MV is connected to the LAN session server or LoppjuSIM box.</p>}
  </section> : null

  return <>
    {modeSelector}
    <SharedBasicSessionPanel
      role={props.role}
      instructorAuthenticated={props.instructorAuthenticated}
      connection={props.connection}
      error={props.error}
      recoverableInstructor={props.recoverableInstructor}
      recoverableCandidate={props.recoverableCandidate}
      onStartInstructor={() => startWithSelectedMode()}
      onResumeInstructor={props.onResumeInstructor}
      onJoinCandidate={props.onJoinCandidate}
      onResumeCandidate={props.onResumeCandidate}
      session={props.session}
      members={props.members}
      onLeaveSession={props.onLeaveSession}
      onEndInstructorSession={props.onEndInstructorSession}
      productId="mv"
      productLabel="LoppjuSIM-MV"
      productDescription="mechanical ventilation simulator"
      instructorDashboard={dashboard}
      title={props.role === 'standalone' ? `${launchMode === 'simulation' ? 'Simulation' : 'Teaching'} session` : `${activeMode} session`}
      instructorStart={{
        currentTitle: `${props.currentScenario.ventilator.mode} · FiO₂ ${Math.round(props.currentScenario.ventilator.fio2 * 100)}% · PEEP ${props.currentScenario.ventilator.peep}`,
        currentSummary: `Configure the patient and ventilator before opening the ${launchMode === 'simulation' ? 'shared simulation' : 'teaching room'}.`,
        currentChips: summaryFor(props.currentScenario),
        savedOptions: presets.map((preset) => ({ id: preset.id, title: preset.name, kind: preset.scenario.kind === 'dynamic' ? 'dynamic' : 'static', summary: preset.scenario.description || summaryFor(preset.scenario).slice(0, 3).join(' · '), chips: summaryFor(preset.scenario) })),
        selectedSavedId: selectedId,
        onSelectedSavedIdChange: setSelectedId,
        savedBusy: library.busy,
        savedMessage: library.message ?? (!library.busy && props.instructorAuthenticated && !presets.length ? 'No scenarios are saved yet. You can start from the current setup.' : null),
        onStartCurrent: () => startWithSelectedMode(),
        onStartSaved: startSavedScenario,
        onLoadSaved: (id) => { const preset = presets.find((row) => row.id === id); if (preset && preset.scenario.kind !== 'dynamic') props.onLoadScenario(preset.scenario) },
      }}
      renderCandidateTelemetry={(member) => <ProductCandidateTelemetry product={product} member={member} />}
    />
  </>
}
