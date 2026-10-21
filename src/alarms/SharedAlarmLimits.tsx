import { useRef } from 'react'
import './SharedAlarmLimits.css'

export interface SharedAlarmLimitPairDefinition<T extends object> {
  id: string
  label: string
  unit: string
  min: number
  max: number
  step: number
  lowKey: keyof T
  highKey: keyof T
}

export function VerticalDualAlarmSlider({
  label,
  unit,
  min,
  max,
  step,
  low,
  high,
  disabled = false,
  onLowChange,
  onHighChange,
}: {
  label: string
  unit: string
  min: number
  max: number
  step: number
  low: number
  high: number
  disabled?: boolean
  onLowChange: (value: number) => void
  onHighChange: (value: number) => void
}) {
  const finiteLow = Number.isFinite(low) ? low : min
  const finiteHigh = Number.isFinite(high) ? high : max
  const safeLow = Math.min(Math.max(min, finiteLow), Math.max(min, finiteHigh))
  const safeHigh = Math.max(Math.min(max, finiteHigh), safeLow)
  const span = Math.max(0.0001, max - min)
  const lowPct = ((safeLow - min) / span) * 100
  const highPct = ((safeHigh - min) / span) * 100
  const dragging = useRef<'low' | 'high' | null>(null)
  const sliderHeight = 190
  const handleSize = 20
  const travel = sliderHeight - handleSize
  const lowTop = (1 - lowPct / 100) * travel
  const highTop = (1 - highPct / 100) * travel
  const precision = step < 1 ? Math.max(0, Math.ceil(-Math.log10(step))) : 0

  const quantise = (value: number) => {
    const stepped = min + Math.round((value - min) / step) * step
    return Number(Math.min(max, Math.max(min, stepped)).toFixed(precision))
  }

  const setValue = (handle: 'low' | 'high', value: number) => {
    if (disabled) return
    const next = quantise(value)
    if (handle === 'low') onLowChange(Math.min(next, safeHigh))
    else onHighChange(Math.max(next, safeLow))
  }

  const fromPointer = (clientY: number, track: HTMLDivElement) => {
    const rect = track.getBoundingClientRect()
    const usableTop = rect.top + handleSize / 2
    const usableHeight = Math.max(1, rect.height - handleSize)
    const fraction = Math.min(1, Math.max(0, (usableTop + usableHeight - clientY) / usableHeight))
    return quantise(min + fraction * span)
  }

  const start = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return
    event.preventDefault()
    const value = fromPointer(event.clientY, event.currentTarget)
    const handle: 'low' | 'high' = Math.abs(value - safeLow) <= Math.abs(value - safeHigh) ? 'low' : 'high'
    dragging.current = handle
    event.currentTarget.setPointerCapture(event.pointerId)
    setValue(handle, value)
  }

  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || disabled) return
    event.preventDefault()
    setValue(dragging.current, fromPointer(event.clientY, event.currentTarget))
  }

  const stop = (event: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const key = (handle: 'low' | 'high', value: number, event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    const direction = event.key === 'ArrowUp' || event.key === 'ArrowRight'
      ? 1
      : event.key === 'ArrowDown' || event.key === 'ArrowLeft'
        ? -1
        : 0
    if (!direction) return
    event.preventDefault()
    setValue(handle, value + direction * step)
  }

  return (
    <div className={`alarm-slider-card vertical-dual-card shared-alarm-limit-card ${disabled ? 'disabled' : ''}`}>
      <span>{label}</span>
      <strong className="shared-alarm-current-limit shared-alarm-current-limit-high">
        {safeHigh} <small>{unit}</small>
      </strong>
      <div className="vertical-dual-slider-wrap">
        <em className="upper-limit-label">{max}</em>
        <div
          className="vertical-dual-range"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={stop}
          onPointerCancel={stop}
        >
          <div className="vertical-dual-track" />
          <div
            className="vertical-dual-active"
            style={{ bottom: `${10 + lowPct * 1.7}px`, height: `${Math.max(0, highPct - lowPct) * 1.7}px` }}
          />
          <div
            className="vertical-dual-handle high"
            style={{ top: `${highTop}px` }}
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-disabled={disabled}
            aria-label={`${label} maximum alarm limit`}
            aria-valuemin={safeLow}
            aria-valuemax={max}
            aria-valuenow={safeHigh}
            onKeyDown={(event) => key('high', safeHigh, event)}
          />
          <div
            className="vertical-dual-handle low"
            style={{ top: `${lowTop}px` }}
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-disabled={disabled}
            aria-label={`${label} minimum alarm limit`}
            aria-valuemin={min}
            aria-valuemax={safeHigh}
            aria-valuenow={safeLow}
            onKeyDown={(event) => key('low', safeLow, event)}
          />
        </div>
        <em className="lower-limit-label">{min}</em>
      </div>
      <strong className="shared-alarm-current-limit shared-alarm-current-limit-low">
        {safeLow} <small>{unit}</small>
      </strong>
    </div>
  )
}

export function SharedAlarmLimitsDialog<T extends object>({
  open,
  values,
  definitions,
  disabled = false,
  contained = false,
  title = 'Alarm limits',
  lockedMessage = 'Alarm limits are controlled by the instructor.',
  onChange,
  onClose,
}: {
  open: boolean
  values: T
  definitions: SharedAlarmLimitPairDefinition<T>[]
  disabled?: boolean
  contained?: boolean
  title?: string
  lockedMessage?: string
  onChange: (values: T) => void
  onClose: () => void
}) {
  if (!open) return null
  const update = (definition: SharedAlarmLimitPairDefinition<T>, low: number, high: number) => onChange({
    ...values,
    [definition.lowKey]: low,
    [definition.highKey]: high,
  })

  return (
    <div className={`alarm-dialog-backdrop shared-alarm-limits-backdrop ${contained ? 'contained' : ''}`} onClick={onClose}>
      <section className="alarm-dialog shared-alarm-limits-dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="alarm-dialog-title"><strong>{title}</strong><button type="button" onClick={onClose}>×</button></div>
        {disabled && <div className="shared-alarm-limits-locked">{lockedMessage}</div>}
        <div className="alarm-slider-grid shared-alarm-limits-grid">
          {definitions.map((definition) => {
            const rawLow = Number(values[definition.lowKey])
            const rawHigh = Number(values[definition.highKey])
            const low = Number.isFinite(rawLow) ? rawLow : definition.min
            const high = Number.isFinite(rawHigh) ? rawHigh : definition.max
            return (
              <VerticalDualAlarmSlider
                key={definition.id}
                {...definition}
                low={low}
                high={high}
                disabled={disabled}
                onLowChange={(value) => update(definition, Math.min(value, high), high)}
                onHighChange={(value) => update(definition, low, Math.max(value, low))}
              />
            )
          })}
        </div>
        <button className="alarm-dialog-done" type="button" onClick={onClose}>Done</button>
      </section>
    </div>
  )
}
