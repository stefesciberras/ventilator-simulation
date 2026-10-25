import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getActionRuntimeSimulationTime } from '../edusim/actions/ActionRuntime'
import { recordSessionLogEvent } from '../teaching/session/sessionLog'
import { latestEdumonRespiratoryOutput, resolvedMonitorRespiratorySettings } from './respiratoryPhysiology'
import { applyAnaestheticDepthEffects, depthFromMac, resolvedAnaestheticPhysiology } from './anaestheticPhysiology'
import { currentNeuromuscularBlock, currentTofMinimumCount } from './actionPhysiology'
import { EdumonBisTrend } from './EdumonBisTrend'
import {
  DEFAULT_MONITOR_ANAESTHETIC_GAS_SETTINGS,
  type AnaestheticDepth,
  type MonitorAnaestheticGasSettings,
  type MonitorPatientState,
} from './types'
import './edumon-ana-gases.css'

type TofReading = { count: number; ratio: number; measuredAt: number }

interface EdumonAnaGasControlProps {
  patientState: MonitorPatientState
  onPatientStateChange: (state: MonitorPatientState) => void
  sideControlsLocked?: boolean
}

const SLIDER_SETTLE_MS = 5200
const SEVO_LOG_SETTLE_MS = 450
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
  return { ...DEFAULT_MONITOR_ANAESTHETIC_GAS_SETTINGS, ...(state.anaestheticGases ?? {}) }
}

function tofFromBlock(block: number, minimumCount: number): Pick<TofReading, 'count' | 'ratio'> {
  const residualBlock = clamp(block, 0, 1)
  let count = residualBlock >= 0.95 ? 0 : residualBlock >= 0.8 ? 1 : residualBlock >= 0.6 ? 2 : residualBlock >= 0.35 ? 3 : 4
  count = Math.max(count, Math.round(clamp(minimumCount, 0, 4)))
  const ratio = count < 4 ? 0 : clamp(1 - residualBlock * 1.2, 0, 1)
  return { count, ratio }
}

export function EdumonAnaGasControl({ patientState, onPatientStateChange, sideControlsLocked = false }: EdumonAnaGasControlProps) {
  const patientRef = useRef(patientState)
  const settleTimerRef = useRef<number | null>(null)
  const sevoLogTimerRef = useRef<number | null>(null)
  const tofTimerRef = useRef<number | null>(null)
  const etSevoRef = useRef(0)
  const lastAutoDepthRef = useRef<AnaestheticDepth | null>(null)
  const [footerHost, setFooterHost] = useState<HTMLElement | null>(null)
  const [overlayHost, setOverlayHost] = useState<HTMLElement | null>(null)
  const [physioHost, setPhysioHost] = useState<HTMLElement | null>(null)
  const [fiSevoActive, setFiSevoActive] = useState(false)
  const [etSevo, setEtSevo] = useState(0)
  const [etO2, setEtO2] = useState(16)
  const [tofReading, setTofReading] = useState<TofReading | null>(null)
  const [tofMeasuring, setTofMeasuring] = useState(false)

  patientRef.current = patientState
  const respiratory = resolvedMonitorRespiratorySettings(patientState)
  const anaesthetic = resolvedAnaestheticGases(patientState)
  const anaestheticPhysiology = resolvedAnaestheticPhysiology(patientState)
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
    return () => { observer.disconnect(); window.removeEventListener('resize', findHosts) }
  }, [])

  useEffect(() => {
    let frame = 0
    let previous = performance.now()
    let lastPublish = 0
    const tick = (now: number) => {
      const wallDt = clamp((now - previous) / 1000, 0, 0.1)
      previous = now
      const output = latestEdumonRespiratoryOutput()
      if (output && now - lastPublish > 100) { setEtO2(clamp(output.alveolarOxygenFraction * 100, 0, 100)); lastPublish = now }
      if (!simulationIsPaused()) {
        const current = patientRef.current
        const respiratoryState = resolvedMonitorRespiratorySettings(current)
        const gases = resolvedAnaestheticGases(current)
        const alveolarVentilation = output?.alveolarVentilationLMin
          ?? Math.max(0, (respiratoryState.tidalVolumeMl - respiratoryState.deadSpaceMl) * respiratoryState.respiratoryRate / 1000)
        const frcL = Math.max(0.5, respiratoryState.frcMl / 1000)
        const turnoverPerSecond = alveolarVentilation / 60 / frcL
        const timeConstant = Math.max(8, 1 / Math.max(turnoverPerSecond * 0.62, 1 / 180))
        const dt = wallDt * currentSimulationSpeed()
        const fraction = 1 - Math.exp(-dt / timeConstant)
        const nextEtSevo = clamp(etSevoRef.current + (gases.fiSevoPercent - etSevoRef.current) * fraction, 0, 8)
        etSevoRef.current = nextEtSevo
        setEtSevo(nextEtSevo)
        const physiology = resolvedAnaestheticPhysiology(current)
        const nextDepth = depthFromMac(nextEtSevo / SEVO_MAC_PERCENT, physiology.anaestheticSensitivity)
        if (lastAutoDepthRef.current !== nextDepth) {
          lastAutoDepthRef.current = nextDepth
          if (physiology.depthOfAnaesthesia !== nextDepth) {
            const nextState = applyAnaestheticDepthEffects(current, nextDepth, physiology.anaestheticResponse)
            patientRef.current = nextState
            onPatientStateChange(nextState)
          }
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [onPatientStateChange])

  useEffect(() => () => {
    if (settleTimerRef.current != null) window.clearTimeout(settleTimerRef.current)
    if (sevoLogTimerRef.current != null) window.clearTimeout(sevoLogTimerRef.current)
    if (tofTimerRef.current != null) window.clearTimeout(tofTimerRef.current)
  }, [])

  const armSettleTimer = () => {
    if (settleTimerRef.current != null) window.clearTimeout(settleTimerRef.current)
    settleTimerRef.current = window.setTimeout(() => { settleTimerRef.current = null; setFiSevoActive(false) }, SLIDER_SETTLE_MS)
  }

  const selectFiSevo = () => { setFiSevoActive((current) => !current); armSettleTimer() }

  const updateFiSevo = (percent: number) => {
    const nextPercent = clamp(percent, 0, 8)
    const current = patientRef.current
    const nextState = { ...current, anaestheticGases: { ...resolvedAnaestheticGases(current), fiSevoPercent: nextPercent } }
    patientRef.current = nextState
    onPatientStateChange(nextState)
    if (sevoLogTimerRef.current != null) window.clearTimeout(sevoLogTimerRef.current)
    sevoLogTimerRef.current = window.setTimeout(() => {
      sevoLogTimerRef.current = null
      void recordSessionLogEvent({
        category: 'device',
        eventType: 'anaesthesia.sevo.set',
        label: `Sevo set at ${nextPercent.toFixed(1)}%`,
        details: { fiSevoPercent: nextPercent },
      }).catch(() => undefined)
    }, SEVO_LOG_SETTLE_MS)
    armSettleTimer()
  }

  const updateAnaestheticResponse = (value: number) => {
    const current = patientRef.current
    const physiology = resolvedAnaestheticPhysiology(current)
    const nextState = applyAnaestheticDepthEffects(current, physiology.depthOfAnaesthesia, clamp(value, -1, 1))
    patientRef.current = nextState
    onPatientStateChange(nextState)
  }

  const startTofMeasurement = () => {
    if (tofMeasuring) return
    setTofMeasuring(true)
    if (tofTimerRef.current != null) window.clearTimeout(tofTimerRef.current)
    tofTimerRef.current = window.setTimeout(() => {
      tofTimerRef.current = null
      const simulationTime = getActionRuntimeSimulationTime()
      const reading = tofFromBlock(currentNeuromuscularBlock(simulationTime), currentTofMinimumCount(simulationTime))
      setTofReading({ ...reading, measuredAt: Date.now() })
      setTofMeasuring(false)
      void recordSessionLogEvent({
        category: 'device',
        eventType: 'tof.measured',
        label: `TOF measured — count ${reading.count}, ratio ${reading.ratio.toFixed(1)}`,
        details: { count: reading.count, ratio: reading.ratio },
        simulationTimeSeconds: simulationTime,
      }).catch(() => undefined)
    }, TOF_MEASUREMENT_MS)
  }

  const footer = footerHost ? createPortal(
    <>
      <button type="button" className={`edumon-tof-container ${tofMeasuring ? 'measuring' : ''}`.trim()} onClick={startTofMeasurement} disabled={tofMeasuring} aria-label={tofMeasuring ? 'TOF measurement in progress' : 'Start TOF measurement'} title="Press to perform an intermittent TOF measurement">
        <span className="edumon-tof-title">TOF</span>
        <span className="edumon-tof-reading"><small>Count</small><strong>{tofReading?.count ?? '—'}</strong></span>
        <span className="edumon-tof-reading"><small>Ratio</small><strong>{tofReading ? tofReading.ratio.toFixed(1) : '—'}</strong></span>
        <span className="edumon-tof-status">{tofMeasuring ? 'MEAS' : tofReading ? 'Last' : 'Press'}</span>
      </button>
      <section className="edumon-ana-gas-footer" aria-label="Anaesthetic gas monitoring">
        <div className="edumon-gas-group edumon-gas-group-o2">
          <div className="edumon-gas-group-title">O₂</div>
          <div className="edumon-gas-row edumon-gas-row-fi" aria-label={`Inspired oxygen ${fio2Percent} percent`}><span>Fi</span><strong>{fio2Percent}</strong><small>%</small></div>
          <div className="edumon-gas-row edumon-gas-row-fe"><span>Fe</span><strong>{Math.round(etO2)}</strong><small>%</small></div>
        </div>
        <div className="edumon-gas-group edumon-gas-group-sevo">
          <div className="edumon-gas-group-title">Sevo</div>
          <button type="button" className={`edumon-gas-row edumon-gas-row-fi adjustable ${fiSevoActive ? 'active' : ''}`.trim()} onClick={selectFiSevo} aria-label={`Adjust inspired sevoflurane, currently ${fiSevo.toFixed(1)} percent`}>
            <span>Fi</span><strong>{fiSevo.toFixed(1)}</strong><small>%</small><i className="edumon-gas-control-knob" aria-hidden="true"><b /></i>
          </button>
          <div className="edumon-gas-row edumon-gas-row-fe"><span>Fe</span><strong>{etSevo.toFixed(1)}</strong><small>%</small></div>
        </div>
        <div className="edumon-gas-mac"><span>MAC</span><strong>{mac.toFixed(1)}</strong><small>Sevo</small></div>
      </section>
    </>, footerHost,
  ) : null

  const overlay = overlayHost && fiSevoActive ? createPortal(
    <div className="edumon-gas-slider-overlay" role="group" aria-label="Inspired sevoflurane quick control">
      <div className="edumon-gas-slider-heading"><strong>FiSevo</strong><span>{fiSevo.toFixed(1)}%</span></div>
      <input type="range" min="0" max="8" step="0.1" value={fiSevo} onPointerDown={armSettleTimer} onChange={(event) => updateFiSevo(Number(event.target.value))} />
    </div>, overlayHost,
  ) : null

  const sideControl = physioHost ? createPortal(
    <>
      <label className="edumon-signal-control edumon-signal-agent edumon-ana-response-side-control">
        <span>Anaesthesia response <b>{anaestheticPhysiology.anaestheticResponse >= 0 ? '+' : ''}{anaestheticPhysiology.anaestheticResponse.toFixed(1)}</b></span>
        <input disabled={sideControlsLocked} type="range" min="-1" max="1" step="0.1" value={anaestheticPhysiology.anaestheticResponse} onChange={(event) => updateAnaestheticResponse(Number(event.target.value))} />
      </label>
      <label className="edumon-signal-control edumon-signal-agent edumon-ana-fisevo-side-control">
        <span>FiSevo <b>{fiSevo.toFixed(1)}%</b></span>
        <input disabled={sideControlsLocked} type="range" min="0" max="8" step="0.1" value={fiSevo} onChange={(event) => updateFiSevo(Number(event.target.value))} />
      </label>
    </>, physioHost,
  ) : null

  return <><EdumonBisTrend patientState={patientState} />{footer}{overlay}{sideControl}</>
}
