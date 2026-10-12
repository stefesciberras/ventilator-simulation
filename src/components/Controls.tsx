import { useRef, useState } from 'react'
import type { PatientSettings, VentilatorMode, VentilatorSettings } from '../simulation/types'

interface SliderProps {
  label: string
  value: number
  unit: string
  min: number
  max: number
  step?: number
  displayValue?: string
  onChange: (value: number) => void
}

const MIN_IE = 0.5
const MAX_IE = 8

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const cycleTime = (rate: number) => 60 / Math.max(rate, 1)
const ieRatioFrom = (settings: VentilatorSettings) => clamp(cycleTime(settings.rate) / Math.max(settings.inspiratoryTime, 0.2) - 1, MIN_IE, MAX_IE)
const plateauFraction = (settings: VentilatorSettings) => clamp(settings.plateauPercent ?? 0, 0, 20) / 100
const flowFor = (tidalVolumeMl: number, inspiratoryTime: number, plateauPercent: number) => {
  const flowTime = Math.max(inspiratoryTime * (1 - clamp(plateauPercent, 0, 20) / 100), 0.05)
  return (tidalVolumeMl / 1000) / flowTime * 60
}

const isVolumeMandatoryMode = (mode: VentilatorMode) => mode === 'VC-AC' || mode === 'SIMV-VC'
const isPressureMandatoryMode = (mode: VentilatorMode) => mode === 'PC-AC' || mode === 'SIMV-PC'
const isSimvMode = (mode: VentilatorMode) => mode === 'SIMV-VC' || mode === 'SIMV-PC'
const hasConventionalMandatoryTiming = (mode: VentilatorMode) => mode !== 'PSV' && mode !== 'APRV' && mode !== 'BIPAP'
const usesTidalVolume = (mode: VentilatorMode) => isVolumeMandatoryMode(mode) || mode === 'VG-PC'

function Slider({ label, value, unit, min, max, step = 1, displayValue, onChange }: SliderProps) {
  return (
    <label className="control-row">
      <div className="control-heading"><span>{label}</span><strong>{displayValue ?? `${value}${unit}`}</strong></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

function BreathingToggleIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M15 4v8M17 4v8M16 10l-4 4M16 10l4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 12c-2.8.5-5.2 2.8-6.1 6.2-.9 3.6-.3 7.1 1.7 8.2 1.8 1 4.7-.3 6.4-3.1 1.2-2 1.4-4.4 1.4-7.2V13.5c-.9-.9-2-1.5-3.4-1.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M20 12c2.8.5 5.2 2.8 6.1 6.2.9 3.6.3 7.1-1.7 8.2-1.8 1-4.7-.3-6.4-3.1-1.2-2-1.4-4.4-1.4-7.2V13.5c.9-.9 2-1.5 3.4-1.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      {!off && <path d="M6.5 27c3.2-3 6.2-4.2 9.5-4.2S22.3 24 25.5 27" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  )
}

function SyncWindowIcon() {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true">
      <path d="M4 14h20" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M8 9v10M20 9v10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".75" />
    </svg>
  )
}

export function VentilatorControls({ settings, onChange, onReset }: { settings: VentilatorSettings; onChange: (next: VentilatorSettings) => void; onReset: () => void }) {
  const patch = (value: Partial<VentilatorSettings>) => onChange({ ...settings, ...value })
  const currentIeRatio = ieRatioFrom(settings)
  const [modeMenuOpen, setModeMenuOpen] = useState(false)

  const setMode = (mode: VentilatorMode) => {
    const next = { ...settings, mode }
    if (isVolumeMandatoryMode(mode)) next.inspiratoryFlow = flowFor(next.tidalVolume, next.inspiratoryTime, next.plateauPercent ?? 0)
    onChange(next)
    setModeMenuOpen(false)
  }

  const setRate = (rate: number) => {
    const inspiratoryTime = cycleTime(rate) / (1 + currentIeRatio)
    const next: VentilatorSettings = { ...settings, rate, inspiratoryTime }
    if (isVolumeMandatoryMode(settings.mode)) next.inspiratoryFlow = flowFor(next.tidalVolume, inspiratoryTime, next.plateauPercent ?? 0)
    onChange(next)
  }

  const setIeRatio = (ratio: number) => {
    const boundedRatio = clamp(ratio, MIN_IE, MAX_IE)
    const inspiratoryTime = cycleTime(settings.rate) / (1 + boundedRatio)
    const next: VentilatorSettings = { ...settings, inspiratoryTime }
    if (isVolumeMandatoryMode(settings.mode)) next.inspiratoryFlow = flowFor(next.tidalVolume, inspiratoryTime, next.plateauPercent ?? 0)
    onChange(next)
  }

  const setTidalVolume = (tidalVolume: number) => {
    const next: VentilatorSettings = { ...settings, tidalVolume }
    if (isVolumeMandatoryMode(settings.mode)) next.inspiratoryFlow = flowFor(tidalVolume, settings.inspiratoryTime, settings.plateauPercent ?? 0)
    onChange(next)
  }

  const setInspiratoryFlow = (requestedFlow: number) => {
    const fraction = plateauFraction(settings)
    const requestedFlowTime = (settings.tidalVolume / 1000) / Math.max(requestedFlow / 60, 0.01)
    const requestedTi = requestedFlowTime / Math.max(1 - fraction, 0.8)
    const requestedRatio = cycleTime(settings.rate) / requestedTi - 1
    const boundedRatio = clamp(requestedRatio, MIN_IE, MAX_IE)
    const inspiratoryTime = cycleTime(settings.rate) / (1 + boundedRatio)
    const inspiratoryFlow = flowFor(settings.tidalVolume, inspiratoryTime, settings.plateauPercent ?? 0)
    onChange({ ...settings, inspiratoryTime, inspiratoryFlow })
  }

  const setPlateauPercent = (plateauPercent: number) => {
    const bounded = clamp(plateauPercent, 0, 20)
    onChange({
      ...settings,
      plateauPercent: bounded,
      inspiratoryFlow: flowFor(settings.tidalVolume, settings.inspiratoryTime, bounded),
    })
  }

  const modes: VentilatorMode[] = ['VC-AC', 'PC-AC', 'PSV', 'SIMV-VC', 'SIMV-PC', 'VG-PC', 'APRV', 'BIPAP']

  const triggerControls = (
    <div className="trigger-controls">
      <div className="trigger-type-selector" role="group" aria-label="Trigger type">
        <button type="button" className={settings.triggerType !== 'flow' ? 'selected' : ''} onClick={() => patch({ triggerType: 'pressure' })}>Pressure</button>
        <button type="button" className={settings.triggerType === 'flow' ? 'selected' : ''} onClick={() => patch({ triggerType: 'flow' })}>Flow</button>
      </div>
      {settings.triggerType === 'flow' ? (
        <Slider label="Flow trigger" value={settings.flowTriggerSensitivity ?? 2} unit=" L/min" min={0.5} max={10} step={0.5} onChange={(v) => patch({ flowTriggerSensitivity: v })} />
      ) : (
        <Slider label="Pressure trigger" value={settings.triggerSensitivity} unit=" cmH₂O below PEEP" min={0.5} max={8} step={0.5} onChange={(v) => patch({ triggerSensitivity: v })} />
      )}
    </div>
  )

  return (
    <section className="control-section ventilator-settings-section">
      <div className="control-section-title">
        <h2>Ventilator settings</h2>
        <button className="reset-settings-button" type="button" onClick={onReset}>Reset vent</button>
      </div>
      <div className="mode-selector">
        <button className={`mode-menu-button ${modeMenuOpen ? 'selected' : ''}`} type="button" onClick={() => setModeMenuOpen((open) => !open)} aria-haspopup="menu" aria-expanded={modeMenuOpen}>
          <span>MODE</span><strong>{settings.mode}</strong><span className="mode-menu-chevron">▾</span>
        </button>
        {modeMenuOpen && (
          <div className="mode-menu" role="menu" aria-label="Ventilation mode">
            {modes.map((mode) => (
              <button key={mode} role="menuitem" className={settings.mode === mode ? 'selected' : ''} onClick={() => setMode(mode)}>{mode}</button>
            ))}
          </div>
        )}
      </div>

      <Slider label="FiO₂" value={Math.round(settings.fio2 * 100)} unit="%" min={21} max={100} onChange={(v) => patch({ fio2: v / 100 })} />

      {settings.mode === 'APRV' ? (
        <>
          <Slider label="Phigh" value={settings.pHigh} unit=" cmH₂O" min={10} max={40} onChange={(v) => patch({ pHigh: Math.max(v, settings.pLow + 1) })} />
          <Slider label="Plow" value={settings.pLow} unit=" cmH₂O" min={0} max={15} onChange={(v) => patch({ pLow: Math.min(v, settings.pHigh - 1) })} />
          <Slider label="Thigh" value={settings.tHigh} unit=" s" min={0.5} max={10} step={0.1} onChange={(v) => patch({ tHigh: v })} />
          <Slider label="Tlow" value={settings.tLow} unit=" s" min={0.2} max={2} step={0.05} onChange={(v) => patch({ tLow: v })} />
        </>
      ) : settings.mode === 'BIPAP' ? (
        <>
          <Slider label="Pinsp" value={settings.pressureControl} unit=" cmH₂O" min={5} max={30} onChange={(v) => patch({ pressureControl: v })} />
          <Slider label="PEEP" value={settings.peep} unit=" cmH₂O" min={0} max={20} onChange={(v) => patch({ peep: v })} />
          <Slider label="Rate" value={settings.rate} unit="/min" min={5} max={35} onChange={setRate} />
          <Slider label="I:E ratio" value={Number(currentIeRatio.toFixed(1))} unit="" min={MIN_IE} max={MAX_IE} step={0.1} displayValue={`1:${currentIeRatio.toFixed(1)}`} onChange={setIeRatio} />
          {triggerControls}
        </>
      ) : (
        <>
          <Slider label="PEEP" value={settings.peep} unit=" cmH₂O" min={0} max={20} onChange={(v) => patch({ peep: v })} />
          {settings.mode !== 'PSV' && <Slider label={isSimvMode(settings.mode) ? 'SIMV rate' : 'Rate'} value={settings.rate} unit="/min" min={5} max={35} onChange={setRate} />}
          {isSimvMode(settings.mode) && (
            <div className="sync-window-control">
              <div className="sync-window-slider">
                <Slider
                  label="Threshold window"
                  value={settings.simvSyncWindowPercent ?? 25}
                  unit="% cycle"
                  min={5}
                  max={75}
                  step={5}
                  onChange={(v) => patch({ simvSyncWindowPercent: v })}
                />
              </div>
              <button
                type="button"
                className={`sync-window-toggle ${settings.showSimvSyncWindow ? 'on' : ''}`}
                onClick={() => patch({ showSimvSyncWindow: !settings.showSimvSyncWindow })}
                title={settings.showSimvSyncWindow ? 'Hide synchronization window on Paw trace' : 'Highlight synchronization window on Paw trace'}
                aria-label={settings.showSimvSyncWindow ? 'Hide synchronization window' : 'Show synchronization window'}
                aria-pressed={settings.showSimvSyncWindow}
              >
                <SyncWindowIcon />
              </button>
            </div>
          )}
          {usesTidalVolume(settings.mode) && <Slider label={settings.mode === 'VG-PC' ? 'Target tidal volume' : 'Tidal volume'} value={settings.tidalVolume} unit=" mL" min={250} max={800} step={10} onChange={setTidalVolume} />}
          {hasConventionalMandatoryTiming(settings.mode) && (
            <Slider label="I:E ratio" value={Number(currentIeRatio.toFixed(1))} unit="" min={MIN_IE} max={MAX_IE} step={0.1} displayValue={`1:${currentIeRatio.toFixed(1)}`} onChange={setIeRatio} />
          )}
          {isVolumeMandatoryMode(settings.mode) && (
            <>
              <Slider label="Inspiratory flow" value={Number(settings.inspiratoryFlow.toFixed(0))} unit=" L/min" min={10} max={140} step={1} onChange={setInspiratoryFlow} />
              <Slider label="Plateau time" value={settings.plateauPercent ?? 0} unit="% Ti" min={0} max={20} step={1} onChange={setPlateauPercent} />
            </>
          )}
          {isPressureMandatoryMode(settings.mode) && <Slider label="Pressure control" value={settings.pressureControl} unit=" cmH₂O" min={5} max={30} onChange={(v) => patch({ pressureControl: v })} />}
          {settings.mode === 'VG-PC' && <Slider label="Starting pressure" value={settings.pressureControl} unit=" cmH₂O" min={5} max={30} onChange={(v) => patch({ pressureControl: v })} />}
          {(settings.mode === 'PSV' || isSimvMode(settings.mode)) && <Slider label="Pressure support" value={settings.pressureSupport} unit=" cmH₂O" min={3} max={25} onChange={(v) => patch({ pressureSupport: v })} />}
          {(settings.mode === 'PSV' || isSimvMode(settings.mode)) && (
            <Slider label="Expiratory trigger (ETS)" value={settings.terminationSensitivity} unit="% peak flow" min={5} max={80} step={5} onChange={(v) => patch({ terminationSensitivity: v })} />
          )}
          {triggerControls}
        </>
      )}
    </section>
  )
}

export function PatientControls({ settings, onChange, onReset, transitionSeconds, onTransitionSecondsChange }: { settings: PatientSettings; onChange: (next: PatientSettings) => void; onReset: () => void; transitionSeconds: number; onTransitionSecondsChange: (seconds: number) => void }) {
  const patch = (value: Partial<PatientSettings>) => onChange({ ...settings, ...value })
  const previousSpontaneousRate = useRef(settings.spontaneousRate > 0 ? settings.spontaneousRate : 12)
  if (settings.spontaneousRate > 0) previousSpontaneousRate.current = settings.spontaneousRate

  const toggleSpontaneousBreathing = () => {
    if (settings.spontaneousRate > 0) {
      previousSpontaneousRate.current = settings.spontaneousRate
      patch({ spontaneousRate: 0 })
    } else {
      patch({ spontaneousRate: Math.max(1, previousSpontaneousRate.current) })
    }
  }

  const presets: Record<string, Partial<PatientSettings>> = {
    Normal: { compliance: 60, resistance: 6, expiratoryResistance: 8, spontaneousRate: 12, effort: 5, neuralInspiratoryTime: 1, effortRiseTime: 0.3, effortRelaxationTime: 0.35 },
    ARDS: { compliance: 25, resistance: 8, expiratoryResistance: 10, spontaneousRate: 25, effort: 10, neuralInspiratoryTime: 0.8, effortRiseTime: 0.15, effortRelaxationTime: 0.2 },
    COPD: { compliance: 80, resistance: 16, expiratoryResistance: 28, spontaneousRate: 18, effort: 8, neuralInspiratoryTime: 0.9, effortRiseTime: 0.25, effortRelaxationTime: 0.35 },
    Asthma: { compliance: 70, resistance: 25, expiratoryResistance: 40, spontaneousRate: 24, effort: 11, neuralInspiratoryTime: 0.8, effortRiseTime: 0.15, effortRelaxationTime: 0.25 },
  }

  return (
    <section className="control-section patient-section">
      <div className="control-section-title">
        <h2>Patient settings</h2>
        <button className="reset-settings-button patient-reset-button" type="button" onClick={onReset}>Reset patient</button>
      </div>
      <div className="patient-transition-control">
        <label htmlFor="patient-transition-select">
          <span>Patient transition</span>
          <select id="patient-transition-select" value={transitionSeconds} onChange={(event) => onTransitionSecondsChange(Number(event.target.value))}>
            <option value={0}>Now</option>
            <option value={5}>5 s</option>
            <option value={10}>10 s</option>
            <option value={30}>30 s</option>
            <option value={60}>60 s</option>
          </select>
        </label>
        <small>{transitionSeconds === 0 ? 'Changes apply immediately' : `Patient physiology transitions smoothly over ${transitionSeconds} s`}</small>
      </div>
      <div className="preset-row">{Object.keys(presets).map((name) => <button key={name} onClick={() => patch(presets[name])}>{name}</button>)}</div>
      <div className="patient-rr-control">
        <div className="patient-rr-slider">
          <Slider label="Spontaneous RR" value={settings.spontaneousRate} unit="/min" min={0} max={35} onChange={(v) => patch({ spontaneousRate: v })} />
        </div>
        <button
          className={`patient-breathing-toggle ${settings.spontaneousRate === 0 ? 'off' : 'on'}`}
          type="button"
          onClick={toggleSpontaneousBreathing}
          title={settings.spontaneousRate === 0 ? `Restore spontaneous breathing (${previousSpontaneousRate.current}/min)` : 'Set spontaneous respiratory rate to 0'}
          aria-label={settings.spontaneousRate === 0 ? 'Restore spontaneous breathing' : 'Disable spontaneous breathing'}
        >
          <BreathingToggleIcon off={settings.spontaneousRate === 0} />
        </button>
      </div>
      <Slider label="Compliance" value={settings.compliance} unit=" mL/cmH₂O" min={15} max={100} onChange={(v) => patch({ compliance: v })} />
      <Slider label="Airway resistance" value={settings.resistance} unit=" cmH₂O/L/s" min={3} max={40} onChange={(v) => patch({ resistance: v })} />
      <Slider label="Expiratory resistance" value={settings.expiratoryResistance} unit=" cmH₂O/L/s" min={3} max={50} onChange={(v) => patch({ expiratoryResistance: v })} />
      <Slider label="Inspiratory effort" value={settings.effort} unit=" cmH₂O" min={0} max={20} onChange={(v) => patch({ effort: v })} />
      <Slider label="Neural inspiratory time" value={settings.neuralInspiratoryTime} unit=" s" min={0.3} max={3} step={0.1} onChange={(v) => patch({ neuralInspiratoryTime: v })} />
      <Slider label="Effort rise time" value={settings.effortRiseTime ?? 0.3} unit=" s" min={0.05} max={1.5} step={0.05} onChange={(v) => patch({ effortRiseTime: v })} />
      <Slider label="Effort relaxation time" value={settings.effortRelaxationTime ?? 0.35} unit=" s" min={0.05} max={1.5} step={0.05} onChange={(v) => patch({ effortRelaxationTime: v })} />
      <Slider label="End-expiratory Pes" value={settings.endExpiratoryOesophagealPressure ?? -5} unit=" cmH₂O" min={-15} max={15} step={0.5} onChange={(v) => patch({ endExpiratoryOesophagealPressure: v })} />
      <Slider label="VCO₂ production" value={settings.co2Production ?? 250} unit=" mL/min" min={100} max={500} step={10} onChange={(v) => patch({ co2Production: v })} />
      <Slider label="Dead space volume" value={settings.deadSpaceVolume ?? 150} unit=" mL" min={50} max={400} step={10} onChange={(v) => patch({ deadSpaceVolume: v })} />
    </section>
  )
}
