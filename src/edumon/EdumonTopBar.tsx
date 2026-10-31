import { useEffect, type ReactNode } from 'react'
import type { EdumonModuleDefinition } from './modules'
import { SimulationTopBar, type SharedSimulationSpeed } from '../components/SimulationTopBar'
import { InstructorSettingsController } from '../teaching/instructor/InstructorSettingsController'
import { useInstructorAccountAuth } from '../components/InstructorAccountAuth'
import { LOPPJUSIM_OPEN_SCENARIOS_EVENT } from '../core/platformEvents'
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

export function EdumonTopBar({ module, simulationPaused, simulationSpeed, elapsedSeconds, onPausedChange, onSpeedChange, simulationControlsLocked = false, onScenario, diagnosticsAction, onAbout }: EdumonTopBarProps) {
  const settingsAuth = useInstructorAccountAuth({ locked: simulationControlsLocked })

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

  useEffect(() => {
    const openScenarios = () => onScenario()
    window.addEventListener(LOPPJUSIM_OPEN_SCENARIOS_EVENT, openScenarios)
    return () => window.removeEventListener(LOPPJUSIM_OPEN_SCENARIOS_EVENT, openScenarios)
  }, [onScenario])

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
      <span className="loppjusim-hidden-settings-controller"><InstructorSettingsController productLabel={module.productName} version={EDUMON_APP_VERSION} role={simulationControlsLocked ? 'candidate' : 'standalone'} auth={settingsAuth} /></span>
    </>
  )
}
