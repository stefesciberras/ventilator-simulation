import type { PatientSettings, VentilatorMode, VentilatorSettings } from '../simulation/types'

interface SliderProps {
  label: string
  value: number
  unit: string
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
}

function Slider({ label, value, unit, min, max, step = 1, onChange }: SliderProps) {
  return (
    <label className="control-row">
      <div className="control-heading"><span>{label}</span><strong>{value}{unit}</strong></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

export function VentilatorControls({ settings, onChange }: { settings: VentilatorSettings; onChange: (next: VentilatorSettings) => void }) {
  const patch = (value: Partial<VentilatorSettings>) => onChange({ ...settings, ...value })
  return (
    <section className="control-section">
      <h2>Ventilator settings</h2>
      <div className="mode-buttons">
        {(['VC-AC', 'PC-AC', 'PSV'] as VentilatorMode[]).map((mode) => (
          <button key={mode} className={settings.mode === mode ? 'selected' : ''} onClick={() => patch({ mode })}>{mode}</button>
        ))}
      </div>
      <Slider label="FiO₂" value={Math.round(settings.fio2 * 100)} unit="%" min={21} max={100} onChange={(v) => patch({ fio2: v / 100 })} />
      <Slider label="PEEP" value={settings.peep} unit=" cmH₂O" min={0} max={20} onChange={(v) => patch({ peep: v })} />
      {settings.mode !== 'PSV' && <Slider label="Rate" value={settings.rate} unit="/min" min={5} max={35} onChange={(v) => patch({ rate: v })} />}
      {settings.mode === 'VC-AC' && <Slider label="Tidal volume" value={settings.tidalVolume} unit=" mL" min={250} max={800} step={10} onChange={(v) => patch({ tidalVolume: v })} />}
      {settings.mode !== 'PSV' && <Slider label="Inspiratory time" value={settings.inspiratoryTime} unit=" s" min={0.4} max={2} step={0.1} onChange={(v) => patch({ inspiratoryTime: v })} />}
      {settings.mode === 'PC-AC' && <Slider label="Pressure control" value={settings.pressureControl} unit=" cmH₂O" min={5} max={30} onChange={(v) => patch({ pressureControl: v })} />}
      {settings.mode === 'PSV' && <Slider label="Pressure support" value={settings.pressureSupport} unit=" cmH₂O" min={3} max={25} onChange={(v) => patch({ pressureSupport: v })} />}
      <Slider label="Trigger" value={settings.triggerSensitivity} unit=" cmH₂O" min={1} max={8} step={0.5} onChange={(v) => patch({ triggerSensitivity: v })} />
    </section>
  )
}

export function PatientControls({ settings, onChange }: { settings: PatientSettings; onChange: (next: PatientSettings) => void }) {
  const patch = (value: Partial<PatientSettings>) => onChange({ ...settings, ...value })
  const presets: Record<string, Partial<PatientSettings>> = {
    Normal: { compliance: 60, resistance: 6, expiratoryResistance: 8, spontaneousRate: 12, effort: 5, neuralInspiratoryTime: 1 },
    ARDS: { compliance: 25, resistance: 8, expiratoryResistance: 10, spontaneousRate: 25, effort: 10, neuralInspiratoryTime: 0.8 },
    COPD: { compliance: 80, resistance: 16, expiratoryResistance: 28, spontaneousRate: 18, effort: 8, neuralInspiratoryTime: 0.9 },
    Asthma: { compliance: 70, resistance: 25, expiratoryResistance: 40, spontaneousRate: 24, effort: 11, neuralInspiratoryTime: 0.8 },
  }
  return (
    <section className="control-section">
      <h2>Patient</h2>
      <div className="preset-row">{Object.keys(presets).map((name) => <button key={name} onClick={() => patch(presets[name])}>{name}</button>)}</div>
      <Slider label="Compliance" value={settings.compliance} unit=" mL/cmH₂O" min={15} max={100} onChange={(v) => patch({ compliance: v })} />
      <Slider label="Airway resistance" value={settings.resistance} unit=" cmH₂O/L/s" min={3} max={40} onChange={(v) => patch({ resistance: v })} />
      <Slider label="Expiratory resistance" value={settings.expiratoryResistance} unit=" cmH₂O/L/s" min={3} max={50} onChange={(v) => patch({ expiratoryResistance: v })} />
      <Slider label="Spontaneous RR" value={settings.spontaneousRate} unit="/min" min={0} max={35} onChange={(v) => patch({ spontaneousRate: v })} />
      <Slider label="Inspiratory effort" value={settings.effort} unit=" cmH₂O" min={0} max={20} onChange={(v) => patch({ effort: v })} />
      <Slider label="Neural inspiratory time" value={settings.neuralInspiratoryTime} unit=" s" min={0.3} max={3} step={0.1} onChange={(v) => patch({ neuralInspiratoryTime: v })} />
    </section>
  )
}
