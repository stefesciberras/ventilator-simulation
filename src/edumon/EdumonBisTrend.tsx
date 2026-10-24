import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { resolvedAnaestheticPhysiology } from './anaestheticPhysiology'
import type { AnaestheticDepth, MonitorPatientState } from './types'
import './edumon-bis.css'

type BisPoint = {
  time: number
  value: number
}

interface EdumonBisTrendProps {
  patientState: MonitorPatientState
}

const BIS_WINDOW_SECONDS = 60
const BIS_TIME_CONSTANT_SECONDS = 8
const BIS_SAMPLE_INTERVAL_SECONDS = 0.75
const BIS_JITTER = 7

const BIS_TARGETS: Record<AnaestheticDepth, number> = {
  1: 20,
  2: 35,
  3: 50,
  4: 80,
  5: 100,
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

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

function simulationIsPausedOrFrozen(): boolean {
  const pauseButton = findVisibleHost('.top-simulation-pause')
  const paused = pauseButton?.classList.contains('paused') ?? false
  const frozen = Boolean(findVisibleHost('.edumon-freeze-indicator'))
  return paused || frozen
}

function BisTrendCanvas({ points }: { points: BisPoint[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

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
    for (let column = 1; column < 6; column += 1) {
      const x = (width * column) / 6
      context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke()
    }
    for (const value of [20, 40, 60, 80]) {
      const y = height - (value / 100) * height
      context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke()
    }

    if (points.length < 2) return
    const latestTime = points[points.length - 1].time
    const earliestTime = latestTime - BIS_WINDOW_SECONDS
    const visible = points.filter((point) => point.time >= earliestTime)
    if (visible.length < 2) return

    context.strokeStyle = getComputedStyle(canvas).color
    context.lineWidth = 2.1
    context.lineJoin = 'round'
    context.lineCap = 'round'
    context.beginPath()
    visible.forEach((point, index) => {
      const x = clamp((point.time - earliestTime) / BIS_WINDOW_SECONDS, 0, 1) * width
      const y = height - clamp(point.value / 100, 0, 1) * height
      if (index === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    })
    context.stroke()
  }, [points])

  return <canvas ref={canvasRef} aria-label="BIS trend over time" />
}

export function EdumonBisTrend({ patientState }: EdumonBisTrendProps) {
  const patientRef = useRef(patientState)
  const currentBisRef = useRef(100)
  const simulationTimeRef = useRef(0)
  const sampleAccumulatorRef = useRef(0)
  const jitterTargetRef = useRef(0)
  const [waveformHost, setWaveformHost] = useState<HTMLElement | null>(null)
  const [measurementHost, setMeasurementHost] = useState<HTMLElement | null>(null)
  const [bis, setBis] = useState(100)
  const [points, setPoints] = useState<BisPoint[]>([{ time: 0, value: 100 }])

  patientRef.current = patientState

  useEffect(() => {
    const findHosts = () => {
      setWaveformHost(findVisibleHost('.edumon-waveform-area'))
      setMeasurementHost(findVisibleHost('.edumon-measurements'))
    }
    findHosts()
    const observer = new MutationObserver(findHosts)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', findHosts)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', findHosts)
    }
  }, [])

  useEffect(() => {
    if (!waveformHost || !measurementHost) return
    waveformHost.classList.add('edumon-has-bis')
    measurementHost.classList.add('edumon-has-bis')
    return () => {
      waveformHost.classList.remove('edumon-has-bis')
      measurementHost.classList.remove('edumon-has-bis')
    }
  }, [waveformHost, measurementHost])

  useEffect(() => {
    let frame = 0
    let previous = performance.now()
    const tick = (now: number) => {
      const wallDt = clamp((now - previous) / 1000, 0, 0.1)
      previous = now

      if (!simulationIsPausedOrFrozen()) {
        const dt = wallDt * currentSimulationSpeed()
        simulationTimeRef.current += dt
        sampleAccumulatorRef.current += dt

        const physiology = resolvedAnaestheticPhysiology(patientRef.current)
        const depth = physiology.depthOfAnaesthesia
        const awake = depth === 5
        const target = BIS_TARGETS[depth]

        if (awake) {
          currentBisRef.current = 100
          jitterTargetRef.current = 0
        } else {
          const lagFraction = 1 - Math.exp(-dt / BIS_TIME_CONSTANT_SECONDS)
          currentBisRef.current += (target - currentBisRef.current) * lagFraction
        }

        if (sampleAccumulatorRef.current >= BIS_SAMPLE_INTERVAL_SECONDS) {
          sampleAccumulatorRef.current = 0
          if (!awake) jitterTargetRef.current = (Math.random() * 2 - 1) * BIS_JITTER
          const displayed = awake ? 100 : Math.round(clamp(currentBisRef.current + jitterTargetRef.current, 0, 100))
          setBis(displayed)
          const nextPoint = { time: simulationTimeRef.current, value: displayed }
          setPoints((current) => {
            const cutoff = simulationTimeRef.current - BIS_WINDOW_SECONDS - 5
            const retained = current.filter((point) => point.time >= cutoff)
            return [...retained, nextPoint]
          })
        }
      }

      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const trace = waveformHost ? createPortal(
    <div className="edumon-trace edumon-trace-bis waveform-card">
      <div className="edumon-trace-label waveform-label"><strong>BIS</strong><span>trend · 60 s</span></div>
      <BisTrendCanvas points={points} />
      <div className="waveform-scale" aria-hidden="true"><span>100</span><span>0</span></div>
    </div>,
    waveformHost,
  ) : null

  const measurement = measurementHost ? createPortal(
    <div className="edumon-value-panel edumon-value-bis metric">
      <span className="edumon-value-label">BIS</span>
      <strong className="edumon-value-main">{bis}</strong>
      <small className="edumon-value-unit">index</small>
    </div>,
    measurementHost,
  ) : null

  return <>{trace}{measurement}</>
}
