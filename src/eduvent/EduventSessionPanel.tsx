import { useEffect, useMemo, useState } from 'react'
import { SharedBasicSessionPanel, buildProductInstructorDashboard, ProductCandidateTelemetry } from '../teaching/session'
import type { RuntimeTransportKind, SessionConnection, SessionRole } from '../session/useTeachingSession'
import type { LocalRuntimeConnection } from '../session/localRuntimeTransport'
import type { SessionMemberRow, TeachingSessionRow } from '../session/supabase'
import type { InstructorScenarioSnapshot } from '../instructorAccount'
import { useProductScenarioLibrary } from '../teaching/scenario/useProductScenarioLibrary'
import { EDUVENT_SCENARIO_CODEC } from './scenarioCodec'
import { getSimulationProduct } from '../core/products'

interface EduventSessionPanelProps {
  role: SessionRole
  instructorAuthenticated: boolean
  simulatorExpanded?: boolean
  onSimulatorExpandedChange?: (expanded: boolean) => void
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
  const staticPresets = useMemo(() => library.items.filter((preset) => (preset.scenario.kind ?? 'static') === 'static'), [library.items])
  const [selectedId, setSelectedId] = useState('')
  useEffect(() => { setSelectedId((current) => staticPresets.some((row) => row.id === current) ? current : (staticPresets[0]?.id ?? '')) }, [staticPresets])
  const session = props.session
  const product = getSimulationProduct('mv')
  const dashboard = buildProductInstructorDashboard(product, session, {
    onUpdatePolicy: (patch) => props.onUpdatePolicy(patch as Parameters<typeof props.onUpdatePolicy>[0]),
    runtimeBadge: <RuntimeTransportBadge connection={props.localRuntimeConnection} url={props.localRuntimeUrl} kind={props.runtimeTransportKind} />,
    simulationPaused: props.simulationPaused,
    onSimulationPausedChange: props.onSimulationPausedChange,
    pausedMessage: 'All candidate simulations are paused by the instructor.',
    onBroadcastNow: props.onBroadcastNow,
    collapseStorageKey: 'mv-instructor-dashboard',
  })

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
    productId="mv"
    productLabel="LoppjuSIM-MV"
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
    renderCandidateTelemetry={(member) => <ProductCandidateTelemetry product={product} member={member} />}
  />
}
