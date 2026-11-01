import { useEffect, useRef, useState, type ReactNode } from 'react'
import { EdusimBackLink } from './EdusimBackLink'
import { LoppjuSimPlatformMenu, type LoppjuSimRunMode } from './LoppjuSimPlatformMenu'
import { resetSimulation } from '../core/simulationReset'
import { LOPPJUSIM_OPEN_SESSIONS_EVENT, LOPPJUSIM_RUN_SCENARIO_EVENT } from '../core/platformEvents'
import { useScenarioRuntimeIndicator } from '../teaching/scenario/runtimeUiState'
import { recordSessionLogEvent } from '../teaching/session/sessionLog'
import { useInstructorSessionRecovery } from '../teaching/session/sessionRecoveryUiState'
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
const RESTART_LOG_SETTLE_MS = 500
const PUBLIC_PRODUCT_LABELS: Record<string, string> = {
  EDUVENT: 'LoppjuSIM-MV',
  'EDUMON-Ana': 'LoppjuSIM-Anaesth',
  'EDUMON-ICU': 'LoppjuSIM-ICU',
}

interface PersistedScenarioRuntime {
  scenario?: unknown
}

function scenarioIdentity(definition: unknown): { id: string | null; name: string } {
  if (!definition || typeof definition !== 'object') return { id: null, name: 'Scenario' }
  const value = definition as { id?: unknown; name?: unknown }
  return {
    id: typeof value.id === 'string' ? value.id : null,
    name: typeof value.name === 'string' && value.name.trim() ? value.name.trim() : 'Scenario',
  }
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
  const sessionRecovery = useInstructorSessionRecovery()
  const [resetOpen, setResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [resetHolding, setResetHolding] = useState(false)
  const [recoveryBusy, setRecoveryBusy] = useState(false)
  const [recoveryError, setRecoveryError] = useState<string | null>(null)
  const resetHoldRef = useRef<number | null>(null)
  const resetHoldTriggeredRef = useRef(false)

  useEffect(() => {
    if (!sessionRecovery) return
    // A recovered scenario may already have reconstructed locally. Freeze simulation while
    // the instructor decides whether the surrounding room should also be recovered.
    onPausedChange(true)
    setRecoveryError(null)
  }, [sessionRecovery?.sessionId])

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

  const restartScenario = async () => {
    if (restarting || resetting || !scenarioIndicator || typeof window === 'undefined') return
    setRestarting(true)
    try {
      const key = `loppjusim.scenario-runtime:${window.location.pathname}`
      const raw = window.localStorage.getItem(key)
      if (!raw) return
      const persisted = JSON.parse(raw) as PersistedScenarioRuntime
      if (!persisted.scenario) return
      const identity = scenarioIdentity(persisted.scenario)

      // Restart is deliberately a clean clinical run inside the same live session: stop the
      // old runtime, clear ActionEffects/transient state, restore product defaults, then apply
      // Stage 1 again. Session identity, key and participants are left untouched.
      await resetSimulation(publicBrandKicker)
      onPausedChange(false)
      onSpeedChange(1)

      // Product/session state propagation is debounced in a few paths. Allow the clean-default
      // reset to settle before creating the new run boundary so a delayed reset-state entry
      // cannot appear as though it belongs to the freshly restarted scenario.
      await new Promise<void>((resolve) => window.setTimeout(resolve, RESTART_LOG_SETTLE_MS))

      // This durable boundary keeps the normal Session Log focused on the new run after a
      // restart without deleting earlier rows that remain useful for audit/debrief.
      await recordSessionLogEvent({
        category: 'scenario',
        eventType: 'scenario.restarted',
        label: `Scenario restarted: “${identity.name}” — clean baseline restored`,
        details: { scenarioId: identity.id, scenarioName: identity.name },
        simulationTimeSeconds: elapsedSeconds,
      })

      window.dispatchEvent(new CustomEvent(LOPPJUSIM_RUN_SCENARIO_EVENT, {
        detail: { definition: persisted.scenario, simulationTime: elapsedSeconds },
      }))
      setResetOpen(false)
    } finally {
      setRestarting(false)
    }
  }

  const confirmReset = async () => {
    if (resetting || restarting) return
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

  const continueRecoveredSession = async () => {
    if (!sessionRecovery || recoveryBusy) return
    setRecoveryBusy(true)
    setRecoveryError(null)
    try {
      const resumed = await sessionRecovery.continueSession()
      if (!resumed) setRecoveryError('Unable to continue the previous session. You can retry or start a new session.')
    } catch (cause) {
      setRecoveryError(cause instanceof Error ? cause.message : 'Unable to continue the previous session.')
    } finally {
      setRecoveryBusy(false)
    }
  }

  const startNewRecoveredSession = async () => {
    if (!sessionRecovery || recoveryBusy) return
    setRecoveryBusy(true)
    setRecoveryError(null)
    try {
      const retired = await sessionRecovery.startNewSession()
      if (!retired) {
        setRecoveryError('Unable to end the previous session. It has not been replaced.')
        return
      }
      await resetSimulation(publicBrandKicker)
      onPausedChange(false)
      onSpeedChange(1)
      window.dispatchEvent(new Event(LOPPJUSIM_OPEN_SESSIONS_EVENT))
    } catch (cause) {
      setRecoveryError(cause instanceof Error ? cause.message : 'Unable to start a new session.')
    } finally {
      setRecoveryBusy(false)
    }
  }

  const sessionPreserved = runMode === 'instructor'
  const busy = resetting || restarting

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
          title={`${pauseLabel}. Press and hold for simulation controls.`}
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

    {sessionRecovery && <div className="simulation-reset-backdrop" role="presentation">
      <section className="simulation-reset-dialog" role="dialog" aria-modal="true" aria-label="Recover instructor session">
        <div className="simulation-reset-heading"><div><span>Session recovery</span><strong>Active session found</strong></div></div>
        <p>Session <strong>{sessionRecovery.sessionKey || 'active'}</strong> was running before this page loaded. Continue it with the same participants and scenario state, or end it and start a new session from clean simulator defaults.</p>
        {recoveryError && <p className="session-error">{recoveryError}</p>}
        <div className="simulation-reset-actions">
          <button type="button" className="restart" disabled={recoveryBusy} onClick={() => void continueRecoveredSession()}>{recoveryBusy ? 'Working…' : 'Continue existing session'}</button>
          <button type="button" className="danger" disabled={recoveryBusy} onClick={() => void startNewRecoveredSession()}>Start new session</button>
        </div>
      </section>
    </div>}

    {resetOpen && <div className="simulation-reset-backdrop" role="presentation" onMouseDown={() => { if (!busy) setResetOpen(false) }}>
      <section className="simulation-reset-dialog" role="dialog" aria-modal="true" aria-label="Simulation controls" onMouseDown={(event) => event.stopPropagation()}>
        <div className="simulation-reset-heading"><div><span>Simulation control</span><strong>{scenarioIndicator ? 'Scenario and simulation controls' : 'Reset simulation?'}</strong></div><button type="button" disabled={busy} onClick={() => setResetOpen(false)} aria-label="Close">×</button></div>
        <p>{scenarioIndicator
          ? 'Restart the active scenario from a clean simulator baseline at Stage 1, or reset the simulator completely.'
          : sessionPreserved
            ? 'This will clear transient simulator state and restore the simulator defaults. The active session, session key and connected candidates will be preserved.'
            : 'This will clear transient simulator state and restore the simulator defaults.'}</p>
        <div className="simulation-reset-actions">
          {scenarioIndicator && <button type="button" className="restart" disabled={busy} onClick={() => void restartScenario()}>{restarting ? 'Restarting…' : 'Restart scenario'}</button>}
          <button type="button" className="danger" disabled={busy} onClick={() => void confirmReset()}>{resetting ? 'Resetting…' : 'Reset simulation'}</button>
          <button type="button" disabled={busy} onClick={() => setResetOpen(false)}>Cancel</button>
        </div>
      </section>
    </div>}
  </>
}
