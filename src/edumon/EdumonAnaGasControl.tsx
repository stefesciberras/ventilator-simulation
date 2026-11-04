import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LOPPJUSIM_SIMULATION_RESET_EVENT } from '../core/platformEvents'
import { getActionRuntimeSimulationTime } from '../edusim/actions/ActionRuntime'
import { markSessionLogModelState, recordSessionLogEvent } from '../teaching/session/sessionLog'
import { latestEdumonRespiratoryOutput, resolvedMonitorRespiratorySettings } from './respiratoryPhysiology'
import { applyAnaestheticDepthEffects, depthFromMac, resolvedAnaestheticPhysiology } from './anaestheticPhysiology'
import { advanceEndTidalSevo, estimatedAlveolarVentilationLMin, SEVO_MAC_PERCENT } from './sharedVolatilePhysiology.mjs'
import { currentNeuromuscularBlock, currentTofMinimumCount } from './actionPhysiology'
import { tofReadingFromBlock } from './sharedAnaestheticMeasurements.mjs'
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
  /** Session v2 is authoritative; null means awaiting a canonical snapshot. */
  v2VolatileState?: { etSevoPercent: number | null }
  v2MonitorState?: { bisValue: number | null; simulationTime: number | null;
    tofReading: { count: number; ratio: number; measuredAtSimulationTime: number } | null }
  onV2TofMeasure?: () => void
}

const SLIDER_SETTLE_MS = 5200
const SEVO_LOG_SETTLE_MS = 450
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


export function EdumonAnaGasControl({ patientState, onPatientStateChange, sideControlsLocked = false, v2VolatileState, v2MonitorState, onV2TofMeasure }: EdumonAnaGasControlProps) {
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
  const [bisResetEpoch, setBisResetEpoch] = useState(0)
  const [etO2, setEtO2] = useState(16)
  const [tofReading, setTofReading] = useState<TofReading | null>(null)
  const [tofMeasuring, setTofMeasuring] = useState(false)

  patientRef.current = patientState
  const respiratory = resolvedMonitorRespiratorySettings(patientState)
  const anaesthetic = resolvedAnaestheticGases(patientState)
  const anaestheticPhysiology = resolvedAnaestheticPhysiology(patientState)
  const fio2Percent = Math.round(respiratory.fio2 * 100)
  const fiSevo = clamp(anaesthetic.fiSevoPercent, 0, 8)
  const externalV2Gas = v2VolatileState !== undefined
  const displayedEtSevo = externalV2Gas ? v2VolatileState.etSevoPercent : etSevo
  const displayedMac = displayedEtSevo == null ? null : displayedEtSevo / SEVO_MAC_PERCENT
  const tofValue = v2MonitorState !== undefined ? v2MonitorState.tofReading : tofReading

  useEffect(() => {
    const resetAnaestheticGasRuntime = () => {
      if (settleTimerRef.current != null) window.clearTimeout(settleTimerRef.current)
      if (sevoLogTimerRef.current != null) window.clearTimeout(sevoLogTimerRef.current)
      if (tofTimerRef.current != null) window.clearTimeout(tofTimerRef.current)
      settleTimerRef.current = null
      sevoLogTimerRef.current = null
      tofTimerRef.current = null
      etSevoRef.current = 0
      lastAutoDepthRef.current = null
      setFiSevoActive(false)
      setEtSevo(0)
      setBisResetEpoch((previous) => previous + 1)
      setEtO2(16)
      setTofReading(null)
      setTofMeasuring(false)
    }
    window.addEventListener(LOPPJUSIM_SIMULATION_RESET_EVENT, resetAnaestheticGasRuntime)
    return () => window.removeEventListener(LOPPJUSIM_SIMULATION_RESET_EVENT, resetAnaestheticGasRuntime)
  }, [])

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
    // The experimental v2 authority owns EtSevo kinetics. The v1 local
    // animation would otherwise overwrite gas concentration and depth after
    // every welcome/reset snapshot, and restart from zero on page refresh.
    if (externalV2Gas) return
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
          ?? estimatedAlveolarVentilationLMin(respiratoryState)
        const dt = wallDt * currentSimulationSpeed()
        const nextEtSevo = advanceEndTidalSevo({
          etSevoPercent: etSevoRef.current,
          fiSevoPercent: gases.fiSevoPercent,
          alveolarVentilationLMin: alveolarVentilation,
          frcMl: respiratoryState.frcMl,
          dtSeconds: dt,
        })
        etSevoRef.current = nextEtSevo
        setEtSevo(nextEtSevo)
        const physiology = resolvedAnaestheticPhysiology(current)
        const nextDepth = depthFromMac(nextEtSevo / SEVO_MAC_PERCENT, physiology.anaestheticSensitivity)
        if (lastAutoDepthRef.current !== nextDepth) {
          lastAutoDepthRef.current = nextDepth
          if (physiology.depthOfAnaesthesia !== nextDepth) {
            const nextState = applyAnaestheticDepthEffects(current, nextDepth, physiology.anaestheticResponse)
            markSessionLogModelState(nextState)
            patientRef.current = nextState
            onPatientStateChange(nextState)
          }
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [onPatientStateChange, externalV2Gas])

  useEffect(() => () => {
    if (settleTimerRef.current != null) window.clearTimeout(settleTimerRef.current)
    if (sevoLogTimerRef.current != null) window.clearTimeout(sevoLogTimerRef.current)
    if (tofTimerRef.current != null) window.clearTimeout(tofTimerRef.current)
  }, [])

  const armSettleTimer = () => {
    if (settleTimerRef.current != null) window.clearTimeout(settleTimerRef.current)
    settleTimerRef.current = window.setTimeout(() => { settleTimerRef.current = null; setFiSevoActive(false) }, SLIDER_SETTLE_MS)
  }

  const selectFiSevo = () => { if (externalV2Gas) return; setFiSevoActive((current) => !current); armSettleTimer() }

  const updateFiSevo = (percent: number) => {
    if (externalV2Gas) return
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
    if (externalV2Gas) return
    const current = patientRef.current
    const physiology = resolvedAnaestheticPhysiology(current)
    const nextState = applyAnaestheticDepthEffects(current, physiology.depthOfAnaesthesia, clamp(value, -1, 1))
    patientRef.current = nextState
    onPatientStateChange(nextState)
  }

  const startTofMeasurement = () => {
    if (v2MonitorState !== undefined) { onV2TofMeasure?.(); return }
    if (tofMeasuring) return
    setTofMeasuring(true)
    if (tofTimerRef.current != null) window.clearTimeout(tofTimerRef.current)
    tofTimerRef.current = window.setTimeout(() => {
      tofTimerRef.current = null
      const simulationTime = getActionRuntimeSimulationTime()
      const reading = tofReadingFromBlock(currentNeuromuscularBlock(simulationTime), currentTofMinimumCount(simulationTime))
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
      <button type="button" className={`edumon-tof-container ${tofMeasuring ? 'measuring' : ''}`.trim()} onClick={startTofMeasurement} disabled={tofMeasuring || (v2MonitorState !== undefined && !onV2TofMeasure)} aria-label={tofMeasuring ? 'TOF measurement in progress' : 'Start TOF measurement'} title="Press to perform an intermittent TOF measurement">
        <span className="edumon-tof-title">TOF</span>
        <span className="edumon-tof-reading"><small>Count</small><strong>{tofValue?.count ?? '—'}</strong></span>
        <span className="edumon-tof-reading"><small>Ratio</small><strong>{tofValue ? tofValue.ratio.toFixed(1) : '—'}</strong></span>
        <span className="edumon-tof-status">{v2MonitorState !== undefined ? (tofValue ? 'Last' : 'Press') : tofMeasuring ? 'MEAS' : tofReading ? 'Last' : 'Press'}</span>
      </button>
      <section className="edumon-ana-gas-footer" aria-label="Anaesthetic gas monitoring">
        <div className="edumon-gas-group edumon-gas-group-o2">
          <div className="edumon-gas-group-title">O₂</div>
          <div className="edumon-gas-row edumon-gas-row-fi" aria-label={`Inspired oxygen ${fio2Percent} percent`}><span>Fi</span><strong>{fio2Percent}</strong><small>%</small></div>
          <div className="edumon-gas-row edumon-gas-row-fe"><span>Fe</span><strong>{Math.round(etO2)}</strong><small>%</small></div>
        </div>
        <div className="edumon-gas-group edumon-gas-group-sevo">
          <div className="edumon-gas-group-title">Sevo</div>
          <button type="button" className={`edumon-gas-row edumon-gas-row-fi ${externalV2Gas ? 'v2-readonly' : 'adjustable'} ${fiSevoActive ? 'active' : ''}`.trim()} onClick={selectFiSevo} disabled={externalV2Gas} aria-label={`Adjust inspired sevoflurane, currently ${fiSevo.toFixed(1)} percent`}>
            <span>Fi</span><strong>{fiSevo.toFixed(1)}</strong><small>%</small><i className="edumon-gas-control-knob" aria-hidden="true"><b /></i>
          </button>
          <div className="edumon-gas-row edumon-gas-row-fe"><span>Fe</span><strong>{displayedEtSevo == null ? '—' : displayedEtSevo.toFixed(1)}</strong><small>%</small></div>
        </div>
        <div className="edumon-gas-mac"><span>MAC</span><strong>{displayedMac == null ? '—' : displayedMac.toFixed(1)}</strong><small>Sevo</small></div>
      </section>
    </>, footerHost,
  ) : null

  const overlay = overlayHost && fiSevoActive && !externalV2Gas ? createPortal(
    <div className="edumon-gas-slider-overlay" role="group" aria-label="Inspired sevoflurane quick control">
      <div className="edumon-gas-slider-heading"><strong>FiSevo</strong><span>{fiSevo.toFixed(1)}%</span></div>
      <input type="range" min="0" max="8" step="0.1" value={fiSevo} onPointerDown={armSettleTimer} onChange={(event) => updateFiSevo(Number(event.target.value))} />
    </div>, overlayHost,
  ) : null

  const sideControl = physioHost ? createPortal(
    <>
      <label className="edumon-signal-control edumon-signal-agent edumon-ana-response-side-control">
        <span>Anaesthesia response <b>{anaestheticPhysiology.anaestheticResponse >= 0 ? '+' : ''}{anaestheticPhysiology.anaestheticResponse.toFixed(1)}</b></span>
        <input disabled={sideControlsLocked || externalV2Gas} type="range" min="-1" max="1" step="0.1" value={anaestheticPhysiology.anaestheticResponse} onChange={(event) => updateAnaestheticResponse(Number(event.target.value))} />
      </label>
      <label className="edumon-signal-control edumon-signal-agent edumon-ana-fisevo-side-control">
        <span>FiSevo <b>{fiSevo.toFixed(1)}%</b></span>
        <input disabled={sideControlsLocked || externalV2Gas} type="range" min="0" max="8" step="0.1" value={fiSevo} onChange={(event) => updateFiSevo(Number(event.target.value))} />
      </label>
    </>, physioHost,
  ) : null

  return <><EdumonBisTrend key={bisResetEpoch} patientState={patientState} v2BisState={v2MonitorState === undefined ? undefined : { value: v2MonitorState.bisValue, simulationTime: v2MonitorState.simulationTime }} />{footer}{overlay}{sideControl}</>
}
