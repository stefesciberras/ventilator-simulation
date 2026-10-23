import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { RollingSignalHistory } from '../core/RollingSignalHistory'
import { autoscaleWaveformSamples } from '../core/WaveformAutoscale'
import {
  createEdumonRespiratoryRuntime,
  stepEdumonRespiratoryRuntime,
  type EdumonRespiratoryRuntime,
} from './respiratoryPhysiology'
import type { MonitorPatientState } from './types'
import './edumon-capnography.css'

interface CapnographySample {
  time: number
  co2: number
}

const TRACE_WINDOW_SECONDS = 8
const SAMPLE_RATE = 50
const SAMPLE_INTERVAL = 1 / SAMPLE_RATE

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const x = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1)
  return x * x * (3 - 2 * x)
}

/**
 * Product-neutral time capnogram morphology. The shared gas-exchange engine
 * supplies respiratory rate and EtCO2; EDUMON owns only monitor presentation.
 */
function capnogramAtTime(time: number, respiratoryRate: number, etCo2: number): number {
  const rate = clamp(respiratoryRate, 0, 80)
  if (rate <= 0 || etCo2 <= 0) return 0
  const phase = ((time * rate) / 60) % 1

  // Inspiration / zero baseline.
  if (phase < 0.30) return 0

  // Phase II: rapid expiratory upstroke.
  if (phase < 0.40) {
    return etCo2 * 0.88 * smoothstep(0.30, 0.40, phase)
  }

  // Phase III: gently rising alveolar plateau terminating at EtCO2.
  if (phase < 0.78) {
    const plateau = (phase - 0.40) / 0.38
    return etCo2 * (0.88 + 0.12 * plateau)
  }

  // Inspiratory downstroke, then a short true zero baseline before the next breath.
  if (phase < 0.86) {
    return etCo2 * (1 - smoothstep(0.78, 0.86, phase))
  }
  return 0
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

function CapnographyCanvas({ samples, etCo2 }: { samples: CapnographySample[]; etCo2: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scale = autoscaleWaveformSamples(
    samples,
    (sample) => sample.co2,
    {
      fallbackMin: 0,
      fallbackMax: 50,
      paddingFraction: 0.08,
      minimumSpan: 50,
      roundTo: 10,
      hardMin: 0,
      hardMax: 150,
    },
  )
  if (etCo2 > scale.max) scale.max = Math.min(150, Math.ceil(etCo2 / 10) * 10)

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

export function EdumonCapnographySurface({ patientState }: { patientState: MonitorPatientState }) {
  const patientRef = useRef(patientState)
  const runtimeRef = useRef<EdumonRespiratoryRuntime>(createEdumonRespiratoryRuntime(patientState, 0))
  const historyRef = useRef(new RollingSignalHistory<CapnographySample>(TRACE_WINDOW_SECONDS))
  const simulationTimeRef = useRef(0)
  const lastSampleTimeRef = useRef(-SAMPLE_INTERVAL)
  const [waveformHost, setWaveformHost] = useState<HTMLElement | null>(null)
  const [measurementHost, setMeasurementHost] = useState<HTMLElement | null>(null)
  const [samples, setSamples] = useState<CapnographySample[]>([])
  const [etCo2, setEtCo2] = useState(runtimeRef.current.output.estimatedEtCo2MmHg)
  const [respiratoryRate, setRespiratoryRate] = useState(runtimeRef.current.output.respiratoryRate)

  patientRef.current = patientState

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
    let frame = 0
    let previousWallTime = performance.now()
    let lastPublishWallTime = 0

    const tick = (wallTime: number) => {
      const wallDeltaSeconds = clamp((wallTime - previousWallTime) / 1000, 0, 0.1)
      previousWallTime = wallTime
      if (!simulationIsPaused()) simulationTimeRef.current += wallDeltaSeconds * currentSimulationSpeed()

      const simulationTime = simulationTimeRef.current
      let nextSampleTime = lastSampleTimeRef.current + SAMPLE_INTERVAL
      while (nextSampleTime <= simulationTime + SAMPLE_INTERVAL * 0.1) {
        runtimeRef.current = stepEdumonRespiratoryRuntime(runtimeRef.current, patientRef.current, nextSampleTime)
        const output = runtimeRef.current.output
        historyRef.current.append({
          time: nextSampleTime,
          co2: capnogramAtTime(nextSampleTime, output.respiratoryRate, output.estimatedEtCo2MmHg),
        })
        lastSampleTimeRef.current = nextSampleTime
        nextSampleTime += SAMPLE_INTERVAL
      }
      historyRef.current.trim(simulationTime)

      if (wallTime - lastPublishWallTime >= 50) {
        lastPublishWallTime = wallTime
        setSamples(historyRef.current.snapshot())
        setEtCo2(runtimeRef.current.output.estimatedEtCo2MmHg)
        setRespiratoryRate(runtimeRef.current.output.respiratoryRate)
      }
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const waveform = waveformHost
    ? createPortal(<CapnographyCanvas samples={samples} etCo2={etCo2} />, waveformHost)
    : null

  const measurement = measurementHost
    ? createPortal(
      <div className="edumon-value-panel edumon-value-capnography metric">
        <span className="edumon-value-label">EtCO₂</span>
        <strong className="edumon-value-main">{Math.round(etCo2)}</strong>
        <small className="edumon-value-unit">mmHg</small>
        <div className="edumon-value-detail">RR {Math.round(respiratoryRate)} /min</div>
      </div>,
      measurementHost,
    )
    : null

  return <>{waveform}{measurement}</>
}
