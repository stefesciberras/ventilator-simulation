import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LOPPJUSIM_SIMULATION_RESET_EVENT } from '../core/platformEvents'
import { RollingSignalHistory } from '../core/RollingSignalHistory'
import { autoscaleWaveformSamples } from '../core/WaveformAutoscale'
import {
  createEdumonRespiratoryRuntime,
  resolvedMonitorRespiratorySettings,
  stepEdumonRespiratoryRuntime,
  type EdumonRespiratoryRuntime,
} from './respiratoryPhysiology'
import { DEFAULT_MONITOR_STATE, type MonitorPatientState, type MonitorRespiratorySettings } from './types'
import type { SessionV2RespiratoryRuntime } from './AnaesthSessionV2Preview'
import { v2WaveformPresentationTime } from './v2WaveformPresentation.mjs'
import './edumon-capnography.css'

interface CapnographySample {
  time: number
  co2: number
}

interface CapnogramRuntime {
  breathPhase: number
  elapsedExpiration: number
  airwayCo2: number
  expiratory: boolean
}

const TRACE_WINDOW_SECONDS = 8
const SAMPLE_RATE = 50
const SAMPLE_INTERVAL = 1 / SAMPLE_RATE
const MIN_CAPNOGRAPHY_MAX_MMHG = 30

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function capnogramSourceValue(
  expiratory: boolean,
  elapsedExpiration: number,
  respiratory: MonitorRespiratorySettings,
  etCo2: number,
): number {
  if (!expiratory || elapsedExpiration < 0) return 0

  const complianceL = Math.max(respiratory.complianceMlPerCmH2O / 1000, 0.005)
  const tau = Math.max(respiratory.expiratoryResistanceCmH2OLs * complianceL, 0.05)
  const obstruction = clamp((tau - 0.45) / 1.8, 0, 1)
  const deadSpaceDelay = 0.03 + respiratory.deadSpaceMl / 5000 + 0.05 * obstruction
  if (elapsedExpiration <= deadSpaceDelay) return 0

  const riseTime = clamp(0.14 + 0.42 * tau, 0.16, 1.6)
  const riseProgress = clamp((elapsedExpiration - deadSpaceDelay) / riseTime, 0, 1)
  const normalRise = 1 - Math.pow(1 - riseProgress, 4)
  const obstructedRise = Math.pow(riseProgress, 1.35)
  const riseShape = normalRise * (1 - obstruction) + obstructedRise * obstruction
  const phaseIIEndFraction = 0.88 - 0.12 * obstruction

  if (riseProgress < 1) return clamp(etCo2 * phaseIIEndFraction * riseShape, 0, 150)

  const plateauElapsed = elapsedExpiration - deadSpaceDelay - riseTime
  const plateauRise = plateauElapsed * (0.05 + 0.08 * obstruction)
  return clamp(etCo2 * Math.min(1, phaseIIEndFraction + plateauRise), 0, 150)
}

function advanceCapnogram(
  runtime: CapnogramRuntime,
  deltaTime: number,
  respiratoryRate: number,
  etCo2: number,
  respiratory: MonitorRespiratorySettings,
): number {
  const rate = clamp(respiratoryRate, 0, 80)
  if (rate <= 0) {
    runtime.expiratory = false
    runtime.elapsedExpiration = 0
    const fraction = 1 - Math.exp(-deltaTime / 4)
    runtime.airwayCo2 = clamp(runtime.airwayCo2 + (0 - runtime.airwayCo2) * fraction, 0, 150)
    return runtime.airwayCo2
  }

  const cycleSeconds = 60 / rate
  const inspiratoryTimeSeconds = Math.min(1, cycleSeconds * 0.45)
  const inspiratoryFraction = clamp(inspiratoryTimeSeconds / cycleSeconds, 0.18, 0.45)
  const previousPhase = runtime.breathPhase
  runtime.breathPhase = (runtime.breathPhase + (rate / 60) * deltaTime) % 1
  const wrapped = runtime.breathPhase < previousPhase
  const expiratory = runtime.breathPhase >= inspiratoryFraction

  if (wrapped || !expiratory) runtime.elapsedExpiration = 0
  else if (!runtime.expiratory && expiratory) runtime.elapsedExpiration = 0
  else runtime.elapsedExpiration += deltaTime
  runtime.expiratory = expiratory

  const target = capnogramSourceValue(expiratory, runtime.elapsedExpiration, respiratory, etCo2)
  const sensorResponseSeconds = expiratory ? 0.10 : 0.15
  const fraction = 1 - Math.exp(-deltaTime / sensorResponseSeconds)
  runtime.airwayCo2 = clamp(runtime.airwayCo2 + (target - runtime.airwayCo2) * fraction, 0, 150)
  return runtime.airwayCo2
}

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

function waveformIsFrozen(): boolean {
  return findVisibleHost('.edumon-freeze-indicator') != null
}

function CapnographyCanvas({ samples, etCo2 }: { samples: CapnographySample[]; etCo2: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scale = autoscaleWaveformSamples(
    samples,
    (sample) => sample.co2,
    {
      fallbackMin: 0,
      fallbackMax: MIN_CAPNOGRAPHY_MAX_MMHG,
      paddingFraction: 0.08,
      minimumSpan: MIN_CAPNOGRAPHY_MAX_MMHG,
      roundTo: 10,
      hardMin: 0,
      hardMax: 150,
    },
  )
  scale.max = Math.max(MIN_CAPNOGRAPHY_MAX_MMHG, scale.max)
  if (etCo2 > scale.max) scale.max = Math.min(150, Math.max(MIN_CAPNOGRAPHY_MAX_MMHG, Math.ceil(etCo2 / 10) * 10))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    const rect = canvas.getBoundingClientRect()
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(rect.width * ratio))
    canvas.height = Math.max(1, Math.round(rect.height * ratio))
    context.setTransform(ratio, 0, 0, ratio, 0, 0)

    const width = rect.width
    const height = rect.height
    context.clearRect(0, 0, width, height)
    context.strokeStyle = 'rgba(255,255,255,0.055)'
    context.lineWidth = 1
    for (let column = 1; column < 8; column += 1) {
      const x = (width * column) / 8
      context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke()
    }
    for (let row = 1; row < 4; row += 1) {
      const y = (height * row) / 4
      context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke()
    }

    if (!samples.length) return
    const range = Math.max(0.001, scale.max - scale.min)
    context.strokeStyle = getComputedStyle(canvas).color
    context.lineWidth = 2.1
    context.lineJoin = 'round'
    context.lineCap = 'round'
    context.beginPath()
    samples.forEach((sample, index) => {
      const x = (index / Math.max(1, samples.length - 1)) * width
      const y = clamp(height - ((sample.co2 - scale.min) / range) * height, 1, height - 1)
      if (index === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    })
    context.stroke()
  }, [samples, scale.min, scale.max])

  return (
    <div className="edumon-trace edumon-trace-capnography waveform-card">
      <div className="edumon-trace-label waveform-label"><strong>CO₂</strong><span>mmHg</span></div>
      <canvas ref={canvasRef} aria-label="Capnography waveform" />
      <div className="waveform-scale" aria-hidden="true"><span>{Math.round(scale.max)}</span><span>0</span></div>
    </div>
  )
}

export function EdumonCapnographySurface({ patientState, v2RespiratoryState }: {
  patientState: MonitorPatientState; v2RespiratoryState?: SessionV2RespiratoryRuntime
}) {
  const patientRef = useRef(patientState)
  const runtimeRef = useRef<EdumonRespiratoryRuntime | null>(null)
  if (v2RespiratoryState === undefined && runtimeRef.current == null) runtimeRef.current = createEdumonRespiratoryRuntime(patientState, 0)
  const capnogramRef = useRef<CapnogramRuntime>({ breathPhase: 0, elapsedExpiration: 0, airwayCo2: 0, expiratory: false })
  const historyRef = useRef(new RollingSignalHistory<CapnographySample>(TRACE_WINDOW_SECONDS))
  const simulationTimeRef = useRef(0)
  const lastSampleTimeRef = useRef(-SAMPLE_INTERVAL)
  const [waveformHost, setWaveformHost] = useState<HTMLElement | null>(null)
  const [measurementHost, setMeasurementHost] = useState<HTMLElement | null>(null)
  const [samples, setSamples] = useState<CapnographySample[]>([])
  const [etCo2, setEtCo2] = useState(runtimeRef.current?.output.estimatedEtCo2MmHg ?? 40)
  const [respiratoryRate, setRespiratoryRate] = useState(runtimeRef.current?.output.respiratoryRate ?? 12)
  const v2ReadingRef = useRef<{ snapshot: SessionV2RespiratoryRuntime; receivedAtMs: number } | null>(null)
  const v2LastSampleRef = useRef<number | null>(null)

  patientRef.current = patientState

  useEffect(() => {
    const resetCapnographyRuntime = () => {
      const runtime = createEdumonRespiratoryRuntime(DEFAULT_MONITOR_STATE, 0)
      runtimeRef.current = runtime
      capnogramRef.current = { breathPhase: 0, elapsedExpiration: 0, airwayCo2: 0, expiratory: false }
      historyRef.current = new RollingSignalHistory<CapnographySample>(TRACE_WINDOW_SECONDS)
      simulationTimeRef.current = 0
      lastSampleTimeRef.current = -SAMPLE_INTERVAL
      setSamples([])
      setEtCo2(runtime.output.estimatedEtCo2MmHg)
      setRespiratoryRate(runtime.output.respiratoryRate)
    }
    window.addEventListener(LOPPJUSIM_SIMULATION_RESET_EVENT, resetCapnographyRuntime)
    return () => window.removeEventListener(LOPPJUSIM_SIMULATION_RESET_EVENT, resetCapnographyRuntime)
  }, [])

  useEffect(() => {
    const findHosts = () => {
      setWaveformHost(findVisibleHost('.edumon-monitor-body .edumon-waveform-area'))
      setMeasurementHost(findVisibleHost('.edumon-monitor-body .edumon-measurements'))
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
    // In v2, render only from canonical respiratory snapshots. Never start
    // the local v1 gas-exchange runtime or a competing simulation clock.
    if (v2RespiratoryState !== undefined) return
    let frame = 0
    let previousWallTime = performance.now()
    let lastPublishWallTime = 0

    const tick = (wallTime: number) => {
      const wallDeltaSeconds = clamp((wallTime - previousWallTime) / 1000, 0, 0.1)
      previousWallTime = wallTime

      if (waveformIsFrozen()) {
        frame = requestAnimationFrame(tick)
        return
      }

      if (!simulationIsPaused()) simulationTimeRef.current += wallDeltaSeconds * currentSimulationSpeed()

      const simulationTime = simulationTimeRef.current
      let nextSampleTime = lastSampleTimeRef.current + SAMPLE_INTERVAL
      while (nextSampleTime <= simulationTime + SAMPLE_INTERVAL * 0.1) {
        const currentRuntime = runtimeRef.current
        if (!currentRuntime) break
        runtimeRef.current = stepEdumonRespiratoryRuntime(currentRuntime, patientRef.current, nextSampleTime)
        const output = runtimeRef.current.output
        const respiratory = resolvedMonitorRespiratorySettings(patientRef.current)
        const co2 = advanceCapnogram(
          capnogramRef.current,
          SAMPLE_INTERVAL,
          output.respiratoryRate,
          output.estimatedEtCo2MmHg,
          respiratory,
        )
        historyRef.current.append({ time: nextSampleTime, co2 })
        lastSampleTimeRef.current = nextSampleTime
        nextSampleTime += SAMPLE_INTERVAL
      }
      historyRef.current.trim(simulationTime)

      if (wallTime - lastPublishWallTime >= 50 && runtimeRef.current) {
        lastPublishWallTime = wallTime
        setSamples(historyRef.current.snapshot())
        setEtCo2(runtimeRef.current.output.estimatedEtCo2MmHg)
        setRespiratoryRate(runtimeRef.current.output.respiratoryRate)
      }
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [v2RespiratoryState !== undefined])

  useEffect(() => {
    if (v2RespiratoryState === undefined) return
    // Record the real receipt time only when the canonical snapshot changes.
    // The RAF loop interpolates the visual trace between 1 Hz server updates.
    v2ReadingRef.current = { snapshot: v2RespiratoryState, receivedAtMs: performance.now() }
    if (v2RespiratoryState.simulationTime == null) {
      v2LastSampleRef.current = null
      capnogramRef.current = { breathPhase: 0, elapsedExpiration: 0, airwayCo2: 0, expiratory: false }
      historyRef.current = new RollingSignalHistory<CapnographySample>(TRACE_WINDOW_SECONDS)
      setSamples([])
    }
  }, [v2RespiratoryState])

  useEffect(() => {
    if (v2RespiratoryState === undefined) return
    let frame = 0
    let lastPaintMs = 0
    const draw = (nowMs: number) => {
      frame = requestAnimationFrame(draw)
      const latest = v2ReadingRef.current
      if (!latest || waveformIsFrozen()) return
      const { snapshot, receivedAtMs } = latest
      const rate = snapshot.respiratoryRate
      const co2 = snapshot.estimatedEtCo2MmHg
      const time = v2WaveformPresentationTime({
        simulationTime: snapshot.simulationTime, receivedAtMs, nowMs,
        running: snapshot.clockRunning, speed: snapshot.clockSpeed,
      })
      if (time == null || co2 == null || rate == null) return

      let previous: number = v2LastSampleRef.current ?? time
      if (v2LastSampleRef.current == null || time < previous - SAMPLE_INTERVAL) {
        // Reconnect/reset: seed a short trace from canonical simulation time,
        // never replay unbounded wall time or restart local gas exchange.
        const start = Math.max(0, time - TRACE_WINDOW_SECONDS)
        const initial = Math.floor(start / SAMPLE_INTERVAL) * SAMPLE_INTERVAL
        const phase = rate > 0 ? (initial * rate / 60) % 1 : 0
        capnogramRef.current = {
          breathPhase: phase, elapsedExpiration: 0, airwayCo2: 0,
          expiratory: rate > 0 && phase >= Math.min(1, 60 / rate * .45) / (60 / rate),
        }
        historyRef.current = new RollingSignalHistory<CapnographySample>(TRACE_WINDOW_SECONDS)
        previous = initial - SAMPLE_INTERVAL
      }
      const respiratory = {
        ...resolvedMonitorRespiratorySettings(patientRef.current),
        // All v2 waveform morphology comes from the canonical event-derived
        // resistance, not a browser-owned bronchospasm slider.
        ...(snapshot.expiratoryResistanceCmH2OLs == null ? {} : {
          expiratoryResistanceCmH2OLs: snapshot.expiratoryResistanceCmH2OLs,
        }),
      }
      // A fast 4x replay may need 200 samples/s; cap each RAF catch-up so
      // disconnected/background tabs never block the main thread.
      let steps = 0
      while (previous + SAMPLE_INTERVAL <= time + 0.00001 && steps < 300) {
        const sampleTime: number = previous + SAMPLE_INTERVAL
        const value = advanceCapnogram(
          capnogramRef.current, SAMPLE_INTERVAL, rate, co2, respiratory,
        )
        historyRef.current.append({ time: sampleTime, co2: value })
        previous = sampleTime
        steps++
      }
      v2LastSampleRef.current = previous
      historyRef.current.trim(time)
      // Render at up to 20 FPS while waveform samples are computed at 50 Hz.
      if (nowMs - lastPaintMs >= 50 && steps > 0) {
        lastPaintMs = nowMs
        setSamples(historyRef.current.snapshot())
      }
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [v2RespiratoryState !== undefined])

  const displayedEtCo2 = v2RespiratoryState === undefined ? etCo2 : v2RespiratoryState.estimatedEtCo2MmHg
  const displayedRate = v2RespiratoryState === undefined ? respiratoryRate : v2RespiratoryState.respiratoryRate
  const waveform = waveformHost
    ? createPortal(<CapnographyCanvas samples={samples} etCo2={displayedEtCo2 ?? 0} />, waveformHost)
    : null

  const measurement = measurementHost
    ? createPortal(
      <div className="edumon-value-panel edumon-value-capnography metric">
        <span className="edumon-value-label">EtCO₂</span>
        <strong className="edumon-value-main">{displayedEtCo2 == null ? '—' : Math.round(displayedEtCo2)}</strong>
        <small className="edumon-value-unit">mmHg</small>
        <div className="edumon-value-detail">RR {displayedRate == null ? '—' : Math.round(displayedRate)} /min</div>
      </div>,
      measurementHost,
    )
    : null

  return <>{waveform}{measurement}</>
}
