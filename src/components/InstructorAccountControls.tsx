import { useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { SessionRole } from '../session/useTeachingSession'
import { savePreferredLocalSessionRuntimeMode } from '../session/localRuntimeTransport'
import type { PhysiologicalMeasurements } from '../physiologyMeasurements'
import type { SessionMemberRow } from '../session/supabase'
import { asStaticScenario, type DynamicScenarioActionId, type InstructorPresetRow, type InstructorScenarioSnapshot } from '../instructorAccount'
import { APP_VERSION } from '../appVersion'
import { InstructorAccountButton, InstructorAccountDialog, useInstructorAccountAuth } from './InstructorAccountAuth'
import { useProductScenarioLibrary } from '../teaching/scenario/useProductScenarioLibrary'
import { EDUVENT_SCENARIO_CODEC } from '../eduvent/scenarioCodec'
import { InstructorWorkspace } from '../teaching/instructor/InstructorWorkspace'
import { InstructorSettingsController } from '../teaching/instructor/InstructorSettingsController'
import { InstructorScenarioLibraryController } from '../teaching/instructor/InstructorScenarioLibraryController'
import { useEduventInstructorScenarioRuntime, type EduventDynamicScenarioDiagnosticContext } from '../eduvent/useEduventInstructorScenarioRuntime'
import { configureSessionLogRuntime, diffSessionState, recordSessionLogEvent, settingChangesLabel } from '../teaching/session/sessionLog'
import { clearScenarioLogs } from '../scenario-logger'
import '../account.css'

export type DynamicScenarioDiagnosticContext = EduventDynamicScenarioDiagnosticContext

interface InstructorAccountControlsProps {
  role: SessionRole
  sessionId: string | null
  currentScenario: InstructorScenarioSnapshot
  onLoadScenario: (scenario: InstructorScenarioSnapshot, options?: { pauseSimulation?: boolean; resetScenarioClock?: boolean; stageTransition?: import('../instructorAccount').DynamicScenarioStage }) => void
  simulationPaused: boolean
  onSimulationPausedChange: (paused: boolean) => void
  physiologyMeasurements: PhysiologicalMeasurements
  scenarioElapsedSeconds: number
  sessionMembers: SessionMemberRow[]
  runtimeHost: HTMLElement | null
  onStartInstructorSession: (scenario?: InstructorScenarioSnapshot) => Promise<void>
  onAccountConnectionChange?: (connected: boolean) => void
  onDynamicScenarioStarted?: () => void
  onStaticScenarioLoaded?: (name: string) => void
  onScenarioDiagnosticChange?: (context: DynamicScenarioDiagnosticContext | null) => void
  scenarioActionEvent?: { action: DynamicScenarioActionId; sequence: number } | null
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
  while (names.has(candidate.toLocaleLowerCase())) { candidate = `${baseName} copy ${suffix}`; suffix += 1 }
  return candidate
}

const INSTRUCTOR_DEVICE_ACTION_LABELS: Partial<Record<DynamicScenarioActionId, string>> = {
  'oxygen-flush': 'Oxygen flush',
  nebulisation: 'Nebuliser activated',
  'inspiratory-hold': 'Inspiratory hold',
  'expiratory-hold': 'Expiratory hold',
}

export function InstructorAccountControls({ role, sessionId, currentScenario, onLoadScenario, simulationPaused, onSimulationPausedChange, physiologyMeasurements, scenarioElapsedSeconds, sessionMembers, runtimeHost, onStartInstructorSession, onAccountConnectionChange, onDynamicScenarioStarted, onStaticScenarioLoaded, onScenarioDiagnosticChange, scenarioActionEvent = null }: InstructorAccountControlsProps) {
  const accountChangeLocked = role !== 'standalone'
  const accountAuth = useInstructorAccountAuth({ locked: accountChangeLocked })
  const account = accountAuth.account
  const library = useProductScenarioLibrary<InstructorScenarioSnapshot>('mv', Boolean(account), EDUVENT_SCENARIO_CODEC)
  const requestedScenarioHandledRef = useRef<string | null>(null)
  const loggedScenarioActionSequenceRef = useRef<number | null>(null)
  const standaloneScenarioRef = useRef(currentScenario)
  const standalonePauseRef = useRef(simulationPaused)
  const standaloneSettingsTimerRef = useRef<number | null>(null)
  useEffect(() => { onAccountConnectionChange?.(Boolean(account)) }, [account, onAccountConnectionChange])
  void onSimulationPausedChange

  useEffect(() => {
    configureSessionLogRuntime({ productId: 'mv', sessionId, role })
    if (role === 'standalone') {
      standaloneScenarioRef.current = currentScenario
      standalonePauseRef.current = simulationPaused
    }
  }, [role, sessionId])

  useEffect(() => {
    if ((role !== 'instructor' && role !== 'standalone') || !scenarioActionEvent) return
    if (loggedScenarioActionSequenceRef.current === scenarioActionEvent.sequence) return
    loggedScenarioActionSequenceRef.current = scenarioActionEvent.sequence
    if (scenarioActionEvent.action === 'freeze-waveform') return
    const label = INSTRUCTOR_DEVICE_ACTION_LABELS[scenarioActionEvent.action]
    if (!label) return
    void recordSessionLogEvent({
      sessionId: sessionId ?? undefined,
      category: 'device',
      eventType: `${role}.device_action`,
      label,
      details: { action: scenarioActionEvent.action, sequence: scenarioActionEvent.sequence },
    }).catch(() => undefined)
  }, [role, scenarioActionEvent, sessionId])

  const standaloneScenarioSignature = useMemo(() => {
    try { return JSON.stringify(currentScenario) } catch { return '' }
  }, [currentScenario])

  useEffect(() => {
    if (standaloneSettingsTimerRef.current != null) window.clearTimeout(standaloneSettingsTimerRef.current)
    if (role !== 'standalone') {
      standaloneScenarioRef.current = currentScenario
      return
    }
    standaloneSettingsTimerRef.current = window.setTimeout(() => {
      const before = standaloneScenarioRef.current
      const after = currentScenario
      const changes = diffSessionState(before, after)
      standaloneScenarioRef.current = after
      if (!changes.length) return
      void recordSessionLogEvent({
        category: 'settings',
        eventType: 'standalone.settings.changed',
        label: settingChangesLabel('Settings changed', changes),
        details: { before, after, changes },
      }).catch(() => undefined)
    }, 300)
    return () => { if (standaloneSettingsTimerRef.current != null) window.clearTimeout(standaloneSettingsTimerRef.current) }
  }, [role, currentScenario, standaloneScenarioSignature])

  useEffect(() => {
    if (role !== 'standalone') { standalonePauseRef.current = simulationPaused; return }
    if (standalonePauseRef.current === simulationPaused) return
    const previous = standalonePauseRef.current
    standalonePauseRef.current = simulationPaused
    void recordSessionLogEvent({
      category: 'settings',
      eventType: 'standalone.simulation_pause.changed',
      label: simulationPaused ? 'Simulation paused' : 'Simulation resumed',
      details: { from: previous, to: simulationPaused },
    }).catch(() => undefined)
  }, [role, simulationPaused])

  const scenarioRuntime = useEduventInstructorScenarioRuntime({ role, sessionId, currentScenario, onLoadScenario, physiologyMeasurements, scenarioElapsedSeconds, sessionMembers, runtimeHost, onStartInstructorSession, onDynamicScenarioStarted, onScenarioDiagnosticChange, scenarioActionEvent })

  const loadStatic = (preset: InstructorPresetRow) => {
    onLoadScenario(preset.scenario)
    onStaticScenarioLoaded?.(preset.name)
  }

  useEffect(() => {
    if (!account || role === 'candidate') return
    const url = new URL(window.location.href)
    const requested = url.searchParams.get('scenario')
    if (!requested || requestedScenarioHandledRef.current === requested) return
    const preset = library.items.find((item) => item.id === requested)
    if (!preset) return

    const requestedMode = url.searchParams.get('mode')
    const launchMode = requestedMode === 'standalone' || requestedMode === 'simulation' || requestedMode === 'teaching' ? requestedMode : null
    requestedScenarioHandledRef.current = requested

    const launch = async () => {
      if (launchMode === 'simulation' || launchMode === 'teaching') savePreferredLocalSessionRuntimeMode(launchMode)

      if (preset.scenario.kind === 'dynamic') {
        await scenarioRuntime.start(preset, { createInstructorSession: launchMode !== 'standalone' })
      } else if (launchMode === 'simulation' || launchMode === 'teaching') {
        await onStartInstructorSession(preset.scenario)
        onStaticScenarioLoaded?.(preset.name)
      } else {
        loadStatic(preset)
      }
    }

    void launch().finally(() => {
      url.searchParams.delete('scenario')
      url.searchParams.delete('mode')
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    })
  }, [account, role, library.items, scenarioRuntime, onStartInstructorSession])

  const switchTeachingDynamicScenario = async (preset: InstructorPresetRow) => {
    if (!sessionId) return scenarioRuntime.start(preset)
    clearScenarioLogs()
    await scenarioRuntime.start(preset, { createInstructorSession: false })
    await recordSessionLogEvent({
      sessionId,
      category: 'scenario',
      eventType: 'instructor.scenario.switched',
      label: `Switched scenario to “${preset.name}”`,
      details: { scenarioId: preset.id, scenarioName: preset.name, sessionPreserved: true },
    }).catch(() => undefined)
  }

  const startItem = async (preset: InstructorPresetRow) => {
    if (preset.scenario.kind === 'dynamic') {
      if (role === 'instructor') return switchTeachingDynamicScenario(preset)
      return scenarioRuntime.start(preset)
    }
    if (role === 'standalone') {
      await onStartInstructorSession(preset.scenario)
      onStaticScenarioLoaded?.(preset.name)
    } else {
      loadStatic(preset)
      if (role === 'instructor' && sessionId) {
        void recordSessionLogEvent({
          sessionId,
          category: 'scenario',
          eventType: 'instructor.scenario.switched',
          label: `Switched scenario to “${preset.name}”`,
          details: { scenarioId: preset.id, scenarioName: preset.name, scenarioKind: 'static', sessionPreserved: true },
        }).catch(() => undefined)
      }
    }
  }

  const saveCurrent = async (name: string, description: string) => {
    const created = await library.create(name, asStaticScenario(currentScenario, description))
    library.setMessage(`Saved “${created.name}”.`)
  }
  const duplicate = async (preset: InstructorPresetRow) => {
    const created = await library.create(nextCopyName(preset.name, library.items), preset.scenario)
    library.setMessage(`Duplicated as “${created.name}”.`)
  }
  const remove = async (preset: InstructorPresetRow) => {
    if (!window.confirm(`Delete scenario “${preset.name}”?`)) return
    await library.remove(preset.id)
    library.setMessage(`Deleted “${preset.name}”.`)
  }

  const scenarioAction = role === 'candidate' ? null : <InstructorScenarioLibraryController<InstructorScenarioSnapshot>
    authenticated={Boolean(account)}
    accountLabel={account?.email}
    items={library.items}
    busy={library.busy}
    message={library.message}
    scenarioKind={(scenario) => scenario.kind === 'dynamic' ? 'dynamic' : 'static'}
    descriptionFor={(scenario) => scenario.description ?? ''}
    summaryFor={summaryItems}
    onRefresh={library.refresh}
    onLoad={(item) => loadStatic(item as InstructorPresetRow)}
    onStart={(item) => startItem(item as InstructorPresetRow)}
    onSaveCurrent={saveCurrent}
    onDuplicate={(item) => duplicate(item as InstructorPresetRow)}
    onDelete={(item) => remove(item as InstructorPresetRow)}
    onSignIn={() => accountAuth.setOpen(true)}
    builderHref="/scenarios?product=mv"
    productLabel="LoppjuSIM-MV"
    initialTab={role === 'instructor' ? 'dynamic' : 'static'}
  />

  const runtimeError = scenarioRuntime.selfDirectedError && runtimeHost
    ? createPortal(<section className="dynamic-runtime-panel self-directed-error-panel" role="alert"><div className="dynamic-runtime-panel-heading"><div><span>Self-directed scenario</span><strong>Unable to start</strong></div></div><p>{scenarioRuntime.selfDirectedError}</p></section>, runtimeHost)
    : null

  return <InstructorWorkspace
    accountAction={<InstructorAccountButton auth={accountAuth} />}
    scenarioAction={scenarioAction}
    settingsAction={<InstructorSettingsController productLabel="LoppjuSIM-MV" version={APP_VERSION} role={role} auth={accountAuth} />}
    runtime={<>{scenarioRuntime.runtimeNode}{runtimeError}</>}
    dialogs={<InstructorAccountDialog auth={accountAuth} locked={accountChangeLocked} />}
  />
}
