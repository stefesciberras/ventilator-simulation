import { useEffect, useMemo, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Sample } from '../simulation/types'

export type Signal = 'pressure' | 'flow' | 'volume' | 'co2' | 'oesophagealPressure'

interface WaveformProps {
  samples: Sample[]
  signal: Signal
  label: string
  unit: string
  min: number
  max: number
  accent: string
  frozen?: boolean
  cursorIndex?: number
  onCursorChange?: (index: number) => void
  showTime?: boolean
  showSimvSyncWindow?: boolean
  showPatientEffortMarkers?: boolean
}

function roundedDownToTen(value: number): number {
  return Math.floor(value / 10) * 10
}

function roundedUpToTen(value: number): number {
  return Math.ceil(value / 10) * 10
}

function autoscale(samples: Sample[], signal: Signal, fallbackMin: number, fallbackMax: number): { min: number; max: number } {
  if (!samples.length) return { min: fallbackMin, max: fallbackMax }

  let observedMin = Number.POSITIVE_INFINITY
  let observedMax = Number.NEGATIVE_INFINITY

  for (const sample of samples) {
    const value = sample[signal]
    if (!Number.isFinite(value)) continue
    observedMin = Math.min(observedMin, value)
    observedMax = Math.max(observedMax, value)
  }

  if (!Number.isFinite(observedMin) || !Number.isFinite(observedMax)) {
    return { min: fallbackMin, max: fallbackMax }
  }

  if (signal === 'flow') {
    const largestMagnitude = Math.max(Math.abs(observedMin), Math.abs(observedMax))
    const limit = Math.max(50, roundedUpToTen(largestMagnitude))
    return { min: -limit, max: limit }
  }

  let scaledMin = observedMin < 0 ? roundedDownToTen(observedMin) : 0
  let scaledMax = observedMax > 0 ? roundedUpToTen(observedMax) : 0

  const minimumUpperRange = signal === 'pressure' || signal === 'co2'
    ? 30
    : signal === 'volume'
      ? 200
      : 10
  scaledMax = Math.max(minimumUpperRange, scaledMax)

  if (scaledMax - scaledMin < 10) {
    if (scaledMax === 0 && scaledMin < 0) scaledMin = Math.min(scaledMin, -10)
    else scaledMax = Math.max(10, scaledMax)
  }

  return { min: scaledMin, max: scaledMax }
}

export function Waveform({ samples, signal, label, unit, min, max, accent, frozen = false, cursorIndex = 0, onCursorChange, showTime = false, showSimvSyncWindow = false, showPatientEffortMarkers = false }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const draggingRef = useRef(false)
  const selectedSample = samples[Math.min(cursorIndex, Math.max(0, samples.length - 1))]
  const screenStartTime = samples[0]?.time ?? 0
  const scale = useMemo(() => autoscale(samples, signal, min, max), [samples, signal, min, max])
  const scaleMin = scale.min
  const scaleMax = scale.max

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const ratio = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.max(1, Math.floor(rect.width * ratio))
    canvas.height = Math.max(1, Math.floor(rect.height * ratio))
    ctx.scale(ratio, ratio)

    const width = rect.width
    const height = rect.height
    ctx.clearRect(0, 0, width, height)

    ctx.strokeStyle = 'rgba(255,255,255,0.065)'
    ctx.lineWidth = 1
    for (let i = 1; i < 8; i++) {
      const x = (width * i) / 8
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(width * i / 8, height); ctx.stroke()
    }
    for (let i = 1; i < 4; i++) {
      const y = (height * i) / 4
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke()
    }

    const range = Math.max(1, scaleMax - scaleMin)
    const toY = (value: number) => height - ((value - scaleMin) / range) * height

    if (scaleMin <= 0 && scaleMax >= 0) {
      const zeroY = Math.max(0.5, Math.min(height - 0.5, toY(0)))
      ctx.strokeStyle = 'rgba(190, 202, 212, 0.24)'
      ctx.lineWidth = 1.1
      ctx.beginPath(); ctx.moveTo(0, zeroY); ctx.lineTo(width, zeroY); ctx.stroke()

      if (signal === 'pressure' && showSimvSyncWindow && samples.length) {
        ctx.strokeStyle = '#f1a23c'
        ctx.lineWidth = 3.2
        ctx.lineCap = 'round'

        let segmentStart = -1
        const drawSegment = (start: number, end: number) => {
          const x1 = (start / Math.max(1, samples.length - 1)) * width
          const x2 = (end / Math.max(1, samples.length - 1)) * width
          ctx.beginPath(); ctx.moveTo(x1, zeroY); ctx.lineTo(x2, zeroY); ctx.stroke()
        }

        samples.forEach((sample, index) => {
          if (sample.simvSyncWindow && segmentStart < 0) segmentStart = index
          const atEnd = index === samples.length - 1
          if (segmentStart >= 0 && (!sample.simvSyncWindow || atEnd)) {
            const segmentEnd = sample.simvSyncWindow && atEnd ? index : Math.max(segmentStart, index - 1)
            drawSegment(segmentStart, segmentEnd)
            segmentStart = -1
          }
        })
      }
    }

    if (!samples.length) return

    ctx.strokeStyle = accent
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()

    samples.forEach((sample, index) => {
      const x = (index / Math.max(1, samples.length - 1)) * width
      const value = sample[signal]
      const y = Math.max(1, Math.min(height - 1, toY(value)))
      if (index === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()

    if (signal === 'pressure') {
      if (showPatientEffortMarkers) {
        const leftLung = new Path2D('M317.298 367.792 C299.364 347.527 275.001 352.427 259.883 367.792 C132.746 497.013 172.64 644.993 172.885 645.487 C177.728 655.243 177.118 678.717 215.088 681.107 C244.197 682.94 328.537 661.448 337.718 633.32 C347.514 603.308 348.369 510.398 348.297 494.118 C347.867 397.513 348.418 402.955 317.298 367.792 Z')
        const rightLung = new Path2D('M446.838 363.832 C464.773 343.567 489.136 348.466 504.254 363.832 C631.39 493.053 591.497 641.033 591.252 641.526 C586.408 651.283 587.019 674.756 549.048 677.147 C519.939 678.98 435.6 657.488 426.418 629.359 C416.622 599.348 415.767 506.437 415.84 490.158 C416.27 393.553 415.719 398.995 446.838 363.832 Z')
        const tracheaLeft = new Path2D('M382.873 328.423 C383.477 368.694 384.761 432.717 382.07 472.669 C381.084 487.316 341.977 521.926 335.778 521.926')
        const tracheaRight = new Path2D('M422.553 511.955 C411.537 511.955 393.695 498.815 384.703 477.126')

        samples.forEach((sample, index) => {
          if (!sample.patientEffortStart) return
          const x = (index / Math.max(1, samples.length - 1)) * width

          // Exact geometry from the supplied lung SVG. The SVG has no white
          // background element, so only the coloured paths are drawn.
          // Tight crop: source bounds x=140..620, y=300..700.
          ctx.save()
          const markerWidth = 18
          const markerHeight = 15
          ctx.translate(x - markerWidth / 2, 1)
          ctx.scale(markerWidth / 480, markerHeight / 400)
          ctx.translate(-140, -300)
          ctx.fillStyle = '#84e4f0'
          ctx.strokeStyle = '#84e4f0'
          ctx.lineWidth = 40
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.fill(leftLung)
          ctx.fill(rightLung)
          ctx.stroke(tracheaLeft)
          ctx.stroke(tracheaRight)
          ctx.restore()
        })
      }

      samples.forEach((sample, index) => {
        if (!sample.ventilatorTriggerDetected) return
        const x = (index / Math.max(1, samples.length - 1)) * width
        const baseline = sample.ventilatorTriggerBaseline ?? sample.pressure
        const baselineY = Math.max(1, Math.min(height - 1, toY(baseline)))
        const tipY = Math.max(11, baselineY - 1)

        ctx.fillStyle = '#78e08f'
        ctx.beginPath()
        ctx.moveTo(x, tipY)
        ctx.lineTo(x - 5.5, tipY - 9)
        ctx.lineTo(x + 5.5, tipY - 9)
        ctx.closePath()
        ctx.fill()
      })
    }

    if (frozen) {
      const clampedCursor = Math.min(cursorIndex, samples.length - 1)
      const x = (clampedCursor / Math.max(1, samples.length - 1)) * width
      ctx.strokeStyle = '#ff3b3b'
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke()
    }
  }, [samples, signal, scaleMin, scaleMax, accent, frozen, cursorIndex, showSimvSyncWindow, showPatientEffortMarkers])

  const updateCursorFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!frozen || !onCursorChange || !samples.length) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left))
    const index = Math.round((x / Math.max(1, rect.width)) * (samples.length - 1))
    onCursorChange(index)
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!frozen) return
    draggingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    updateCursorFromPointer(event)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    updateCursorFromPointer(event)
  }

  const stopDragging = () => { draggingRef.current = false }

  const valuePrecision = signal === 'flow' || signal === 'co2' || signal === 'oesophagealPressure' ? 1 : 0

  return (
    <div
      className={`waveform-card ${frozen ? 'cursor-enabled' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
    >
      <div className="waveform-label"><strong>{label}</strong><span>{unit}</span></div>
      {frozen && selectedSample && (
        <div className="trace-readout">
          {showTime && <div className="trace-time">t {(selectedSample.time - screenStartTime).toFixed(2)} s</div>}
          {signal === 'oesophagealPressure' ? (
            <div className="pes-ptp-readout">
              <div><span>Pes</span><strong>{selectedSample.oesophagealPressure.toFixed(1)}</strong><small>cmH₂O</small></div>
              <div><span>Ptp</span><strong>{(selectedSample.pressure - selectedSample.oesophagealPressure).toFixed(1)}</strong><small>cmH₂O</small></div>
            </div>
          ) : (
            <div><strong>{selectedSample[signal].toFixed(valuePrecision)}</strong><span>{unit}</span></div>
          )}
        </div>
      )}
      <canvas ref={canvasRef} className="waveform-canvas" />
      <div className="waveform-scale"><span>{scaleMax}</span><span>{scaleMin}</span></div>
    </div>
  )
}
