import { memo, useEffect, useRef } from 'react'
import type { MonitorPatientState, MonitorSample } from './types'
import { generateMonitorSamples } from './monitorEngine'
import { autoscaleWaveformSamples, type WaveformAutoscaleOptions } from '../core/WaveformAutoscale'
import { recordWaveformDiagnostic, waveformDiagnosticsEnabled } from './v2WaveformDiagnostics'

/**
 * R1: dedicated browser-local ECG/ART/pleth paint loop for opt-in Anaesth v2.
 *
 * No React setState on each animation frame. Incoming physiology is consumed
 * through a ref, so only the three canvases are painted at display frequency.
 * The shared waveform engine continues to generate samples and preserve phase.
 * Canonical physiology, numeric HR and alarms remain on Session Engine v2.
 */
const WINDOW_SECONDS = 8
const SAMPLE_RATE = 100
type TraceKey = 'ecg' | 'arterialPressure' | 'pleth'
type TraceSpec = {
  key: TraceKey; label: string; unit: string; className: string
  decimals: number; autoscale: WaveformAutoscaleOptions
}
const TRACES: readonly TraceSpec[] = [
  { key: 'ecg', label: 'ECG II', unit: 'mV', className: 'ecg', decimals: 1,
    autoscale: { fallbackMin: -0.8, fallbackMax: 1.6, paddingFraction: 0.08, minimumSpan: 1.2, roundTo: 0.1 } },
  { key: 'arterialPressure', label: 'ART', unit: 'mmHg', className: 'art', decimals: 0,
    autoscale: { fallbackMin: 30, fallbackMax: 130, paddingFraction: 0.06, minimumSpan: 100, roundTo: 10, hardMin: 30 } },
  { key: 'pleth', label: 'SpO₂', unit: '', className: 'spo2', decimals: 1,
    autoscale: { fallbackMin: 0, fallbackMax: 1.2, paddingFraction: 0, minimumSpan: 1.2, roundTo: 0, hardMin: 0, hardMax: 1.2 } },
]

function paintTrace(canvas: HTMLCanvasElement, samples: MonitorSample[], spec: TraceSpec,
  label: HTMLSpanElement | null): void {
  const context = canvas.getContext('2d')
  if (!context) return
  const rect = canvas.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return
  const ratio = window.devicePixelRatio || 1
  const pixelWidth = Math.max(1, Math.round(rect.width * ratio))
  const pixelHeight = Math.max(1, Math.round(rect.height * ratio))
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  const width = rect.width
  const height = rect.height
  const scale = spec.key === 'pleth'
    ? { min: spec.autoscale.fallbackMin, max: spec.autoscale.fallbackMax }
    : autoscaleWaveformSamples(samples, sample => sample[spec.key], spec.autoscale)
  if (label) {
    const text = `${scale.max.toFixed(spec.decimals)} / ${scale.min.toFixed(spec.decimals)}`
    if (label.textContent !== text) label.textContent = text
  }
  context.clearRect(0, 0, width, height)
  context.strokeStyle = 'rgba(255,255,255,0.055)'
  context.lineWidth = 1
  for (let column = 1; column < 8; column += 1) {
    const x = width * column / 8
    context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke()
  }
  for (let row = 1; row < 4; row += 1) {
    const y = height * row / 4
    context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke()
  }
  if (!samples.length) return
  const range = Math.max(0.001, scale.max - scale.min)
  context.strokeStyle = getComputedStyle(canvas).color
  context.lineWidth = spec.key === 'ecg' ? 1.8 : 2.1
  context.lineJoin = 'round'
  context.lineCap = 'round'
  context.beginPath()
  for (let i = 0; i < samples.length; i += 1) {
    const x = i / Math.max(1, samples.length - 1) * width
    const y = Math.max(1, Math.min(height - 1,
      height - ((samples[i][spec.key] - scale.min) / range) * height))
    if (i === 0) context.moveTo(x, y)
    else context.lineTo(x, y)
  }
  context.stroke()
}

export const AnaesthV2WaveformRenderer = memo(function AnaesthV2WaveformRenderer({
  patient, frozen, paused, speed, initialTime,
}: {
  patient: MonitorPatientState
  frozen: boolean
  paused: boolean
  speed: number
  initialTime: number
}) {
  const patientRef = useRef(patient)
  const frozenRef = useRef(frozen)
  const pausedRef = useRef(paused)
  const speedRef = useRef(speed)
  const canvasesRef = useRef<(HTMLCanvasElement | null)[]>([])
  const labelsRef = useRef<(HTMLSpanElement | null)[]>([])
  patientRef.current = patient
  frozenRef.current = frozen
  pausedRef.current = paused
  speedRef.current = speed

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    let waveformTime = initialTime
    const tick = (now: number) => {
      const gapMs = now - last
      last = now
      const measuring = waveformDiagnosticsEnabled()
      if (measuring && gapMs > 40) recordWaveformDiagnostic('v2-renderer-frame-gap', {
        gapMs: Math.round(gapMs * 10) / 10, visibility: document.visibilityState,
      })
      if (!frozenRef.current && !pausedRef.current) {
        // Preserve the existing v1 time-step cap, including after backgrounding.
        waveformTime += Math.min(0.1, Math.max(0, gapMs / 1000)) * speedRef.current
        const started = measuring ? performance.now() : 0
        const samples = generateMonitorSamples(patientRef.current, waveformTime, WINDOW_SECONDS, SAMPLE_RATE)
        if (measuring && performance.now() - started > 8)
          recordWaveformDiagnostic('slow-waveform-generation', {
            durationMs: Math.round((performance.now() - started) * 10) / 10,
            samples: samples.length,
          })
        for (let i = 0; i < TRACES.length; i += 1) {
          const canvas = canvasesRef.current[i]
          if (!canvas) continue
          const paintedAt = measuring ? performance.now() : 0
          paintTrace(canvas, samples, TRACES[i], labelsRef.current[i])
          if (measuring && performance.now() - paintedAt > 8)
            recordWaveformDiagnostic('slow-canvas-paint', {
              trace: TRACES[i].key,
              paintMs: Math.round((performance.now() - paintedAt) * 10) / 10,
              samples: samples.length,
            })
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // R1 animation loop does not restart when authoritative patient values change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <div className="edumon-waveform-area waveforms" data-waveform-renderer="anaesth-v2-r1">
    {TRACES.map((spec, i) =>
      <div key={spec.key} className={`edumon-trace edumon-trace-${spec.className} waveform-card`}>
        <div className="edumon-trace-label waveform-label">
          <strong>{spec.label}</strong>{spec.unit && <span>{spec.unit}</span>}
        </div>
        <canvas ref={node => { canvasesRef.current[i] = node }} aria-label={`${spec.label} waveform`} />
        <div className="waveform-scale" aria-hidden="true">
          <span ref={node => { labelsRef.current[i] = node }} />
        </div>
      </div>)}
    {frozen && <div className="edumon-freeze-indicator">FROZEN</div>}
  </div>
})
