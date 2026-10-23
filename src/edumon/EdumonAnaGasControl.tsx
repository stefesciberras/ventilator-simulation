import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { latestEdumonRespiratoryOutput, resolvedMonitorRespiratorySettings } from './respiratoryPhysiology'
import {
  DEFAULT_MONITOR_ANAESTHETIC_GAS_SETTINGS,
  type MonitorAnaestheticGasSettings,
  type MonitorPatientState,
} from './types'
import './edumon-ana-gases.css'

type AdjustableGas = 'fio2' | 'fisevo'
type TofReading = {
  count: number
  ratio: number
  measuredAt: number
}

interface EdumonAnaGasControlProps {
  patientState: MonitorPatientState
  onPatientStateChange: (state: MonitorPatientState) => void
  sideControlsLocked?: boolean
}

const SLIDER_SETTLE_MS = 5200
const SEVO_MAC_PERCENT = 2.0
const TOF_MEASUREMENT_MS = 1800

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function findVisibleHost(selector: string): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector))
  return candidates.find((candidate) => candidate.isConnected && candidate.getClientRects().length > 0)
    ?? candidates.find((candidate) => candidate.isConnected)
    ?? null
}

function currentSimulationSpeed(): number {
  const select = findVisibleHost('.simulation-speed-control select') as HTMLSelectElement | null
  const value = Number(select?.value ?? 1)
  return Number.isFinite(value) ? value : 1
}

function simulationIsPaused(): boolean {
  const pauseButton = findVisibleHost('.top-simulation-pause')
  return pauseButton?.classList.contains('paused') ?? false
}

function resolvedAnaestheticGases(state: MonitorPatientState): MonitorAnaestheticGasSettings {
  return {
    ...DEFAULT_MONITOR_ANAESTHETIC_GAS_SETTINGS,
    ...(state.anaestheticGases ?? {}),
  }
}

export function EdumonAnaGasControl({
  patientState,
  onPatientStateChange,
  sideControlsLocked = false,
}: EdumonAnaGasControlProps) {
  const patientRef = useRef(patientState)
  const settleTimerRef = useRef<number | null>(null)
  const tofTimerRef = useRef<number | null>(null)
  const [footerHost, setFooterHost] = useState<HTMLElement | null>(null)
  const [overlayHost, setOverlayHost] = useState<HTMLElement | null>(null)
  const [physioHost, setPhysioHost] = useState<HTMLElement | null>(null)
  const [activeGas, setActiveGas] = useState<AdjustableGas | null>(null)
  const [etSevo, setEtSevo] = useState(0)
  const [etO2, setEtO2] = useState(16)
  const [tofReading, setTofReading] = useState<TofReading | null>(null)
  const [tofMeasuring, setTofMeasuring] = useState(false)

  patientRef.current = patientState
  const respiratory = resolvedMonitorRespiratorySettings(patientState)
  const anaesthetic = resolvedAnaestheticGases(patientState)
  const fio2Percent = Math.round(respiratory.fio2 * 100)
  const fiSevo = clamp(anaesthetic.fiSevoPercent, 0, 8)
  const mac = etSevo / SEVO_MAC_PERCENT

  useEffect(() => {
    const findHosts = () => {
      setFooterHost(findVisibleHost('.simulation-console-footer .edumon-control-strip'))
      setOverlayHost(findVisibleHost('.edumon-monitor-body'))
      setPhysioHost(findVisibleHost('.edumon-physio-panel'))
    }
    findHosts()
    const observer = new MutationObserver(findHosts)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] })
    window.addEventListener('resize', findHosts)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', findHosts)
    }
  }, [])

  useEffect(() => {
    let frame = 0
    let previous = performance.now()
    let lastPublish = 0
    const tick = (now: number) => {
      const wallDt = clamp((now - previous) / 1000, 0, 0.1)
      previous = now
      const output = latestEdumonRespiratoryOutput()
      if (output && now - lastPublish > 100) {
        setEtO2(clamp(output.alveolarOxygenFraction * 100, 0, 100))
        lastPublish = now
      }
      if (!simulationIsPaused()) {
        const current = patientRef.current
        const respiratoryState = resolvedMonitorRespiratorySettings(current)
        const gases = resolvedAnaestheticGases(current)
        const alveolarVentilation = output?.alveolarVentilationLMin
          ?? Math.max(0, (respiratoryState.tidalVolumeMl - respiratoryState.deadSpaceMl) * respiratoryState.respiratoryRate / 1000)
        const frcL = Math.max(0.5, respiratoryState.frcMl / 1000)
        // Alveolar turnover determines wash-in/wash-out. A modest uptake factor
        // slows sevoflurane equilibration compared with an inert gas.
        const turnoverPerSecond = alveolarVentilation / 60 / frcL
        const timeConstant = Math.max(8, 1 / Math.max(turnoverPerSecond * 0.62, 1 / 180))
        const dt = wallDt * currentSimulationSpeed()
        const fraction = 1 - Math.exp(-dt / timeConstant)
        setEtSevo((value) => clamp(value + (gases.fiSevoPercent - value) * fraction, 0, 8))
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => () => {
    if (settleTimerRef.current != null) window.clearTimeout(settleTimerRef.current)
    if (tofTimerRef.current != null) window.clearTimeout(tofTimerRef.current)
  }, [])

  const armSettleTimer = () => {
    if (settleTimerRef.current != null) window.clearTimeout(settleTimerRef.current)
    settleTimerRef.current = window.setTimeout(() => {
      settleTimerRef.current = null
      setActiveGas(null)
    }, SLIDER_SETTLE_MS)
  }

  const selectGas = (gas: AdjustableGas) => {
    setActiveGas((current) => current === gas ? null : gas)
    armSettleTimer()
  }

  const updateFio2 = (percent: number) => {
    const current = patientRef.current
    const nextRespiratory = {
      ...resolvedMonitorRespiratorySettings(current),
      fio2: clamp(percent, 21, 100) / 100,
    }
    onPatientStateChange({ ...current, respiratory: nextRespiratory })
    armSettleTimer()
  }

  const updateFiSevo = (percent: number) => {
    const current = patientRef.current
    const nextGases = {
      ...resolvedAnaestheticGases(current),
      fiSevoPercent: clamp(percent, 0, 8),
    }
    onPatientStateChange({ ...current, anaestheticGases: nextGases })
    armSettleTimer()
  }

  const startTofMeasurement = () => {
    if (tofMeasuring) return
    setTofMeasuring(true)
    if (tofTimerRef.current != null) window.clearTimeout(tofTimerRef.current)
    tofTimerRef.current = window.setTimeout(() => {
      tofTimerRef.current = null
      setTofReading({ count: 4, ratio: 1.0, measuredAt: Date.now() })
      setTofMeasuring(false)
    }, TOF_MEASUREMENT_MS)
  }

  const footer = footerHost ? createPortal(
    <section className="edumon-ana-gas-footer" aria-label="Anaesthetic gas and neuromuscular monitoring">
      <div className="edumon-gas-group edumon-gas-group-o2">
        <div className="edumon-gas-group-title">O₂</div>
        <button
          type="button"
          className={`edumon-gas-row edumon-gas-row-fi adjustable ${activeGas === 'fio2' ? 'active' : ''}`.trim()}
          onClick={() => selectGas('fio2')}
          aria-label={`Adjust inspired oxygen, currently ${fio2Percent} percent`}
        >
          <span>Fi</span>
          <strong>{fio2Percent}</strong>
          <small>%</small>
          <i className="edumon-gas-control-knob" aria-hidden="true"><b /></i>
        </button>
        <div className="edumon-gas-row edumon-gas-row-fe">
          <span>Fe</span><strong>{Math.round(etO2)}</strong><small>%</small>
        </div>
      </div>

      <div className="edumon-gas-group edumon-gas-group-sevo">
        <div className="edumon-gas-group-title">Sevo</div>
        <button
          type="button"
          className={`edumon-gas-row edumon-gas-row-fi adjustable ${activeGas === 'fisevo' ? 'active' : ''}`.trim()}
          onClick={() => selectGas('fisevo')}
          aria-label={`Adjust inspired sevoflurane, currently ${fiSevo.toFixed(1)} percent`}
        >
          <span>Fi</span>
          <strong>{fiSevo.toFixed(1)}</strong>
          <small>%</small>
          <i className="edumon-gas-control-knob" aria-hidden="true"><b /></i>
        </button>
        <div className="edumon-gas-row edumon-gas-row-fe">
          <span>Fe</span><strong>{etSevo.toFixed(1)}</strong><small>%</small>
        </div>
      </div>

      <div className="edumon-gas-mac">
        <span>MAC</span>
        <strong>{mac.toFixed(1)}</strong>
        <small>Sevo</small>
      </div>

      <button
        type="button"
        className={`edumon-tof-tile ${tofMeasuring ? 'measuring' : ''}`.trim()}
        onClick={startTofMeasurement}
        disabled={tofMeasuring}
        aria-label={tofMeasuring ? 'TOF measurement in progress' : 'Start TOF measurement'}
        title="Press to perform an intermittent TOF measurement"
      >
        <span className="edumon-tof-title">TOF</span>
        <span className="edumon-tof-reading"><small>Count</small><strong>{tofReading?.count ?? '—'}</strong></span>
        <span className="edumon-tof-reading"><small>Ratio</small><strong>{tofReading ? tofReading.ratio.toFixed(1) : '—'}</strong></span>
        <span className="edumon-tof-status">{tofMeasuring ? 'MEAS' : tofReading ? 'Last' : 'Press'}</span>
      </button>
    </section>,
    footerHost,
  ) : null

  const activeValue = activeGas === 'fio2' ? fio2Percent : fiSevo
  const overlay = overlayHost && activeGas ? createPortal(
    <div className="edumon-gas-slider-overlay" role="group" aria-label={activeGas === 'fio2' ? 'FiO2 quick control' : 'Inspired sevoflurane quick control'}>
      <div className="edumon-gas-slider-heading">
        <strong>{activeGas === 'fio2' ? 'FiO₂' : 'FiSevo'}</strong>
        <span>{activeGas === 'fio2' ? `${fio2Percent}%` : `${fiSevo.toFixed(1)}%`}</span>
      </div>
      <input
        type="range"
        min={activeGas === 'fio2' ? 21 : 0}
        max={activeGas === 'fio2' ? 100 : 8}
        step={activeGas === 'fio2' ? 1 : 0.1}
        value={activeValue}
        onPointerDown={armSettleTimer}
        onChange={(event) => activeGas === 'fio2' ? updateFio2(Number(event.target.value)) : updateFiSevo(Number(event.target.value))}
      />
    </div>,
    overlayHost,
  ) : null

  const sideControl = physioHost ? createPortal(
    <label className="edumon-signal-control edumon-signal-agent edumon-ana-fisevo-side-control">
      <span>FiSevo <b>{fiSevo.toFixed(1)}%</b></span>
      <input disabled={sideControlsLocked} type="range" min="0" max="8" step="0.1" value={fiSevo} onChange={(event) => updateFiSevo(Number(event.target.value))} />
    </label>,
    physioHost,
  ) : null

  return <>{footer}{overlay}{sideControl}</>
}
