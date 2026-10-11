import { useEffect, useMemo, useState } from 'react'
import { PatientControls, VentilatorControls } from './components/Controls'
import { Waveform } from './components/Waveform'
import { calculateMeasurements, generateWaveforms } from './simulation/engine'
import type { PatientSettings, Sample, VentilatorSettings } from './simulation/types'

const initialVentilator: VentilatorSettings = {
  mode: 'VC-AC', fio2: 0.35, peep: 5, rate: 14, tidalVolume: 500, inspiratoryTime: 1,
  pressureControl: 15, pressureSupport: 10, triggerSensitivity: 2,
}

const initialPatient: PatientSettings = {
  compliance: 60, resistance: 6, expiratoryResistance: 8, spontaneousRate: 12, effort: 5, inspiratoryTime: 1,
}

const WINDOW_SAMPLES = 1200

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong><small>{unit}</small></div>
}

export default function App() {
  const [ventilator, setVentilator] = useState(initialVentilator)
  const [patient, setPatient] = useState(initialPatient)
  const [oxygenBoost, setOxygenBoost] = useState(false)
  const [nebuliser, setNebuliser] = useState(false)
  const [frozen, setFrozen] = useState(false)
  const [frozenSamples, setFrozenSamples] = useState<Sample[] | null>(null)
  const [cursor, setCursor] = useState(0)

  const effectiveVentilator = useMemo(() => ({ ...ventilator, fio2: oxygenBoost ? 1 : ventilator.fio2 }), [ventilator, oxygenBoost])
  const generated = useMemo(() => generateWaveforms(effectiveVentilator, patient, 30), [effectiveVentilator, patient])
  const maxCursor = Math.max(1, generated.length - WINDOW_SAMPLES)

  useEffect(() => {
    if (frozen) return
    const timer = window.setInterval(() => setCursor((current) => (current + 10) % maxCursor), 100)
    return () => window.clearInterval(timer)
  }, [frozen, maxCursor])

  useEffect(() => {
    setCursor(0)
    setFrozen(false)
    setFrozenSamples(null)
  }, [ventilator, patient, oxygenBoost])

  const movingSamples = useMemo(() => generated.slice(cursor, cursor + WINDOW_SAMPLES), [generated, cursor])
  const samples = frozen && frozenSamples ? frozenSamples : movingSamples
  const measures = useMemo(() => calculateMeasurements(samples, effectiveVentilator), [samples, effectiveVentilator])

  const toggleFreeze = () => {
    if (!frozen) setFrozenSamples(movingSamples)
    setFrozen((value) => !value)
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div><span className="brand-kicker">EDUVENT</span><h1>Mechanical Ventilation Simulator</h1></div>
        <div className="status-cluster"><span className="status-dot" />SIMULATION ACTIVE <span className="version">v0.1</span></div>
      </header>

      <div className="workspace">
        <section className="ventilator-console">
          <div className="screen-header">
            <div className="mode-title"><span>Mode</span><strong>{ventilator.mode}</strong></div>
            <div className="screen-settings"><span>FiO₂ <b>{Math.round(effectiveVentilator.fio2 * 100)}%</b></span><span>PEEP <b>{ventilator.peep}</b></span></div>
          </div>

          <div className="waveforms">
            <Waveform samples={samples} signal="pressure" label="Paw" unit="cmH₂O" min={0} max={45} accent="#f6df63" />
            <Waveform samples={samples} signal="flow" label="Flow" unit="L/min" min={-80} max={80} accent="#69d8f1" />
            <Waveform samples={samples} signal="volume" label="Volume" unit="mL" min={0} max={900} accent="#83e28f" />
          </div>

          <div className="metrics-row">
            <Metric label="RR" value={measures.respiratoryRate.toFixed(0)} unit="/min" />
            <Metric label="VTe" value={measures.tidalVolume.toFixed(0)} unit="mL" />
            <Metric label="MV" value={measures.minuteVentilation.toFixed(1)} unit="L/min" />
            <Metric label="Ppeak" value={measures.peakPressure.toFixed(0)} unit="cmH₂O" />
            <Metric label="Pmean" value={measures.meanPressure.toFixed(1)} unit="cmH₂O" />
            <Metric label="PEEP" value={measures.peep.toFixed(0)} unit="cmH₂O" />
          </div>

          <div className="action-bar">
            <button className={oxygenBoost ? 'active amber' : ''} onClick={() => setOxygenBoost((v) => !v)}>O₂ enrichment</button>
            <button className={nebuliser ? 'active blue' : ''} onClick={() => setNebuliser((v) => !v)}>Nebuliser</button>
            <button onClick={toggleFreeze}>{frozen ? 'Resume' : 'Freeze'}</button>
            <button disabled>Inspiratory hold</button>
            <button disabled>Alarm silence</button>
          </div>
        </section>

        <aside className="control-panel">
          <VentilatorControls settings={ventilator} onChange={setVentilator} />
          <PatientControls settings={patient} onChange={setPatient} />
          <div className="disclaimer">Educational simulation only — not a medical device and not for clinical decision-making.</div>
        </aside>
      </div>
    </main>
  )
}
