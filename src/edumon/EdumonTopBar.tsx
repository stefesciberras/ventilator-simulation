import type { EdumonModuleDefinition } from './modules'
import { SimulationTopBar, type SharedSimulationSpeed } from '../components/SimulationTopBar'
import './EdumonTopBar.css'

export type EdumonSimulationSpeed = SharedSimulationSpeed

function CloudIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.2 18.2h10.1a4 4 0 0 0 .7-7.9A6.2 6.2 0 0 0 6.2 8.6a4.9 4.9 0 0 0 1 9.6Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

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
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>
  )
}

function MonitorIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4.5" width="16" height="15" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6.5 13h2.2l1.4-4 2.1 7 1.6-4h3.7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
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
  onScenario: () => void
  onAccount: () => void
  onAbout: () => void
}

export function EdumonTopBar({ module, simulationPaused, simulationSpeed, elapsedSeconds, onPausedChange, onSpeedChange, onScenario, onAccount, onAbout }: EdumonTopBarProps) {
  const actions = (
    <>
      <button type="button" className="top-account-button" onClick={onAccount} title="Instructor account" aria-label="Open instructor account"><CloudIcon /></button>
      <button type="button" className="top-account-button scenario-top-button" onClick={onScenario} title="Scenarios" aria-label="Open scenarios"><ScenarioIcon /></button>
      <a className="top-account-button edumon-module-menu-button" href="/edumon" title="EDUMON modules" aria-label="Choose EDUMON module"><MenuIcon /></a>
      <button type="button" className="top-diagnostic-button" onClick={onAbout} title="EDUMON information" aria-label="Open EDUMON information"><MonitorIcon /></button>
    </>
  )

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
      rightActions={actions}
      statusText={simulationPaused ? 'SIMULATION PAUSED' : 'SIMULATION ACTIVE'}
      version="0.1.0.0"
      onAbout={onAbout}
      className="edumon-topbar"
    />
  )
}
