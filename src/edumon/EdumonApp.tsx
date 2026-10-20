import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { DEFAULT_MONITOR_STATE, type MonitorPatientState, type MonitorSample } from './types'
import { generateMonitorSamples, measurementsFor, RHYTHM_LABELS, RHYTHMS } from './monitorEngine'
import './edumon.css'

const TRACE_WINDOW_SECONDS = 8
const SAMPLE_RATE = 100

type TraceKey = 'ecg' | 'arterialPressure' | 'pleth'

interface TraceSpec {
  key: TraceKey
  label: string
  unit: string
  min: number
  max: number
  className: string
}

const TRACE_SPECS: TraceSpec[] = [
  { key: 'ecg', label: 'ECG II', unit: 'mV', min: -0.8, max: 1.6, className: 'ecg' },
  { key: 'arterialPressure', label: 'ART', unit: 'mmHg', min: 0, max: 180, className: 'art' },
  { key: 'pleth', label: 'SpO₂', unit: '', min: 0, max: 1.2, className: 'spo2' },
]

function TraceCanvas({ samples, spec }: { samples: MonitorSample[]; spec: TraceSpec }) {
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
    for (let column = 1; column < 8; column += 1) {
      const x = (width * column) / 8
      context.beginPath()
      context.moveTo(x, 0)
      context.lineTo(x, height)
      context.stroke()
    }
    for (let row = 1; row < 4; row += 1) {
      const y = (height * row) / 4
      context.beginPath()
      context.moveTo(0, y)
      context.lineTo(width, y)
      context.stroke()
    }

    if (!samples.length) return
    const range = Math.max(0.001, spec.max - spec.min)
    const toY = (value: number) => height - ((value - spec.min) / range) * height

    context.strokeStyle = getComputedStyle(canvas).color
    context.lineWidth = spec.key === 'ecg' ? 1.8 : 2.1
    context.lineJoin = 'round'
    context.lineCap = 'round'
    context.beginPath()
    samples.forEach((sample, index) => {
      const x = (index / Math.max(1, samples.length - 1)) * width
      const rawValue = sample[spec.key]
      const y = Math.max(1, Math.min(height - 1, toY(rawValue)))
      if (index === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    })
    context.stroke()
  }, [samples, spec])

  return (
    <div className={`edumon-trace edumon-trace-${spec.className}`}>
      <div className="edumon-trace-label">
        <strong>{spec.label}</strong>
        {spec.unit && <span>{spec.unit}</span>}
      </div>
      <canvas ref={canvasRef} aria-label={`${spec.label} waveform`} />
    </div>
  )
}

function ValuePanel({ label, value, unit, detail, className }: { label: string; value: string; unit?: string; detail?: string; className: string }) {
  return (
    <div className={`edumon-value-panel edumon-value-${className}`}>
      <div className="edumon-value-label">{label}</div>
      <div className="edumon-value-main">{value}</div>
      {unit && <div className="edumon-value-unit">{unit}</div>}
      {detail && <div className="edumon-value-detail">{detail}</div>}
    </div>
  )
}

export function EdumonApp() {
  const [patientState, setPatientState] = useState<MonitorPatientState>(DEFAULT_MONITOR_STATE)
  const [elapsed, setElapsed] = useState(TRACE_WINDOW_SECONDS)
  const [frozen, setFrozen] = useState(false)
  const [frozenSamples, setFrozenSamples] = useState<MonitorSample[] | null>(null)
  const [laserActive, setLaserActive] = useState(false)
  const [laserPoint, setLaserPoint] = useState({ x: 0.5, y: 0.25 })
  const [developerControls, setDeveloperControls] = useState(false)
  const frozenAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (frozen) return
    let frame = 0
    const origin = performance.now() - elapsed * 1000
    const tick = (now: number) => {
      setElapsed((now - origin) / 1000)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // Restarting from the current elapsed value after freeze is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frozen])

  const liveSamples = useMemo(
    () => generateMonitorSamples(patientState, elapsed, TRACE_WINDOW_SECONDS, SAMPLE_RATE),
    [patientState, elapsed],
  )
  const samples = frozenSamples ?? liveSamples
  const measurements = measurementsFor(patientState)

  const toggleFreeze = () => {
    if (frozen) {
      setFrozen(false)
      setFrozenSamples(null)
      frozenAtRef.current = null
      return
    }
    setFrozenSamples(liveSamples)
    setFrozen(true)
    frozenAtRef.current = elapsed
  }

  const toggleLaser = () => {
    setLaserActive((active) => {
      const next = !active
      if (next && !frozen) {
        setFrozenSamples(liveSamples)
        setFrozen(true)
        frozenAtRef.current = elapsed
      }
      return next
    })
  }

  const handleLaserMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!laserActive) return
    const rect = event.currentTarget.getBoundingClientRect()
    setLaserPoint({
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height))),
    })
  }

  const updateRhythm = (rhythm: MonitorPatientState['rhythm']) => {
    setPatientState((current) => {
      let heartRate = current.heartRate
      if (rhythm === 'sinus-bradycardia' && heartRate >= 60) heartRate = 48
      if (rhythm === 'sinus-tachycardia' && heartRate <= 100) heartRate = 125
      if (rhythm === 'svt' && heartRate < 140) heartRate = 180
      if (rhythm === 'ventricular-tachycardia' && heartRate < 110) heartRate = 160
      if (rhythm === 'sinus' && (heartRate < 60 || heartRate > 100)) heartRate = 78
      return { ...current, rhythm, heartRate }
    })
  }

  return (
    <main className="edumon-page">
      <section className="edumon-console" aria-label="EDUMON patient monitor">
        <header className="edumon-console-header">
          <div>
            <div className="edumon-product-name">EDUMON</div>
            <div className="edumon-product-subtitle">Patient monitor simulator</div>
          </div>
          <div className="edumon-teaching-actions">
            <button type="button" className={frozen ? 'active' : ''} onClick={toggleFreeze}>
              {frozen ? 'Resume' : 'Freeze'}
            </button>
            <button type="button" className={laserActive ? 'active laser' : ''} onClick={toggleLaser}>
              Laser
            </button>
          </div>
        </header>

        <div className="edumon-monitor-body">
          <div className="edumon-waveform-area" onPointerMove={handleLaserMove} onPointerDown={handleLaserMove}>
            {TRACE_SPECS.map((spec) => <TraceCanvas key={spec.key} samples={samples} spec={spec} />)}
            {frozen && <div className="edumon-freeze-indicator">FROZEN</div>}
            {laserActive && (
              <div
                className="edumon-laser-point"
                style={{ left: `${laserPoint.x * 100}%`, top: `${laserPoint.y * 100}%` }}
                aria-hidden="true"
              />
            )}
          </div>

          <aside className="edumon-measurements" aria-label="Measured values">
            <ValuePanel
              label="HR"
              value={measurements.heartRate == null ? '—' : `${measurements.heartRate}`}
              unit="bpm"
              className="ecg"
            />
            <ValuePanel
              label="ART"
              value={measurements.systolicPressure == null ? '—/—' : `${measurements.systolicPressure}/${measurements.diastolicPressure}`}
              unit="mmHg"
              detail={measurements.meanPressure == null ? 'MAP —' : `MAP ${measurements.meanPressure}`}
              className="art"
            />
            <ValuePanel
              label="SpO₂"
              value={measurements.spo2 == null ? '—' : `${measurements.spo2}`}
              unit="%"
              className="spo2"
            />
          </aside>
        </div>

        <div className="edumon-control-strip" aria-label="Monitor controls">
          <button type="button" className="edumon-control-tile disabled" disabled title="NIBP will be enabled in a later EDUMON milestone">
            <span>NIBP</span>
            <strong>Inactive</strong>
            <small>Manual / cycle</small>
          </button>
          <button type="button" className="edumon-control-tile" onClick={() => setDeveloperControls((visible) => !visible)}>
            <span>Monitor</span>
            <strong>{RHYTHM_LABELS[patientState.rhythm]}</strong>
            <small>v0.1 rhythm test</small>
          </button>
        </div>

        {developerControls && (
          <div className="edumon-overlay-panel">
            <div className="edumon-overlay-title">v0.1 monitor test controls</div>
            <label>
              <span>Rhythm</span>
              <select value={patientState.rhythm} onChange={(event) => updateRhythm(event.target.value as MonitorPatientState['rhythm'])}>
                {RHYTHMS.map((rhythm) => <option key={rhythm} value={rhythm}>{RHYTHM_LABELS[rhythm]}</option>)}
              </select>
            </label>
            <label>
              <span>Heart rate <b>{patientState.heartRate}</b></span>
              <input type="range" min="30" max="240" step="1" value={patientState.heartRate} onChange={(event) => setPatientState((current) => ({ ...current, heartRate: Number(event.target.value) }))} />
            </label>
            <label>
              <span>ART systolic <b>{patientState.systolicPressure}</b></span>
              <input type="range" min="50" max="220" step="1" value={patientState.systolicPressure} onChange={(event) => setPatientState((current) => ({ ...current, systolicPressure: Number(event.target.value) }))} />
            </label>
            <label>
              <span>ART diastolic <b>{patientState.diastolicPressure}</b></span>
              <input type="range" min="20" max="140" step="1" value={patientState.diastolicPressure} onChange={(event) => setPatientState((current) => ({ ...current, diastolicPressure: Number(event.target.value) }))} />
            </label>
            <label>
              <span>SpO₂ <b>{patientState.spo2}%</b></span>
              <input type="range" min="50" max="100" step="1" value={patientState.spo2} onChange={(event) => setPatientState((current) => ({ ...current, spo2: Number(event.target.value) }))} />
            </label>
            <label>
              <span>Pleth perfusion <b>{patientState.peripheralPerfusion.toFixed(1)}</b></span>
              <input type="range" min="0" max="1" step="0.1" value={patientState.peripheralPerfusion} onChange={(event) => setPatientState((current) => ({ ...current, peripheralPerfusion: Number(event.target.value) }))} />
            </label>
          </div>
        )}
      </section>
      <div className="edumon-version">EDUMON v0.1.0.0</div>
    </main>
  )
}
