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
}

export function Waveform({ samples, signal, label, unit, min, max, accent, frozen = false, cursorIndex = 0, onCursorChange, showTime = false }: WaveformProps) {
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

    if (!samples.length) return
    const range = max - min
    const toY = (value: number) => height - ((value - min) / range) * height
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

    if (frozen) {
      const clampedCursor = Math.min(cursorIndex, samples.length - 1)
      const x = (clampedCursor / Math.max(1, samples.length - 1)) * width
      ctx.strokeStyle = '#ff3b3b'
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke()
    }
  }, [samples, signal, min, max, accent, frozen, cursorIndex])

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
