import { useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Sample } from '../simulation/types'

type Signal = 'pressure' | 'flow' | 'volume'

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
}

export function Waveform({ samples, signal, label, unit, min, max, accent, frozen = false, cursorIndex = 0, onCursorChange, showTime = false, showSimvSyncWindow = false }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const draggingRef = useRef(false)
  const selectedSample = samples[Math.min(cursorIndex, Math.max(0, samples.length - 1))]
  const screenStartTime = samples[0]?.time ?? 0

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
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke()
    }
    for (let i = 1; i < 4; i++) {
      const y = (height * i) / 4
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke()
    }

    const range = max - min
    const toY = (value: number) => height - ((value - min) / range) * height

    // A dedicated zero axis makes incomplete return to baseline immediately visible,
    // particularly persistent expiratory flow and trapped end-expiratory volume.
    if (min <= 0 && max >= 0) {
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
      const y = Math.max(0, Math.min(height, toY(value)))
      if (index === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()

    if (signal === 'pressure') {
      samples.forEach((sample, index) => {
        if (sample.breathTrigger !== 'patient') return
        const x = (index / Math.max(1, samples.length - 1)) * width
        const pressureY = Math.max(0, Math.min(height, toY(sample.pressure)))
        const tipY = Math.max(12, pressureY - 4)

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
  }, [samples, signal, min, max, accent, frozen, cursorIndex, showSimvSyncWindow])

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

  const valuePrecision = signal === 'flow' ? 1 : 0

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
          <div><strong>{selectedSample[signal].toFixed(valuePrecision)}</strong><span>{unit}</span></div>
        </div>
      )}
      <canvas ref={canvasRef} className="waveform-canvas" />
      <div className="waveform-scale"><span>{max}</span><span>{min}</span></div>
    </div>
  )
}
