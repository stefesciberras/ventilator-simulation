import type { PatientSettings } from '../simulation/types'

interface EflSeverityControlProps {
  value: PatientSettings['expiratoryFlowLimitation']
  onChange: (value: number) => void
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const quantizeEfl = (value: number) => clamp(Math.round(value * 4) / 4, 0, 1)

export function EflSeverityControl({ value, onChange }: EflSeverityControlProps) {
  const severity = quantizeEfl(value ?? 0)

  return (
    <label className="control-row">
      <div className="control-heading"><span>EFL severity</span><strong>{severity.toFixed(2).replace(/\.00$/, '.0')}</strong></div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.25}
        value={severity}
        onChange={(event) => onChange(quantizeEfl(Number(event.target.value)))}
        aria-label="Expiratory flow limitation severity"
      />
    </label>
  )
}
