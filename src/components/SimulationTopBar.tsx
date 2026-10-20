import type { ReactNode } from 'react'

export type SharedSimulationSpeed = 0.5 | 1 | 2 | 4

function PauseIcon({ paused }: { paused: boolean }) {
  return paused ? (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" /></svg>
  )
}

export function formatSimulationClock(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const remainder = whole % 60
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

interface SimulationTopBarProps {
  brandKicker: string
  title: string
  brandLeading?: ReactNode
  simulationPaused: boolean
  simulationSpeed: SharedSimulationSpeed
  elapsedSeconds: number
  onPausedChange: (paused: boolean) => void
  onSpeedChange: (speed: SharedSimulationSpeed) => void
  pauseDisabled?: boolean
  rightActions?: ReactNode
  statusText?: string
  version?: string
  onAbout?: () => void
  className?: string
  brandClassName?: string
  statusClassName?: string
  statusTextClassName?: string
}

export function SimulationTopBar({
  brandKicker,
  title,
  brandLeading,
  simulationPaused,
  simulationSpeed,
  elapsedSeconds,
  onPausedChange,
  onSpeedChange,
  pauseDisabled = false,
  rightActions,
  statusText,
  version,
  onAbout,
  className = '',
  brandClassName = '',
  statusClassName = '',
  statusTextClassName = '',
}: SimulationTopBarProps) {
  const clock = formatSimulationClock(elapsedSeconds)

  return (
    <header className={`topbar ${className}`.trim()}>
      <div className={`brand-block ${brandClassName}`.trim()}>
        {brandLeading}
        <div><span className="brand-kicker">{brandKicker}</span><h1>{title}</h1></div>
      </div>

      <div className="top-simulation-controls">
        <button
          className={`top-simulation-pause ${simulationPaused ? 'paused' : ''}`}
          type="button"
          onClick={() => onPausedChange(!simulationPaused)}
          disabled={pauseDisabled}
          aria-label={simulationPaused ? 'Resume whole simulation' : 'Pause whole simulation'}
          title={simulationPaused ? 'Resume whole simulation' : 'Pause whole simulation'}
        >
          <PauseIcon paused={simulationPaused} />
          <span>{simulationPaused ? 'RESUME SIMULATION' : 'PAUSE SIMULATION'}</span>
        </button>
        <div className={`simulation-clock ${simulationPaused ? 'paused' : ''}`} aria-label={`Simulation time ${clock}`}>
          <span>TIME</span><strong>{clock}</strong>
        </div>
        <label className={`simulation-speed-control ${simulationPaused ? 'paused' : ''}`}>
          <span>SPEED</span>
          <select value={simulationSpeed} onChange={(event) => onSpeedChange(Number(event.target.value) as SharedSimulationSpeed)} aria-label="Simulation speed">
            <option value={0.5}>×0.5</option><option value={1}>×1</option><option value={2}>×2</option><option value={4}>×4</option>
          </select>
        </label>
      </div>

      <div className={`status-cluster ${statusClassName}`.trim()}>
        <span className={`status-dot ${simulationPaused ? 'paused' : ''}`} />
        {statusText && <span className={statusTextClassName || 'simulation-status-text'}>{statusText}</span>}
        {rightActions}
        {version && <span className="version">v{version}</span>}
        {onAbout && <button type="button" className="top-about-button" onClick={onAbout}>About</button>}
      </div>
    </header>
  )
}
