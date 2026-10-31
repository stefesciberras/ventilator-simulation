import { useEffect, type ReactNode } from 'react'
import type { EdumonModuleDefinition } from './modules'
import { SimulationTopBar, type SharedSimulationSpeed } from '../components/SimulationTopBar'
import { InstructorSettingsController } from '../teaching/instructor/InstructorSettingsController'
import { InstructorScenarioLibraryController, type InstructorScenarioLibraryItem } from '../teaching/instructor/InstructorScenarioLibraryController'
import { useInstructorAccountAuth } from '../components/InstructorAccountAuth'
import { useProductScenarioLibrary } from '../teaching/scenario/useProductScenarioLibrary'
import { scenarioProductForEdumonModule } from '../teaching/scenario/products'
import type { EdumonStoredScenario } from './scenarioTypes'
import { LOPPJUSIM_RUN_SCENARIO_EVENT } from '../core/platformEvents'
import { EDUMON_APP_VERSION } from './appVersion'
import './EdumonTopBar.css'

export type EdumonSimulationSpeed = SharedSimulationSpeed

interface EdumonTopBarProps {
  module: EdumonModuleDefinition
  simulationPaused: boolean
  simulationSpeed: EdumonSimulationSpeed
  elapsedSeconds: number
  onPausedChange: (paused: boolean) => void
  onSpeedChange: (speed: EdumonSimulationSpeed) => void
  simulationControlsLocked?: boolean
  onScenario: () => void
  accountAction: ReactNode
  diagnosticsAction: ReactNode
  onAbout: () => void
}

function nextCopyName(baseName: string, items: Array<{ name: string }>) {
  const names = new Set(items.map((item) => item.name.toLocaleLowerCase()))
  let candidate = `${baseName} copy`
  let suffix = 2
  while (names.has(candidate.toLocaleLowerCase())) {
    candidate = `${baseName} copy ${suffix}`
    suffix += 1
  }
  return candidate
}

function scenarioSummary(scenario: EdumonStoredScenario) {
  const first = scenario.definition.stages[0]?.snapshot
  const summary = [`${scenario.definition.stages.length} stage${scenario.definition.stages.length === 1 ? '' : 's'}`]
  if (first) {
    summary.push(`HR ${Math.round(first.patient.heartRate)}`)
    summary.push(`${Math.round(first.patient.systolicPressure)}/${Math.round(first.patient.diastolicPressure)}`)
    summary.push(`SpO₂ ${Math.round(first.patient.spo2)}%`)
  }
  return summary
}

export function EdumonTopBar({ module, simulationPaused, simulationSpeed, elapsedSeconds, onPausedChange, onSpeedChange, simulationControlsLocked = false, diagnosticsAction, onAbout }: EdumonTopBarProps) {
  const settingsAuth = useInstructorAccountAuth({ locked: simulationControlsLocked })
  const scenarioProduct = scenarioProductForEdumonModule(module.id)
  const scenarioLibrary = useProductScenarioLibrary<EdumonStoredScenario>(scenarioProduct, Boolean(settingsAuth.account) && !simulationControlsLocked)

  useEffect(() => {
    const removeLegacyNibpPlaceholder = () => {
      document.querySelectorAll<HTMLButtonElement>(".edumon-control-strip > button.edumon-control-tile.disabled[title^='NIBP will be enabled']")
        .forEach((button) => button.remove())
    }
    removeLegacyNibpPlaceholder()
    const observer = new MutationObserver(removeLegacyNibpPlaceholder)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  const runScenario = (item: InstructorScenarioLibraryItem<EdumonStoredScenario>) => {
    window.dispatchEvent(new CustomEvent(LOPPJUSIM_RUN_SCENARIO_EVENT, {
      detail: { definition: item.scenario.definition, simulationTime: elapsedSeconds },
    }))
  }

  const duplicateScenario = async (item: InstructorScenarioLibraryItem<EdumonStoredScenario>) => {
    const created = await scenarioLibrary.create(nextCopyName(item.name, scenarioLibrary.items), item.scenario)
    scenarioLibrary.setMessage(`Duplicated as “${created.name}”.`)
  }

  const deleteScenario = async (item: InstructorScenarioLibraryItem<EdumonStoredScenario>) => {
    if (!window.confirm(`Delete scenario “${item.name}”?`)) return
    await scenarioLibrary.remove(item.id)
    scenarioLibrary.setMessage(`Deleted “${item.name}”.`)
  }

  return (
    <>
      <SimulationTopBar
        brandKicker={module.productName}
        title={module.subtitle}
        simulationPaused={simulationPaused}
        simulationSpeed={simulationSpeed}
        elapsedSeconds={elapsedSeconds}
        onPausedChange={onPausedChange}
        onSpeedChange={onSpeedChange}
        controlsControlledByInstructor={simulationControlsLocked}
        rightActions={diagnosticsAction}
        statusText={simulationPaused ? 'SIMULATION PAUSED' : 'SIMULATION ACTIVE'}
        version={EDUMON_APP_VERSION}
        onAbout={onAbout}
        className="edumon-topbar"
        brandClassName="edumon-topbar-brand"
        statusClassName="edumon-topbar-status"
      />
      {!simulationControlsLocked && <InstructorScenarioLibraryController<EdumonStoredScenario>
        authenticated={Boolean(settingsAuth.account)}
        accountLabel={settingsAuth.account?.email}
        items={scenarioLibrary.items}
        busy={scenarioLibrary.busy}
        message={scenarioLibrary.message}
        scenarioKind={(scenario) => scenario.kind === 'dynamic' ? 'dynamic' : 'static'}
        descriptionFor={(scenario) => scenario.description ?? ''}
        summaryFor={scenarioSummary}
        onRefresh={scenarioLibrary.refresh}
        onLoad={runScenario}
        onStart={runScenario}
        onDuplicate={duplicateScenario}
        onDelete={deleteScenario}
        onSignIn={() => undefined}
        builderHref={`/scenarios?product=${scenarioProduct}`}
        productLabel={module.productName}
        initialTab="dynamic"
      />}
      <span className="loppjusim-hidden-settings-controller"><InstructorSettingsController productLabel={module.productName} version={EDUMON_APP_VERSION} role={simulationControlsLocked ? 'candidate' : 'standalone'} auth={settingsAuth} /></span>
    </>
  )
}
