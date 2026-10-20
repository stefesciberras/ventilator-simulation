import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { DEFAULT_MONITOR_STATE, type MonitorPatientState, type MonitorSample } from './types'
import { generateMonitorSamples, measurementsFor, RHYTHM_LABELS, RHYTHMS } from './monitorEngine'
import { AuxiliaryMonitorModal } from './AuxiliaryMonitorModal'
import { EdumonTeachingLibraries } from './EdumonTeachingLibraries'
import { EdumonTopBar, type EdumonSimulationSpeed } from './EdumonTopBar'
import { EdumonWorkspacePanel } from './EdumonWorkspacePanel'
import { EDUMON_MODULES, moduleFromPath, type EdumonAuxiliaryMonitorId, type EdumonModuleDefinition } from './modules'
import { edumonAnaTeachingHost, edumonIcuTeachingHost } from '../teaching/hosts/edumon'
import './edumon.css'
import './edumon-console-parity.css'

const TRACE_WINDOW_SECONDS = 8
const SAMPLE_RATE = 100

type TraceKey = 'ecg' | 'arterialPressure' | 'pleth'

interface TraceSpec {
  key: TraceKey
  label: string
  unit: string
  min: number
  max: number
  className: string
}

const TRACE_SPECS: TraceSpec[] = [
  { key: 'ecg', label: 'ECG II', unit: 'mV', min: -0.8, max: 1.6, className: 'ecg' },
  { key: 'arterialPressure', label: 'ART', unit: 'mmHg', min: 0, max: 180, className: 'art' },
  { key: 'pleth', label: 'SpO₂', unit: '', min: 0, max: 1.2, className: 'spo2' },
]

function FreezeWaveformIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 9h4V5l5 7-5 7v-4H2zm20 0h-4V5l-5 7 5 7v-4h4zM11 3h2v18h-2z" fill="currentColor" />
    </svg>
  )
}

function LaserPointerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="7" cy="17" r="2.2" fill="currentColor" />
      <path d="M9 15l8.5-8.5M13.5 6.5l4 4M17.5 3.5l3 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function AlarmSilenceIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 9a7 7 0 0 1 11.8-5.1M18.7 7.2A7 7 0 0 1 19 9v4l2 3H8M10 20h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 3l18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function TraceCanvas({ samples, spec }: { samples: MonitorSample[]; spec: TraceSpec }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    const rect = canvas.getBoundingClientRect()
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(rect.width * ratio))
    canvas.height = Math.max(1, Math.round(rect.height * ratio))
    context.setTransform(ratio, 0, 0, ratio, 0, 0)

    const width = rect.width
    const height = rect.height
    context.clearRect(0, 0, width, height)

    context.strokeStyle = 'rgba(255,255,255,0.055)'
    context.lineWidth = 1
    for (let column = 1; column < 8; column += 1) {
      const x = (width * column) / 8
      context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke()
    }
    for (let row = 1; row < 4; row += 1) {
      const y = (height * row) / 4
      context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke()
    }

    if (!samples.length) return
    const range = Math.max(0.001, spec.max - spec.min)
    const toY = (value: number) => height - ((value - spec.min) / range) * height

    context.strokeStyle = getComputedStyle(canvas).color
    context.lineWidth = spec.key === 'ecg' ? 1.8 : 2.1
    context.lineJoin = 'round'
    context.lineCap = 'round'
    context.beginPath()
    samples.forEach((sample, index) => {
      const x = (index / Math.max(1, samples.length - 1)) * width
      const y = Math.max(1, Math.min(height - 1, toY(sample[spec.key])))
      if (index === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    })
    context.stroke()
  }, [samples, spec])

  return (
    <div className={`edumon-trace edumon-trace-${spec.className}`}>
      <div className="edumon-trace-label"><strong>{spec.label}</strong>{spec.unit && <span>{spec.unit}</span>}</div>
      <canvas ref={canvasRef} aria-label={`${spec.label} waveform`} />
    </div>
  )
}

function ValuePanel({ label, value, unit, detail, className }: { label: string; value: string; unit?: string; detail?: string; className: string }) {
  return (
    <div className={`edumon-value-panel edumon-value-${className}`}>
      <div className="edumon-value-label">{label}</div>
      <div className="edumon-value-main">{value}</div>
      {unit && <div className="edumon-value-unit">{unit}</div>}
      {detail && <div className="edumon-value-detail">{detail}</div>}
    </div>
  )
}

function EdumonLanding() {
  return (
    <main className="edumon-page edumon-landing">
      <section className="edumon-module-picker">
        <div className="edumon-module-picker-heading">
          <span>EDUSIM monitoring platform</span>
          <h1>EDUMON</h1>
          <p>Select the clinical monitor environment. Both modules share the same patient, waveform, teaching and scenario foundations.</p>
        </div>
        <div className="edumon-module-cards">
          {Object.values(EDUMON_MODULES).map((module) => (
            <a key={module.id} className="edumon-module-card" href={`/edumon/${module.id}`}>
              <span>{module.id === 'ana' ? 'ANA' : 'ICU'}</span>
              <strong>{module.productName}</strong>
              <p>{module.subtitle}</p>
              <div>{module.id === 'ana' ? 'Anaesthetic gases · MAC · BIS / TOF' : 'ICP / CPP · CVP · advanced ICU monitoring'}</div>
            </a>
          ))}
        </div>
      </section>
      <div className="edumon-version">EDUMON v0.1.0.0</div>
    </main>
  )
}

function GasMonitorPreview() {
  return (
    <div className="edumon-extra-monitor-grid edumon-gas-monitor">
      <div><span>FiO₂</span><strong>50</strong><small>%</small></div>
      <div><span>EtO₂</span><strong>44</strong><small>%</small></div>
      <div><span>EtSevo</span><strong>1.8</strong><small>%</small></div>
      <div><span>FiSevo</span><strong>2.0</strong><small>%</small></div>
      <div className="wide"><span>MAC</span><strong>0.9</strong><small>age adjusted · preview</small></div>
      <p className="wide">Gas physiology and live analyser waveforms are deliberately not implemented yet.</p>
    </div>
  )
}

function NeuroMonitorPreview({ map }: { map: number | null }) {
  const icp = 14
  const cpp = map == null ? null : Math.max(0, map - icp)
  return (
    <div className="edumon-extra-monitor-grid edumon-neuro-monitor">
      <div><span>ICP</span><strong>{icp}</strong><small>mmHg</small></div>
      <div><span>CPP</span><strong>{cpp ?? '—'}</strong><small>mmHg</small></div>
      <div className="wide edumon-placeholder-waveform" aria-label="ICP waveform placeholder"><i /><i /><i /><i /><i /><i /></div>
      <p className="wide">CPP is derived from the current monitor MAP minus ICP. The dedicated ICP waveform engine will be added later.</p>
    </div>
  )
}

function TrendsPreview() {
  return (
    <div className="edumon-trends-preview">
      <div className="edumon-trend-line"><span>HR</span><i style={{ width: '72%' }} /></div>
      <div className="edumon-trend-line"><span>MAP</span><i style={{ width: '64%' }} /></div>
      <div className="edumon-trend-line"><span>SpO₂</span><i style={{ width: '91%' }} /></div>
      <p>The modal is reusable for extra monitor pages as well as teaching media.</p>
    </div>
  )
}

function EdumonMonitor({ module }: { module: EdumonModuleDefinition }) {
  const [patientState, setPatientState] = useState<MonitorPatientState>(DEFAULT_MONITOR_STATE)
  const [elapsed, setElapsed] = useState(TRACE_WINDOW_SECONDS)
  const [simulationPaused, setSimulationPaused] = useState(false)
  const [simulationSpeed, setSimulationSpeed] = useState<EdumonSimulationSpeed>(1)
  const [frozen, setFrozen] = useState(false)
  const [frozenSamples, setFrozenSamples] = useState<MonitorSample[] | null>(null)
  const [laserActive, setLaserActive] = useState(false)
  const [laserPoint, setLaserPoint] = useState({ x: 0.5, y: 0.25 })
  const [developerControls, setDeveloperControls] = useState(false)
  const [auxiliaryMonitor, setAuxiliaryMonitor] = useState<EdumonAuxiliaryMonitorId | null>(null)
  const [topPanel, setTopPanel] = useState<'scenario' | 'account' | 'about' | null>(null)
  const [alarmSilencedUntil, setAlarmSilencedUntil] = useState<number | null>(null)
  const [alarmSilenceRemaining, setAlarmSilenceRemaining] = useState(0)
  const alarmSilenceTimeoutRef = useRef<number | null>(null)
  const alarmSilenceLongPressTimeoutRef = useRef<number | null>(null)
  const alarmSilenceLongPressTriggeredRef = useRef(false)

  useEffect(() => {
    if (frozen || simulationPaused) return
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const deltaSeconds = Math.min(0.1, Math.max(0, (now - last) / 1000))
      last = now
      setElapsed((current) => current + deltaSeconds * simulationSpeed)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [frozen, simulationPaused, simulationSpeed])

  useEffect(() => {
    if (alarmSilencedUntil == null) {
      setAlarmSilenceRemaining(0)
      return
    }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((alarmSilencedUntil - Date.now()) / 1000))
      setAlarmSilenceRemaining(remaining)
      if (remaining <= 0) setAlarmSilencedUntil(null)
    }
    update()
    const timer = window.setInterval(update, 250)
    return () => window.clearInterval(timer)
  }, [alarmSilencedUntil])

  useEffect(() => () => {
    if (alarmSilenceTimeoutRef.current != null) window.clearTimeout(alarmSilenceTimeoutRef.current)
    if (alarmSilenceLongPressTimeoutRef.current != null) window.clearTimeout(alarmSilenceLongPressTimeoutRef.current)
  }, [])

  const liveSamples = useMemo(() => generateMonitorSamples(patientState, elapsed, TRACE_WINDOW_SECONDS, SAMPLE_RATE), [patientState, elapsed])
  const samples = frozenSamples ?? liveSamples
  const measurements = measurementsFor(patientState)
  const teachingHost = module.id === 'ana' ? edumonAnaTeachingHost : edumonIcuTeachingHost
  const selectedAuxiliary = module.auxiliaryMonitors.find((item) => item.id === auxiliaryMonitor) ?? null

  const toggleFreeze = () => {
    if (frozen) {
      setFrozen(false)
      setFrozenSamples(null)
      return
    }
    setFrozenSamples(liveSamples)
    setFrozen(true)
  }

  const toggleLaser = () => {
    setLaserActive((active) => {
      const next = !active
      if (next && !frozen) {
        setFrozenSamples(liveSamples)
        setFrozen(true)
      }
      return next
    })
  }

  const silenceAlarm = (durationMs = 120000) => {
    if (alarmSilenceTimeoutRef.current != null) window.clearTimeout(alarmSilenceTimeoutRef.current)
    const until = Date.now() + durationMs
    setAlarmSilencedUntil(until)
    alarmSilenceTimeoutRef.current = window.setTimeout(() => {
      setAlarmSilencedUntil(null)
      alarmSilenceTimeoutRef.current = null
    }, durationMs)
  }

  const clearAlarmSilenceLongPress = () => {
    if (alarmSilenceLongPressTimeoutRef.current != null) {
      window.clearTimeout(alarmSilenceLongPressTimeoutRef.current)
      alarmSilenceLongPressTimeoutRef.current = null
    }
  }

  const startAlarmSilenceLongPress = () => {
    clearAlarmSilenceLongPress()
    alarmSilenceLongPressTriggeredRef.current = false
    alarmSilenceLongPressTimeoutRef.current = window.setTimeout(() => {
      alarmSilenceLongPressTriggeredRef.current = true
      alarmSilenceLongPressTimeoutRef.current = null
      silenceAlarm(600000)
    }, 800)
  }

  const finishAlarmSilencePress = () => clearAlarmSilenceLongPress()
  const handleAlarmSilenceClick = () => {
    if (alarmSilenceLongPressTriggeredRef.current) {
      alarmSilenceLongPressTriggeredRef.current = false
      return
    }
    silenceAlarm()
  }

  const handleLaserMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!laserActive) return
    const rect = event.currentTarget.getBoundingClientRect()
    setLaserPoint({
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height))),
    })
  }

  const updateRhythm = (rhythm: MonitorPatientState['rhythm']) => {
    setPatientState((current) => {
      let heartRate = current.heartRate
      if (rhythm === 'sinus-bradycardia' && heartRate >= 60) heartRate = 48
      if (rhythm === 'sinus-tachycardia' && heartRate <= 100) heartRate = 125
      if (rhythm === 'svt' && heartRate < 140) heartRate = 180
      if (rhythm === 'ventricular-tachycardia' && heartRate < 110) heartRate = 160
      if (rhythm === 'sinus' && (heartRate < 60 || heartRate > 100)) heartRate = 78
      return { ...current, rhythm, heartRate }
    })
  }

  const alarmMinutes = Math.floor(alarmSilenceRemaining / 60)
  const alarmSeconds = alarmSilenceRemaining % 60
  const alarmSilenceLabel = alarmSilenceRemaining > 0 ? `${alarmMinutes}:${String(alarmSeconds).padStart(2, '0')}` : 'Alarm silence'

  return (
    <main className={`app-shell edumon-app-shell edumon-module-${module.id}`}>
      <EdumonTopBar
        module={module}
        simulationPaused={simulationPaused}
        simulationSpeed={simulationSpeed}
        elapsedSeconds={elapsed}
        onPausedChange={setSimulationPaused}
        onSpeedChange={setSimulationSpeed}
        onScenario={() => setTopPanel('scenario')}
        onAccount={() => setTopPanel('account')}
        onAbout={() => setTopPanel('about')}
      />

      <div className="workspace edumon-workspace">
        <section className="ventilator-console edumon-console" aria-label={`${module.productName} patient monitor`}>
          <div className="action-bar console-top-actions edumon-console-top-actions" aria-label="Monitor actions">
            <button type="button" className={`hardware-button icon-button teaching-laser-console-button ${laserActive ? 'active' : ''}`} onClick={toggleLaser} title="Laser pointer" aria-label="Laser pointer" aria-pressed={laserActive}><LaserPointerIcon /></button>
            <button type="button" className={`hardware-button icon-button freeze-button ${frozen ? 'active' : ''}`} onClick={toggleFreeze} title={frozen ? 'Resume waveforms' : 'Freeze waveforms'} aria-label={frozen ? 'Resume waveforms' : 'Freeze waveforms'}><FreezeWaveformIcon /></button>
            <button
              type="button"
              className={`hardware-button icon-button alarm-button ${alarmSilenceRemaining > 0 ? 'active' : ''}`}
              onClick={handleAlarmSilenceClick}
              onPointerDown={startAlarmSilenceLongPress}
              onPointerUp={finishAlarmSilencePress}
              onPointerCancel={finishAlarmSilencePress}
              onPointerLeave={finishAlarmSilencePress}
              onContextMenu={(event) => event.preventDefault()}
              title={alarmSilenceRemaining > 0 ? `Alarm silenced for ${alarmSilenceLabel}` : 'Silence alarms for 2 minutes; hold for 10 minutes'}
              aria-label={alarmSilenceRemaining > 0 ? `Alarm silenced for ${alarmSilenceLabel}` : 'Alarm silence'}
            ><AlarmSilenceIcon /></button>
            {alarmSilenceRemaining > 0 && <span className="edumon-alarm-silence-timer">{alarmSilenceLabel}</span>}
          </div>

          <div className="edumon-monitor-body">
            <div className="edumon-waveform-area" onPointerMove={handleLaserMove} onPointerDown={handleLaserMove}>
              {TRACE_SPECS.map((spec) => <TraceCanvas key={spec.key} samples={samples} spec={spec} />)}
              {frozen && <div className="edumon-freeze-indicator">FROZEN</div>}
              {laserActive && <div className="edumon-laser-point" style={{ left: `${laserPoint.x * 100}%`, top: `${laserPoint.y * 100}%` }} aria-hidden="true" />}
            </div>

            <aside className="edumon-measurements" aria-label="Measured values">
              <ValuePanel label="HR" value={measurements.heartRate == null ? '—' : `${measurements.heartRate}`} unit="bpm" className="ecg" />
              <ValuePanel label="ART" value={measurements.systolicPressure == null ? '—/—' : `${measurements.systolicPressure}/${measurements.diastolicPressure}`} unit="mmHg" detail={measurements.meanPressure == null ? 'MAP —' : `MAP ${measurements.meanPressure}`} className="art" />
              <ValuePanel label="SpO₂" value={measurements.spo2 == null ? '—' : `${measurements.spo2}`} unit="%" className="spo2" />
            </aside>
          </div>

          <div className="edumon-control-strip" aria-label="Monitor controls">
            <button type="button" className="edumon-control-tile disabled" disabled title="NIBP will be enabled in a later EDUMON milestone"><span>NIBP</span><strong>Inactive</strong><small>Manual / cycle</small></button>
            {module.auxiliaryMonitors.map((item) => (
              <button key={item.id} type="button" className="edumon-control-tile" onClick={() => setAuxiliaryMonitor(item.id)}><span>Extra monitor</span><strong>{item.shortLabel}</strong><small>{item.description}</small></button>
            ))}
            <button type="button" className="edumon-control-tile" onClick={() => setDeveloperControls((visible) => !visible)}><span>Monitor</span><strong>{RHYTHM_LABELS[patientState.rhythm]}</strong><small>v0.1 rhythm test</small></button>
          </div>

          {developerControls && (
            <div className="edumon-overlay-panel">
              <div className="edumon-overlay-title">v0.1 monitor test controls</div>
              <label><span>Rhythm</span><select value={patientState.rhythm} onChange={(event) => updateRhythm(event.target.value as MonitorPatientState['rhythm'])}>{RHYTHMS.map((rhythm) => <option key={rhythm} value={rhythm}>{RHYTHM_LABELS[rhythm]}</option>)}</select></label>
              <label><span>Heart rate <b>{patientState.heartRate}</b></span><input type="range" min="30" max="240" step="1" value={patientState.heartRate} onChange={(event) => setPatientState((current) => ({ ...current, heartRate: Number(event.target.value) }))} /></label>
              <label><span>ART systolic <b>{patientState.systolicPressure}</b></span><input type="range" min="50" max="220" step="1" value={patientState.systolicPressure} onChange={(event) => setPatientState((current) => ({ ...current, systolicPressure: Number(event.target.value) }))} /></label>
              <label><span>ART diastolic <b>{patientState.diastolicPressure}</b></span><input type="range" min="20" max="140" step="1" value={patientState.diastolicPressure} onChange={(event) => setPatientState((current) => ({ ...current, diastolicPressure: Number(event.target.value) }))} /></label>
              <label><span>SpO₂ <b>{patientState.spo2}%</b></span><input type="range" min="50" max="100" step="1" value={patientState.spo2} onChange={(event) => setPatientState((current) => ({ ...current, spo2: Number(event.target.value) }))} /></label>
              <label><span>Pleth perfusion <b>{patientState.peripheralPerfusion.toFixed(1)}</b></span><input type="range" min="0" max="1" step="0.1" value={patientState.peripheralPerfusion} onChange={(event) => setPatientState((current) => ({ ...current, peripheralPerfusion: Number(event.target.value) }))} /></label>
            </div>
          )}
        </section>

        <EdumonWorkspacePanel patientState={patientState} onPatientStateChange={setPatientState} teachingHost={teachingHost} meanPressure={measurements.meanPressure} />
      </div>

      {selectedAuxiliary && auxiliaryMonitor && (
        <AuxiliaryMonitorModal title={selectedAuxiliary.label} onClose={() => setAuxiliaryMonitor(null)}>
          {auxiliaryMonitor === 'ana-gases' && <GasMonitorPreview />}
          {auxiliaryMonitor === 'icu-neuro' && <NeuroMonitorPreview map={measurements.meanPressure} />}
          {auxiliaryMonitor === 'trends' && <TrendsPreview />}
          {auxiliaryMonitor === 'teaching' && <EdumonTeachingLibraries host={teachingHost} />}
        </AuxiliaryMonitorModal>
      )}

      {topPanel === 'scenario' && <AuxiliaryMonitorModal title="Scenario" onClose={() => setTopPanel(null)}><div className="edumon-top-panel-content"><span>ACTIVE SCENARIO</span><strong>None</strong><p>EDUMON will use the shared EDUSIM Scenario Runtime and the same scenario workflow as EDUVENT.</p></div></AuxiliaryMonitorModal>}
      {topPanel === 'account' && <AuxiliaryMonitorModal title="Instructor account" onClose={() => setTopPanel(null)}><EdumonTeachingLibraries host={teachingHost} /></AuxiliaryMonitorModal>}
      {topPanel === 'about' && <AuxiliaryMonitorModal title={module.productName} onClose={() => setTopPanel(null)}><div className="edumon-top-panel-content"><span>EDUSIM MONITORING PLATFORM</span><strong>{module.subtitle}</strong><p>Version v0.1.0.0</p><p>Educational simulation only — not a medical device and not for clinical decision-making.</p></div></AuxiliaryMonitorModal>}
    </main>
  )
}

export function EdumonApp() {
  const moduleId = moduleFromPath(window.location.pathname)
  if (!moduleId) return <EdumonLanding />
  return <EdumonMonitor module={EDUMON_MODULES[moduleId]} />
}
