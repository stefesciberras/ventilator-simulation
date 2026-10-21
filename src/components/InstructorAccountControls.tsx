import { useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { SessionRole } from '../session/useTeachingSession'
import type { PhysiologicalMeasurements } from '../physiologyMeasurements'
import type { SessionMemberRow } from '../session/supabase'
import { asStaticScenario, type DynamicScenarioActionId, type InstructorPresetRow, type InstructorScenarioSnapshot } from '../instructorAccount'
import { APP_VERSION } from '../appVersion'
import { InstructorAccountButton, InstructorAccountDialog, useInstructorAccountAuth } from './InstructorAccountAuth'
import { useEduventScenarioLibrary } from '../teaching/scenario/useEduventScenarioLibrary'
import { InstructorWorkspace } from '../teaching/instructor/InstructorWorkspace'
import { InstructorSettingsController } from '../teaching/instructor/InstructorSettingsController'
import { InstructorScenarioLibraryController } from '../teaching/instructor/InstructorScenarioLibraryController'
import { useEduventInstructorScenarioRuntime, type EduventDynamicScenarioDiagnosticContext } from '../eduvent/useEduventInstructorScenarioRuntime'
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

export function InstructorAccountControls({ role, sessionId, currentScenario, onLoadScenario, simulationPaused, onSimulationPausedChange, physiologyMeasurements, scenarioElapsedSeconds, sessionMembers, runtimeHost, onStartInstructorSession, onAccountConnectionChange, onDynamicScenarioStarted, onStaticScenarioLoaded, onScenarioDiagnosticChange, scenarioActionEvent = null }: InstructorAccountControlsProps) {
  const accountChangeLocked = role !== 'standalone'
  const accountAuth = useInstructorAccountAuth({ locked: accountChangeLocked })
  const account = accountAuth.account
  const library = useEduventScenarioLibrary(Boolean(account))
  const requestedScenarioHandledRef = useRef<string | null>(null)
  useEffect(() => { onAccountConnectionChange?.(Boolean(account)) }, [account, onAccountConnectionChange])
  void simulationPaused
  void onSimulationPausedChange

  const scenarioRuntime = useEduventInstructorScenarioRuntime({ role, sessionId, currentScenario, onLoadScenario, physiologyMeasurements, scenarioElapsedSeconds, sessionMembers, runtimeHost, onStartInstructorSession, onDynamicScenarioStarted, onScenarioDiagnosticChange, scenarioActionEvent })
  const dynamicPresets = useMemo(() => library.items.filter((preset) => preset.scenario.kind === 'dynamic'), [library.items])

  useEffect(() => {
    if (!account || role === 'candidate') return
    const url = new URL(window.location.href)
    const requested = url.searchParams.get('scenario')
    if (!requested || requestedScenarioHandledRef.current === requested) return
    const preset = dynamicPresets.find((item) => item.id === requested)
    if (!preset) return
    requestedScenarioHandledRef.current = requested
    void scenarioRuntime.start(preset).finally(() => {
      url.searchParams.delete('scenario')
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    })
  }, [account, role, dynamicPresets, scenarioRuntime])

  const loadStatic = (preset: InstructorPresetRow) => {
    onLoadScenario(preset.scenario)
    onStaticScenarioLoaded?.(preset.name)
  }

  const startItem = async (preset: InstructorPresetRow) => {
    if (preset.scenario.kind === 'dynamic') return scenarioRuntime.start(preset)
    if (role === 'standalone') await onStartInstructorSession(preset.scenario)
    else loadStatic(preset)
    onStaticScenarioLoaded?.(preset.name)
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
    builderHref="/scenarios?product=eduvent"
    productLabel="EDUVENT"
  />

  const runtimeError = scenarioRuntime.selfDirectedError && runtimeHost
    ? createPortal(<section className="dynamic-runtime-panel self-directed-error-panel" role="alert"><div className="dynamic-runtime-panel-heading"><div><span>Self-directed scenario</span><strong>Unable to start</strong></div></div><p>{scenarioRuntime.selfDirectedError}</p></section>, runtimeHost)
    : null

  return <InstructorWorkspace
    accountAction={<InstructorAccountButton auth={accountAuth} />}
    scenarioAction={scenarioAction}
    settingsAction={<InstructorSettingsController productLabel="EDUVENT" version={APP_VERSION} role={role} auth={accountAuth} />}
    runtime={<>{scenarioRuntime.runtimeNode}{runtimeError}</>}
    dialogs={<InstructorAccountDialog auth={accountAuth} locked={accountChangeLocked} />}
  />
}
