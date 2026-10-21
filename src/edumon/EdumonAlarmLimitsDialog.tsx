import type { EdumonAlarmLimits } from './alarmDefinitions'
import './EdumonAlarmLimitsDialog.css'

interface EdumonAlarmLimitsDialogProps {
  open: boolean
  limits: EdumonAlarmLimits
  disabled?: boolean
  onChange: (limits: EdumonAlarmLimits) => void
  onClose: () => void
}

function LimitRange({
  label,
  unit,
  min,
  max,
  step = 1,
  value,
  disabled,
  onChange,
}: {
  label: string
  unit: string
  min: number
  max: number
  step?: number
  value: number
  disabled?: boolean
  onChange: (value: number) => void
}) {
  return (
    <label className="edumon-alarm-limit-card">
      <div><span>{label}</span><strong>{value} <small>{unit}</small></strong></div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="edumon-alarm-limit-scale"><span>{min}</span><span>{max}</span></div>
    </label>
  )
}

export function EdumonAlarmLimitsDialog({ open, limits, disabled = false, onChange, onClose }: EdumonAlarmLimitsDialogProps) {
  if (!open) return null

  const update = <K extends keyof EdumonAlarmLimits>(key: K, value: EdumonAlarmLimits[K]) => {
    const next = { ...limits, [key]: value }
    if (key === 'heartRateLow') next.heartRateLow = Math.min(Number(value), next.heartRateHigh)
    if (key === 'heartRateHigh') next.heartRateHigh = Math.max(Number(value), next.heartRateLow)
    if (key === 'mapLow') next.mapLow = Math.min(Number(value), next.mapHigh)
    if (key === 'mapHigh') next.mapHigh = Math.max(Number(value), next.mapLow)
    onChange(next)
  }

  return (
    <div className="alarm-dialog-backdrop" onClick={onClose}>
      <section className="alarm-dialog edumon-alarm-dialog" role="dialog" aria-modal="true" aria-label="EDUMON alarm limits" onClick={(event) => event.stopPropagation()}>
        <div className="alarm-dialog-title"><strong>Alarm limits</strong><button type="button" onClick={onClose}>×</button></div>
        {disabled && <div className="edumon-alarm-limits-locked">Alarm limits are controlled by the instructor.</div>}
        <div className="edumon-alarm-limits-grid">
          <LimitRange label="Heart rate low" unit="bpm" min={20} max={150} value={limits.heartRateLow} disabled={disabled} onChange={(value) => update('heartRateLow', value)} />
          <LimitRange label="Heart rate high" unit="bpm" min={50} max={250} value={limits.heartRateHigh} disabled={disabled} onChange={(value) => update('heartRateHigh', value)} />
          <LimitRange label="MAP low" unit="mmHg" min={20} max={120} value={limits.mapLow} disabled={disabled} onChange={(value) => update('mapLow', value)} />
          <LimitRange label="MAP high" unit="mmHg" min={50} max={180} value={limits.mapHigh} disabled={disabled} onChange={(value) => update('mapHigh', value)} />
          <LimitRange label="SpO₂ low" unit="%" min={50} max={100} value={limits.spo2Low} disabled={disabled} onChange={(value) => update('spo2Low', value)} />
        </div>
        <button className="alarm-dialog-done" type="button" onClick={onClose}>Done</button>
      </section>
    </div>
  )
}
