import { useEffect, useRef } from 'react'
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
}

export function Waveform({ samples, signal, label, unit, min, max, accent }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

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
  }, [samples, signal, min, max, accent])

  return (
    <div className="waveform-card">
      <div className="waveform-label"><strong>{label}</strong><span>{unit}</span></div>
      <canvas ref={canvasRef} className="waveform-canvas" />
      <div className="waveform-scale"><span>{max}</span><span>{min}</span></div>
    </div>
  )
}
