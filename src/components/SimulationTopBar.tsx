import { useRef, useState, type ReactNode } from 'react'
import { EdusimBackLink } from './EdusimBackLink'
import { LoppjuSimPlatformMenu, type LoppjuSimRunMode } from './LoppjuSimPlatformMenu'
import { resetSimulation } from '../core/simulationReset'
import { useScenarioRuntimeIndicator } from '../teaching/scenario/runtimeUiState'
import './SimulationTopBar.css'

export type SharedSimulationSpeed = 0.5 | 1 | 1.5 | 2 | 4

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
  speedOptions?: readonly SharedSimulationSpeed[]
  controlsControlledByInstructor?: boolean
  rightActions?: ReactNode
  statusText?: string
  version?: string
  onAbout?: () => void
  runMode?: LoppjuSimRunMode
  showPlatformMenu?: boolean
  className?: string
  brandClassName?: string
  statusClassName?: string
  statusTextClassName?: string
}

const DEFAULT_SPEED_OPTIONS: readonly SharedSimulationSpeed[] = [0.5, 1, 2, 4]
const RESET_LONG_PRESS_MS = 800
const PUBLIC_PRODUCT_LABELS: Record<string, string> = {
  EDUVENT: 'LoppjuSIM-MV',
  'EDUMON-Ana': 'LoppjuSIM-Anaesth',
  'EDUMON-ICU': 'LoppjuSIM-ICU',
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
  speedOptions = DEFAULT_SPEED_OPTIONS,
  controlsControlledByInstructor = false,
  rightActions,
  statusText,
  version,
  onAbout,
  runMode,
  showPlatformMenu = true,
  className = '',
  brandClassName = '',
  statusClassName = '',
  statusTextClassName = '',
}: SimulationTopBarProps) {
  const clock = formatSimulationClock(elapsedSeconds)
  const localPauseLabel = simulationPaused ? 'Resume whole simulation' : 'Pause whole simulation'
  const pauseLabel = controlsControlledByInstructor
    ? (simulationPaused ? 'Simulation paused by instructor' : 'Simulation pause controlled by instructor')
    : localPauseLabel
  const speedLabel = controlsControlledByInstructor ? 'Simulation speed controlled by instructor' : 'Simulation speed'
  const publicBrandKicker = PUBLIC_PRODUCT_LABELS[brandKicker] ?? brandKicker
  const scenarioIndicator = useScenarioRuntimeIndicator()
  const [resetOpen, setResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetHolding, setResetHolding] = useState(false)
  const resetHoldRef = useRef<number | null>(null)
  const resetHoldTriggeredRef = useRef(false)

  const cancelResetHold = () => {
    if (resetHoldRef.current != null) window.clearTimeout(resetHoldRef.current)
    resetHoldRef.current = null
    setResetHolding(false)
  }

  const startResetHold = () => {
    if (controlsControlledByInstructor) return
    cancelResetHold()
    resetHoldTriggeredRef.current = false
    setResetHolding(true)
    resetHoldRef.current = window.setTimeout(() => {
      resetHoldRef.current = null
      resetHoldTriggeredRef.current = true
      setResetHolding(false)
      setResetOpen(true)
    }, RESET_LONG_PRESS_MS)
  }

  const handlePauseClick = () => {
    if (resetHoldTriggeredRef.current) {
      resetHoldTriggeredRef.current = false
      return
    }
    onPausedChange(!simulationPaused)
  }

  const confirmReset = async () => {
    if (resetting) return
    setResetting(true)
    try {
      await resetSimulation(publicBrandKicker)
      // Pause/speed are shared top-bar controls across all products. Restore their neutral
      // values here so product reset handlers only need to own clinical/device state.
      onPausedChange(false)
      onSpeedChange(1)
      setResetOpen(false)
    } finally {
      setResetting(false)
    }
  }

  const sessionPreserved = runMode === 'instructor'

  return <>
    <header className={`topbar simulation-topbar ${className}`.trim()}>
      <div className={`brand-block ${brandClassName}`.trim()}>
        {brandLeading ?? <EdusimBackLink />}
        <div><span className="brand-kicker">{publicBrandKicker}</span><h1>{title}</h1></div>
      </div>

      <div className="top-simulation-controls">
        <button
          className={`top-simulation-pause ${simulationPaused ? 'paused' : ''} ${resetHolding ? 'reset-holding' : ''}`}
          type="button"
          onClick={handlePauseClick}
          onPointerDown={startResetHold}
          onPointerUp={cancelResetHold}
          onPointerCancel={cancelResetHold}
          onPointerLeave={cancelResetHold}
          onContextMenu={(event) => event.preventDefault()}
          disabled={controlsControlledByInstructor}
          aria-label={pauseLabel}
          title={`${pauseLabel}. Press and hold to reset the simulator.`}
        >
          <PauseIcon paused={simulationPaused} />
          <span>{simulationPaused ? 'RESUME SIMULATION' : 'PAUSE SIMULATION'}</span>
        </button>
        <div className={`simulation-clock ${simulationPaused ? 'paused' : ''}`} aria-label={`Simulation time ${clock}`}>
          <span>TIME</span><strong>{clock}</strong>
        </div>
        <label className={`simulation-speed-control ${simulationPaused ? 'paused' : ''}`}>
          <span>SPEED</span>
          <select
            value={simulationSpeed}
            disabled={controlsControlledByInstructor}
            onChange={(event) => onSpeedChange(Number(event.target.value) as SharedSimulationSpeed)}
            aria-label="Simulation speed"
            title={speedLabel}
          >
            {speedOptions.map((speed) => <option key={speed} value={speed}>×{speed}</option>)}
          </select>
        </label>
        {scenarioIndicator && (
          <button
            type="button"
            className="simulation-stage-control"
            disabled={!scenarioIndicator.manualAvailable}
            onClick={() => scenarioIndicator.open()}
            title={scenarioIndicator.manualAvailable ? 'Open current scenario stage controls' : 'Current stage has no manual trigger'}
            aria-label={`Current scenario stage ${scenarioIndicator.label}`}
          >
            <span>STAGE</span>
            <strong>{scenarioIndicator.label}</strong>
          </button>
        )}
      </div>

      <div className={`status-cluster simulation-topbar-status ${statusClassName}`.trim()}>
        <span className={`status-dot ${simulationPaused ? 'paused' : ''}`} />
        {statusText && <span className={statusTextClassName || 'simulation-status-text'}>{statusText}</span>}
        {rightActions}
        {showPlatformMenu && <LoppjuSimPlatformMenu role={runMode} productLabel={publicBrandKicker} />}
        {version && <span className="version">v{version}</span>}
        {onAbout && <button type="button" className="top-about-button" onClick={onAbout}>About</button>}
      </div>
    </header>

    {resetOpen && <div className="simulation-reset-backdrop" role="presentation" onMouseDown={() => { if (!resetting) setResetOpen(false) }}>
      <section className="simulation-reset-dialog" role="dialog" aria-modal="true" aria-label="Reset simulation" onMouseDown={(event) => event.stopPropagation()}>
        <div className="simulation-reset-heading"><div><span>Simulation control</span><strong>Reset simulation?</strong></div><button type="button" disabled={resetting} onClick={() => setResetOpen(false)} aria-label="Close">×</button></div>
        <p>{sessionPreserved
          ? 'This will stop the current scenario, clear its saved stage and transient simulator state, and restore the simulator defaults. The active session, session key and connected candidates will be preserved.'
          : 'This will stop the current scenario, clear its saved stage and transient simulator state, and restore the simulator defaults.'}</p>
        <div className="simulation-reset-actions">
          <button type="button" disabled={resetting} onClick={() => setResetOpen(false)}>Cancel</button>
          <button type="button" className="danger" disabled={resetting} onClick={() => void confirmReset()}>{resetting ? 'Resetting…' : 'Reset simulation'}</button>
        </div>
      </section>
    </div>}
  </>
}
