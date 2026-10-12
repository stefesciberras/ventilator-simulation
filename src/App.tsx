import { useEffect, useMemo, useState } from 'react'
import { PatientControls, VentilatorControls } from './components/Controls'
import { Waveform } from './components/Waveform'
import { calculateMeasurements, generateWaveforms } from './simulation/engine'
import type { PatientSettings, Sample, VentilatorSettings } from './simulation/types'

const initialVentilator: VentilatorSettings = {
  mode: 'VC-AC', fio2: 0.35, peep: 5, rate: 14, tidalVolume: 500, inspiratoryTime: 1,
  inspiratoryFlow: 30, pressureControl: 15, pressureSupport: 10, triggerSensitivity: 2, terminationSensitivity: 25,
}

const initialPatient: PatientSettings = {
  compliance: 60, resistance: 6, expiratoryResistance: 8, spontaneousRate: 12, effort: 5, neuralInspiratoryTime: 1,
}

const WINDOW_SAMPLES = 1200
const MINUTE_SAMPLES = 6000
const HISTORY_START = MINUTE_SAMPLES
const SIMULATION_DURATION = 150

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong><small>{unit}</small></div>
}

function PauseIcon({ paused }: { paused: boolean }) {
  return paused ? (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z" fill="currentColor" /></svg>
  )
}

function NebuliserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 4h8v4H8zM7 9h10l1 10H6L7 9z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 1.5v2M9 2.4l1 1.5M15 2.4l-1 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function AlarmSilenceIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.5 9a5.5 5.5 0 0 1 9.7-3.6M17.5 9v5l2 2H8.5M10 19h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export default function App() {
  const [ventilator, setVentilator] = useState(initialVentilator)
  const [patient, setPatient] = useState(initialPatient)
  const [oxygenBoost, setOxygenBoost] = useState(false)
  const [nebuliser, setNebuliser] = useState(false)
  const [alarmSilenced, setAlarmSilenced] = useState(false)
  const [frozen, setFrozen] = useState(false)
  const [frozenSamples, setFrozenSamples] = useState<Sample[] | null>(null)
  const [cursor, setCursor] = useState(HISTORY_START)
  const [traceCursor, setTraceCursor] = useState(Math.floor(WINDOW_SAMPLES * 0.7))
  const [inspiratoryHoldRequestTime, setInspiratoryHoldRequestTime] = useState<number | null>(null)

  const effectiveVentilator = useMemo(() => ({ ...ventilator, fio2: oxygenBoost ? 1 : ventilator.fio2 }), [ventilator, oxygenBoost])
  const generated = useMemo(
    () => generateWaveforms(effectiveVentilator, patient, SIMULATION_DURATION, 0.01, {
      inspiratoryHoldRequestTime,
      inspiratoryHoldDuration: 2,
    }),
    [effectiveVentilator, patient, inspiratoryHoldRequestTime],
  )
  const maxCursor = Math.max(HISTORY_START + 1, generated.length - WINDOW_SAMPLES)

  useEffect(() => {
    if (frozen) return
    const timer = window.setInterval(() => setCursor((current) => current + 10 >= maxCursor ? HISTORY_START : current + 10), 100)
    return () => window.clearInterval(timer)
  }, [frozen, maxCursor])

  useEffect(() => {
    setCursor(HISTORY_START)
    setFrozen(false)
    setFrozenSamples(null)
    setInspiratoryHoldRequestTime(null)
  }, [ventilator, patient, oxygenBoost])

  const movingSamples = useMemo(() => generated.slice(cursor, cursor + WINDOW_SAMPLES), [generated, cursor])
  const samples = frozen && frozenSamples ? frozenSamples : movingSamples
  const measurementEnd = Math.min(generated.length, cursor + WINDOW_SAMPLES)
  const measurementSamples = useMemo(
    () => generated.slice(Math.max(0, measurementEnd - MINUTE_SAMPLES), measurementEnd),
    [generated, measurementEnd],
  )
  const measures = useMemo(() => calculateMeasurements(measurementSamples, effectiveVentilator), [measurementSamples, effectiveVentilator])
  const selectedSample = samples[Math.min(traceCursor, Math.max(0, samples.length - 1))]
  const currentSimulationTime = movingSamples[movingSamples.length - 1]?.time ?? 0
  const holdIndicatorActive = inspiratoryHoldRequestTime != null && currentSimulationTime - inspiratoryHoldRequestTime < 8
  const ieRatio = Math.max(0, 60 / Math.max(ventilator.rate, 1) / Math.max(ventilator.inspiratoryTime, 0.2) - 1)

  useEffect(() => {
    if (!frozen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      const direction = event.key === 'ArrowLeft' ? -1 : 1
      setTraceCursor((current) => Math.max(0, Math.min(samples.length - 1, current + direction)))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [frozen, samples.length])

  const toggleFreeze = () => {
    if (!frozen) {
      setFrozenSamples(movingSamples)
      setTraceCursor(Math.min(Math.floor(movingSamples.length * 0.7), Math.max(0, movingSamples.length - 1)))
    }
    setFrozen((value) => !value)
  }

  const startInspiratoryHold = () => {
    if (frozen || ventilator.mode === 'PSV') return
    setInspiratoryHoldRequestTime(currentSimulationTime)
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div><span className="brand-kicker">EDUVENT</span><h1>Mechanical Ventilation Simulator</h1></div>
        <div className="status-cluster"><span className={`status-dot ${frozen ? 'paused' : ''}`} />{frozen ? 'SIMULATION PAUSED' : 'SIMULATION ACTIVE'} <span className="version">v0.8</span></div>
      </header>

      <div className="workspace">
        <section className="ventilator-console">
          <div className="screen-header">
            <div className="mode-title"><span>Mode</span><strong>{ventilator.mode}</strong></div>
            <div className="screen-settings">
              <span>FiO₂ <b>{Math.round(effectiveVentilator.fio2 * 100)}%</b></span>
              <span>PEEP <b>{ventilator.peep}</b></span>
              {ventilator.mode !== 'PSV' && <span>I:E <b>1:{ieRatio.toFixed(1)}</b></span>}
              {ventilator.mode === 'VC-AC' && <span>Flow <b>{ventilator.inspiratoryFlow.toFixed(0)} L/min</b></span>}
              {ventilator.mode === 'PSV' && <span>ETS <b>{ventilator.terminationSensitivity}%</b></span>}
            </div>
          </div>

          <div className="screen-body">
            <div className="waveforms">
              <Waveform samples={samples} signal="pressure" label="Paw" unit="cmH₂O" min={0} max={45} accent="#f6df63" frozen={frozen} cursorIndex={traceCursor} onCursorChange={setTraceCursor} showTime />
              <Waveform samples={samples} signal="flow" label="Flow" unit="L/min" min={-80} max={80} accent="#69d8f1" frozen={frozen} cursorIndex={traceCursor} onCursorChange={setTraceCursor} />
              <Waveform samples={samples} signal="volume" label="Volume" unit="mL" min={0} max={900} accent="#83e28f" frozen={frozen} cursorIndex={traceCursor} onCursorChange={setTraceCursor} />
            </div>

            <aside className="metrics-panel" aria-label="Measured values">
              <div className="metrics-title">Measured</div>
              <Metric label="RR" value={measures.respiratoryRate.toFixed(0)} unit="/min" />
              <Metric label="VTe" value={measures.tidalVolume.toFixed(0)} unit="mL" />
              <Metric label="MV" value={measures.minuteVentilation.toFixed(1)} unit="L/min" />
              <Metric label="Ppeak" value={measures.peakPressure.toFixed(0)} unit="cmH₂O" />
              <Metric label="Pmean" value={measures.meanPressure.toFixed(1)} unit="cmH₂O" />
              <Metric label="PEEP" value={measures.peep.toFixed(0)} unit="cmH₂O" />
              {frozen && selectedSample && <div className="cursor-hint">← → or drag trace cursor</div>}
            </aside>
          </div>

          <div className="action-bar">
            <button className={`hardware-button oxygen-button ${oxygenBoost ? 'active amber' : ''}`} onClick={() => setOxygenBoost((v) => !v)} title="O₂ enrichment" aria-label="O₂ enrichment">O₂</button>
            <button className={`hardware-button icon-button ${nebuliser ? 'active blue' : ''}`} onClick={() => setNebuliser((v) => !v)} title="Nebuliser" aria-label="Nebuliser"><NebuliserIcon /></button>
            <button className={`hardware-button icon-button freeze-button ${frozen ? 'active' : ''}`} onClick={toggleFreeze} title={frozen ? 'Resume simulation' : 'Pause and freeze waveforms'} aria-label={frozen ? 'Resume simulation' : 'Pause simulation'}><PauseIcon paused={frozen} /></button>
            <button className={`hardware-button ${holdIndicatorActive ? 'active' : ''}`} onClick={startInspiratoryHold} disabled={frozen || ventilator.mode === 'PSV'} title={ventilator.mode === 'PSV' ? 'Inspiratory hold is available during mandatory ventilation' : 'Perform a 2 second end-inspiratory hold'}>Inspiratory hold</button>
            <button className={`hardware-button icon-button alarm-button ${alarmSilenced ? 'active' : ''}`} onClick={() => setAlarmSilenced((v) => !v)} title="Alarm silence" aria-label="Alarm silence"><AlarmSilenceIcon /></button>
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
