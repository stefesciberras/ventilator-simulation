import { useEffect, type ReactNode } from 'react'
import type { EdumonModuleDefinition } from './modules'
import { SimulationTopBar, type SharedSimulationSpeed } from '../components/SimulationTopBar'
import { InstructorSettingsController } from '../teaching/instructor/InstructorSettingsController'
import { useInstructorAccountAuth } from '../components/InstructorAccountAuth'
import { EDUMON_APP_VERSION } from './appVersion'
import './EdumonTopBar.css'

export type EdumonSimulationSpeed = SharedSimulationSpeed

function ScenarioIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5.5h14v13H5z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M8 9h8M8 12h5M8 15h7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8 3.5h8v4H8z" fill="#0e171c" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

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

export function EdumonTopBar({ module, simulationPaused, simulationSpeed, elapsedSeconds, onPausedChange, onSpeedChange, simulationControlsLocked = false, onScenario, accountAction, diagnosticsAction, onAbout }: EdumonTopBarProps) {
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

  return (
    <SimulationTopBar
      brandKicker={module.productName}
      title={module.subtitle}
      simulationPaused={simulationPaused}
      simulationSpeed={simulationSpeed}
      elapsedSeconds={elapsedSeconds}
      onPausedChange={onPausedChange}
      onSpeedChange={onSpeedChange}
      controlsControlledByInstructor={simulationControlsLocked}
      rightActions={<>{accountAction}<button type="button" className="top-account-button scenario-top-button" onClick={onScenario} title="Scenarios and sessions" aria-label="Open scenarios and sessions"><ScenarioIcon /></button><InstructorSettingsController productLabel={module.productName} version={EDUMON_APP_VERSION} role={simulationControlsLocked ? 'candidate' : 'standalone'} auth={settingsAuth} />{diagnosticsAction}</>}
      statusText={simulationPaused ? 'SIMULATION PAUSED' : 'SIMULATION ACTIVE'}
      version={EDUMON_APP_VERSION}
      onAbout={onAbout}
      className="edumon-topbar"
      brandClassName="edumon-topbar-brand"
      statusClassName="edumon-topbar-status"
    />
  )
}
