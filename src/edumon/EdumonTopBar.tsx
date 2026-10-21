import type { ReactNode } from 'react'
import type { EdumonModuleDefinition } from './modules'
import { SimulationTopBar, type SharedSimulationSpeed } from '../components/SimulationTopBar'
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

function MenuIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>
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
  return (
    <SimulationTopBar
      brandKicker={module.productName}
      title={module.subtitle}
      brandLeading={<a href="/edumon" className="edumon-topbar-back" aria-label="Choose EDUMON module">‹</a>}
      simulationPaused={simulationPaused}
      simulationSpeed={simulationSpeed}
      elapsedSeconds={elapsedSeconds}
      onPausedChange={onPausedChange}
      onSpeedChange={onSpeedChange}
      controlsControlledByInstructor={simulationControlsLocked}
      rightActions={<>{accountAction}<button type="button" className="top-account-button scenario-top-button" onClick={onScenario} title="Scenarios and sessions" aria-label="Open scenarios and sessions"><ScenarioIcon /></button><a className="top-account-button edumon-module-menu-button" href="/edumon" title="EDUMON modules" aria-label="Choose EDUMON module"><MenuIcon /></a>{diagnosticsAction}</>}
      statusText={simulationPaused ? 'SIMULATION PAUSED' : 'SIMULATION ACTIVE'}
      version="0.1.0.0"
      onAbout={onAbout}
      className="edumon-topbar"
      brandClassName="edumon-topbar-brand"
      statusClassName="edumon-topbar-status"
    />
  )
}
