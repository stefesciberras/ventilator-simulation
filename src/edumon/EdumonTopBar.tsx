import type { EdumonModuleDefinition } from './modules'

export type EdumonSimulationSpeed = 0.5 | 1 | 2 | 4

function PauseIcon({ paused }: { paused: boolean }) {
  return paused ? (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" /></svg>
  )
}

function formatClock(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(whole / 60)
  const remainder = whole % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
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

export function EdumonTopBar({
  module,
  simulationPaused,
  simulationSpeed,
  elapsedSeconds,
  onPausedChange,
  onSpeedChange,
  onScenario,
  onAccount,
  onAbout,
}: EdumonTopBarProps) {
  return (
    <header className="topbar edumon-topbar">
      <div className="brand-block edumon-topbar-brand">
        <a href="/edumon" className="edumon-topbar-back" aria-label="Choose EDUMON module">‹</a>
        <div>
          <span className="brand-kicker">{module.productName}</span>
          <h1>{module.subtitle}</h1>
        </div>
      </div>

      <div className="top-simulation-controls">
        <button
          className={`top-simulation-pause ${simulationPaused ? 'paused' : ''}`}
          type="button"
          onClick={() => onPausedChange(!simulationPaused)}
          aria-label={simulationPaused ? 'Resume whole simulation' : 'Pause whole simulation'}
          title={simulationPaused ? 'Resume whole simulation' : 'Pause whole simulation'}
        >
          <PauseIcon paused={simulationPaused} />
          <span>{simulationPaused ? 'RESUME SIMULATION' : 'PAUSE SIMULATION'}</span>
        </button>

        <div className={`simulation-clock ${simulationPaused ? 'paused' : ''}`} aria-label={`Simulation time ${formatClock(elapsedSeconds)}`}>
          <span>TIME</span>
          <strong>{formatClock(elapsedSeconds)}</strong>
        </div>

        <label className={`simulation-speed-control ${simulationPaused ? 'paused' : ''}`}>
          <span>SPEED</span>
          <select
            value={simulationSpeed}
            onChange={(event) => onSpeedChange(Number(event.target.value) as EdumonSimulationSpeed)}
            aria-label="Simulation speed"
          >
            <option value={0.5}>×0.5</option>
            <option value={1}>×1</option>
            <option value={2}>×2</option>
            <option value={4}>×4</option>
          </select>
        </label>
      </div>

      <div className="status-cluster edumon-topbar-status">
        <span className={`status-dot ${simulationPaused ? 'paused' : ''}`} />
        <span className="edumon-simulation-status">{simulationPaused ? 'SIMULATION PAUSED' : 'SIMULATION ACTIVE'}</span>
        <button type="button" className="edumon-topbar-utility" onClick={onScenario}>Scenario</button>
        <button type="button" className="edumon-topbar-utility" onClick={onAccount}>Account</button>
        <span className="version">v0.1.0.0</span>
        <button type="button" className="top-about-button" onClick={onAbout}>About</button>
      </div>
    </header>
  )
}
