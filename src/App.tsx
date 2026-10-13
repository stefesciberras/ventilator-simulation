import { useEffect, useMemo, useRef, useState } from 'react'
import { PatientControls, VentilatorControls } from './components/Controls'
import { InstructorLiveRoom, SessionPanel } from './components/SessionPanel'
import { InstructorAccountControls } from './components/InstructorAccountControls'
import { CaseMediaPanel } from './components/CaseMediaPanel'
import { PhysiologyMeasurementsDialog } from './components/PhysiologyMeasurementsDialog'
import { InteractiveVentilatorStrip, VentilatorModeControl } from './components/InteractiveVentilatorStrip'
import { Waveform } from './components/Waveform'
import type { Signal } from './components/Waveform'
import { advanceSimulation, calculateMeasurements, createSimulationState } from './simulation/engine'
import { copyDiagnosticSnapshot } from './diagnostics'
import type { PatientSettings, Sample, VentilatorSettings } from './simulation/types'
import type { AlarmLimits, CandidateAlarmLevel } from './alarmTypes'
import { useTeachingSession } from './session/useTeachingSession'
import type { InstructorScenarioSnapshot } from './instructorAccount'
import { calculatePhysiologicalMeasurements } from './physiologyMeasurements'
import './session.css'
import './physiology.css'

const initialVentilator: VentilatorSettings = {
  mode: 'VC-AC', fio2: 0.35, peep: 5, rate: 14, tidalVolume: 500, inspiratoryTime: 1,
  inspiratoryFlow: 30, plateauPercent: 0, pressureControl: 15, volumeGuaranteePressureLimit: 40, pressureSupport: 10, triggerType: 'pressure', triggerSensitivity: 2, flowTriggerSensitivity: 2, terminationSensitivity: 25,
  simvSyncWindowPercent: 25, showSimvSyncWindow: false,
  pHigh: 24, pLow: 5, tHigh: 4, tLow: 0.5,
}

const initialPatient: PatientSettings = {
  sex: 'male', heightCm: 170, oxygenConsumption: 250, frc: 2500, shuntFraction: 0.03,
  compliance: 60, resistance: 6, expiratoryResistance: 8, spontaneousRate: 12, effort: 5, neuralInspiratoryTime: 1, effortRisePercent: 50, effortRelaxationPercent: 50, endExpiratoryOesophagealPressure: -5, co2Production: 250, deadSpaceVolume: 150,
}

interface EventMeasurements {
  peakPressure: number
  tidalVolume: number
  respiratoryRate: number
}

type OptionalWaveform = Extract<Signal, 'volume' | 'co2' | 'oesophagealPressure'>

interface WaveformDisplaySettings {
  third: OptionalWaveform
  fourth: OptionalWaveform | null
}

const waveformOptions: Array<{ value: OptionalWaveform; label: string }> = [
  { value: 'volume', label: 'Volume' },
  { value: 'co2', label: 'CO₂' },
  { value: 'oesophagealPressure', label: 'Oesophageal pressure' },
]

const waveformConfig: Record<OptionalWaveform, { label: string; unit: string; min: number; max: number; accent: string }> = {
  volume: { label: 'Volume', unit: 'mL', min: 0, max: 900, accent: '#83e28f' },
  co2: { label: 'CO₂', unit: 'mmHg', min: 0, max: 50, accent: '#d9c85e' },
  oesophagealPressure: { label: 'Pes', unit: 'cmH₂O', min: -20, max: 5, accent: '#d790e8' },
}

const initialWaveformDisplay: WaveformDisplaySettings = { third: 'volume', fourth: null }

const initialAlarmLimits: AlarmLimits = {
  apneaTime: 30,
  peakPressure: 40,
  co2Min: 30,
  co2Max: 50,
  minuteVentilationMin: 3,
  minuteVentilationMax: 12,
  tidalVolumeMin: 250,
  tidalVolumeMax: 600,
  respiratoryRateMin: 10,
  respiratoryRateMax: 25,
}
const VENTILATOR_STORAGE_KEY = 'eduvent.ventilator-settings'
const PATIENT_STORAGE_KEY = 'eduvent.patient-settings'
const ALARM_STORAGE_KEY = 'eduvent.alarm-limits'
const WAVEFORM_STORAGE_KEY = 'eduvent.waveform-display'
const PATIENT_TRANSITION_STORAGE_KEY = 'eduvent.patient-transition-seconds'
const SHOW_PATIENT_EFFORT_STORAGE_KEY = 'eduvent.show-patient-effort'
const SCENARIO_MEDIA_STORAGE_KEY = 'eduvent.scenario-media-ids'
const WINDOW_SAMPLES = 1200
const MINUTE_SAMPLES = 6000
const HISTORY_SAMPLES = 7200
const DT = 0.01
const TICK_STEPS = 10

function loadStoredSettings<T extends object>(key: string, defaults: T): T {
  if (typeof window === 'undefined') return { ...defaults }
  try {
    const stored = window.localStorage.getItem(key)
    if (!stored) return { ...defaults }
    const parsed = JSON.parse(stored)
    if (!parsed || typeof parsed !== 'object') return { ...defaults }
    return { ...defaults, ...(parsed as Partial<T>) }
  } catch {
    return { ...defaults }
  }
}

function formatSimulationClock(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong><small>{unit}</small></div>
}

function GasMetric({ etco2, spo2 }: { etco2: string; spo2: string }) {
  return (
    <div className="metric gas-metric" aria-label={`EtCO₂ ${etco2} millimetres of mercury, SpO₂ ${spo2} percent`}>
      <div className="gas-metric-item co2">
        <span>EtCO₂</span>
        <div><strong>{etco2}</strong><small>mmHg</small></div>
      </div>
      <div className="gas-metric-item spo2">
        <span>SpO₂</span>
        <div><strong>{spo2}</strong><small>%</small></div>
      </div>
    </div>
  )
}

function VerticalDualAlarmSlider({ label, unit, min, max, step, low, high, onLowChange, onHighChange }: { label: string; unit: string; min: number; max: number; step: number; low: number; high: number; onLowChange: (value: number) => void; onHighChange: (value: number) => void }) {
  const span = Math.max(0.0001, max - min)
  const lowPct = ((low - min) / span) * 100
  const highPct = ((high - min) / span) * 100
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
  const setHandleValue = (handle: 'low' | 'high', value: number) => {
    const next = quantise(value)
    if (handle === 'low') onLowChange(Math.min(next, high))
    else onHighChange(Math.max(next, low))
  }
  const valueFromPointer = (clientY: number, track: HTMLDivElement) => {
    const rect = track.getBoundingClientRect()
    const usableTop = rect.top + handleSize / 2
    const usableHeight = Math.max(1, rect.height - handleSize)
    const fraction = Math.min(1, Math.max(0, (usableTop + usableHeight - clientY) / usableHeight))
    return quantise(min + fraction * span)
  }
  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const value = valueFromPointer(event.clientY, event.currentTarget)
    const handle: 'low' | 'high' = Math.abs(value - low) <= Math.abs(value - high) ? 'low' : 'high'
    dragging.current = handle
    event.currentTarget.setPointerCapture(event.pointerId)
    setHandleValue(handle, value)
  }
  const continueDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    event.preventDefault()
    setHandleValue(dragging.current, valueFromPointer(event.clientY, event.currentTarget))
  }
  const stopDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const onHandleKey = (handle: 'low' | 'high', value: number, event: React.KeyboardEvent<HTMLDivElement>) => {
    const direction = event.key === 'ArrowUp' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowDown' || event.key === 'ArrowLeft' ? -1 : 0
    if (!direction) return
    event.preventDefault()
    setHandleValue(handle, value + direction * step)
  }

  return (
    <div className="alarm-slider-card vertical-dual-card">
      <span>{label}</span>
      <strong>{low}–{high} <small>{unit}</small></strong>
      <div className="vertical-dual-slider-wrap">
        <em>{max}</em>
        <div className="vertical-dual-range" onPointerDown={startDrag} onPointerMove={continueDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag}>
          <div className="vertical-dual-track" />
          <div className="vertical-dual-active" style={{ bottom: `${10 + lowPct * 1.7}px`, height: `${Math.max(0, highPct - lowPct) * 1.7}px` }} />
          <div className="vertical-dual-handle low" style={{ top: `${lowTop}px` }} role="slider" tabIndex={0} aria-label={`${label} minimum alarm limit`} aria-valuemin={min} aria-valuemax={high} aria-valuenow={low} onKeyDown={(event) => onHandleKey('low', low, event)} />
          <div className="vertical-dual-handle high" style={{ top: `${highTop}px` }} role="slider" tabIndex={0} aria-label={`${label} maximum alarm limit`} aria-valuemin={low} aria-valuemax={max} aria-valuenow={high} onKeyDown={(event) => onHandleKey('high', high, event)} />
        </div>
        <em>{min}</em>
      </div>
    </div>
  )
}

function interpolatePatientSettings(from: PatientSettings, to: PatientSettings, fraction: number): PatientSettings {
  const f = Math.max(0, Math.min(1, fraction))
  const lerp = (a: number, b: number) => a + (b - a) * f
  return {
    sex: f < 0.5 ? (from.sex ?? 'male') : (to.sex ?? 'male'),
    heightCm: lerp(from.heightCm ?? 170, to.heightCm ?? 170),
    oxygenConsumption: lerp(from.oxygenConsumption ?? 250, to.oxygenConsumption ?? 250),
    frc: lerp(from.frc ?? 2500, to.frc ?? 2500),
    shuntFraction: lerp(from.shuntFraction ?? 0.03, to.shuntFraction ?? 0.03),
    compliance: lerp(from.compliance, to.compliance),
    resistance: lerp(from.resistance, to.resistance),
    expiratoryResistance: lerp(from.expiratoryResistance, to.expiratoryResistance),
    spontaneousRate: lerp(from.spontaneousRate, to.spontaneousRate),
    effort: lerp(from.effort, to.effort),
    neuralInspiratoryTime: lerp(from.neuralInspiratoryTime, to.neuralInspiratoryTime),
    effortRisePercent: lerp(from.effortRisePercent, to.effortRisePercent),
    effortRelaxationPercent: lerp(from.effortRelaxationPercent, to.effortRelaxationPercent),
    endExpiratoryOesophagealPressure: lerp(from.endExpiratoryOesophagealPressure, to.endExpiratoryOesophagealPressure),
    co2Production: lerp(from.co2Production, to.co2Production),
    deadSpaceVolume: lerp(from.deadSpaceVolume, to.deadSpaceVolume),
  }
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

function MeasurementsInfoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 10.7v6M12 7.2h.01" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
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

function DiagnosticIcon({ copied }: { copied: boolean }) {
  return copied ? (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4 4L19 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4.5" y="4.5" width="15" height="15" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M7.5 13h2l1.4-4 2.2 7 1.5-4H17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function calculateMeasuredIERatio(samples: Sample[]): number | null {
  if (samples.length < 3) return null
  const cycles: Array<{ ti: number; te: number }> = []
  let inspirationStart: number | null = null
  let inspirationEnd: number | null = null

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]
    const current = samples[index]
    if (previous.phase === 'expiration' && current.phase === 'inspiration') {
      if (inspirationStart != null && inspirationEnd != null) {
        const ti = inspirationEnd - inspirationStart
        const te = current.time - inspirationEnd
        if (ti > 0.05 && te >= 0) cycles.push({ ti, te })
      }
      inspirationStart = current.time
      inspirationEnd = null
    } else if (previous.phase === 'inspiration' && current.phase === 'expiration' && inspirationStart != null) {
      inspirationEnd = current.time
    }
  }

  const recent = cycles.slice(-4)
  if (!recent.length) return null
  const totalTi = recent.reduce((sum, cycle) => sum + cycle.ti, 0)
  const totalTe = recent.reduce((sum, cycle) => sum + cycle.te, 0)
  return totalTi > 0 ? totalTe / totalTi : null
}

function getLatestBreathStart(samples: Sample[]): number | null {
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    if (samples[index].breathTrigger) return samples[index].time
    if (index > 0 && samples[index - 1].phase === 'expiration' && samples[index].phase === 'inspiration') {
      return samples[index].time
    }
  }
  return null
}

function calculateEndTidalCO2(samples: Sample[]): number | null {
  if (samples.length < 2) return null
  const terminalFlowThreshold = 0.5
  const latestTime = samples[samples.length - 1].time
  let lastExpiratoryFlowTime: number | null = null
  let terminalCandidate: number | null = null
  let lastCompleted: number | null = null

  for (let index = 0; index < samples.length; index += 1) {
    const current = samples[index]
    const previous = index > 0 ? samples[index - 1] : null

    if (current.phase === 'expiration' && current.flow < -terminalFlowThreshold) {
      lastExpiratoryFlowTime = current.time
      terminalCandidate = current.co2
    }

    // EtCO2 is the terminal expired concentration: latch the value at the point
    // expiratory flow has effectively reached zero, not the maximum CO2 seen in
    // an arbitrarily long expiratory/apnoeic interval.
    if (
      previous &&
      previous.phase === 'expiration' &&
      current.phase === 'expiration' &&
      previous.flow < -terminalFlowThreshold &&
      current.flow >= -terminalFlowThreshold &&
      terminalCandidate != null
    ) {
      lastCompleted = terminalCandidate
    }

    // If the next inspiration starts before flow crosses the near-zero threshold,
    // the final actively expired sample is still the end-tidal sample.
    if (previous && previous.phase === 'expiration' && current.phase === 'inspiration' && terminalCandidate != null) {
      lastCompleted = terminalCandidate
      terminalCandidate = null
    }
    if (previous && previous.phase === 'inspiration' && current.phase === 'expiration') terminalCandidate = null
  }

  if (lastExpiratoryFlowTime == null || latestTime - lastExpiratoryFlowTime > 20) return null
  return lastCompleted
}

function calculateEventMeasurements(samples: Sample[], apneaTime: number, latestTime: number): EventMeasurements {
  if (samples.length < 2) return { peakPressure: 0, tidalVolume: 0, respiratoryRate: 0 }

  const inspirationEnds: number[] = []
  const completedPeaks: Array<{ time: number; peak: number }> = []
  const completedExpirations: Array<{ time: number; volume: number }> = []
  let inspirationPeak = samples[0].pressure
  let expirationActive = false
  let expirationVolumeLitres = 0
  let expirationStartTime = 0
  let sawExpiratoryFlow = false

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]
    const current = samples[index]
    const dt = Math.max(0, current.time - previous.time)

    if (current.phase === 'inspiration') {
      inspirationPeak = previous.phase === 'expiration'
        ? current.pressure
        : Math.max(inspirationPeak, current.pressure)
    }

    if (previous.phase === 'inspiration' && current.phase === 'expiration') {
      inspirationEnds.push(current.time)
      completedPeaks.push({ time: current.time, peak: Math.max(inspirationPeak, previous.pressure) })
      inspirationPeak = current.pressure
      expirationActive = true
      expirationVolumeLitres = 0
      expirationStartTime = current.time
      sawExpiratoryFlow = false
    }

    if (expirationActive && current.phase === 'expiration') {
      const expiredFlow = Math.max(0, -current.flow) / 60
      if (expiredFlow > 0.0005) sawExpiratoryFlow = true
      expirationVolumeLitres += expiredFlow * dt

      const elapsedExpiration = current.time - expirationStartTime
      const flowSettled = sawExpiratoryFlow && elapsedExpiration > 0.15 && Math.abs(current.flow) <= 0.5
      if (flowSettled) {
        completedExpirations.push({ time: current.time, volume: expirationVolumeLitres * 1000 })
        expirationActive = false
      }
    }

    if (expirationActive && previous.phase === 'expiration' && current.phase === 'inspiration') {
      completedExpirations.push({ time: current.time, volume: expirationVolumeLitres * 1000 })
      expirationActive = false
    }
  }

  const firstTime = samples[0].time
  const rateWindowStart = Math.max(firstTime, latestTime - 60)
  const completedInspirationsInWindow = inspirationEnds.filter((time) => time >= rateWindowStart && time <= latestTime).length
  const observedRateDuration = Math.max(1, latestTime - rateWindowStart)
  const respiratoryRate = completedInspirationsInWindow * (60 / observedRateDuration)

  const latestExpiredVolume = completedExpirations[completedExpirations.length - 1]?.volume ?? 0
  const latestCompletedPeak = completedPeaks[completedPeaks.length - 1]?.peak ?? 0
  const latestBreathStart = getLatestBreathStart(samples)
  const apneaActive = latestBreathStart == null
    ? latestTime - firstTime >= apneaTime
    : latestTime - latestBreathStart >= apneaTime

  let peakPressure = latestCompletedPeak
  if (apneaActive) {
    const pressureWindow = samples.filter((sample) => sample.time >= latestTime - apneaTime)
    peakPressure = pressureWindow.length
      ? Math.max(...pressureWindow.map((sample) => sample.pressure))
      : samples[samples.length - 1].pressure
  }

  return {
    peakPressure,
    tidalVolume: latestExpiredVolume,
    respiratoryRate,
  }
}

function isHighPressureAlarmActive(samples: Sample[], limit: number): boolean {
  const starts: number[] = []
  for (let index = 0; index < samples.length; index += 1) {
    if (samples[index].breathTrigger) starts.push(index)
  }
  if (!starts.length) return false

  const latestStart = starts[starts.length - 1]
  const previousStart = starts.length > 1 ? starts[starts.length - 2] : -1
  const latestPeak = Math.max(...samples.slice(latestStart).map((sample) => sample.pressure))
  const latestCompleted = samples.slice(latestStart + 1).some((sample) => sample.phase === 'expiration')

  if (latestCompleted) return latestPeak > limit
  if (latestPeak > limit) return true
  if (previousStart >= 0) {
    const previousPeak = Math.max(...samples.slice(previousStart, latestStart).map((sample) => sample.pressure))
    return previousPeak > limit
  }
  return false
}

export default function App() {
  const [ventilator, setVentilator] = useState<VentilatorSettings>(() => loadStoredSettings(VENTILATOR_STORAGE_KEY, initialVentilator))
  const [patient, setPatient] = useState<PatientSettings>(() => {
    const stored = loadStoredSettings(PATIENT_STORAGE_KEY, initialPatient)
    // v0.34 shipped 30% rise / 35% release as the default. Migrate that exact
    // profile once to the corrected sinusoidal normal default so existing local
    // settings do not preserve the transient flat-topped model after upgrade.
    if (stored.effortRisePercent === 30 && stored.effortRelaxationPercent === 35) {
      return { ...stored, effortRisePercent: 50, effortRelaxationPercent: 50 }
    }
    return stored
  })
  const [patientTransitionSeconds, setPatientTransitionSeconds] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    const stored = Number(window.localStorage.getItem(PATIENT_TRANSITION_STORAGE_KEY) ?? 0)
    return [0, 5, 10, 30, 60].includes(stored) ? stored : 0
  })
  const [alarmLimits, setAlarmLimits] = useState<AlarmLimits>(() => {
    const stored = loadStoredSettings(ALARM_STORAGE_KEY, initialAlarmLimits)
    const co2Min = Math.max(0, Math.min(100, stored.co2Min))
    const co2Max = Math.max(co2Min, Math.min(100, stored.co2Max))
    const minuteVentilationMin = Math.max(0, Math.min(20, stored.minuteVentilationMin))
    const minuteVentilationMax = Math.max(minuteVentilationMin, Math.min(20, stored.minuteVentilationMax))
    const tidalVolumeMin = Math.max(0, Math.min(1000, stored.tidalVolumeMin))
    const tidalVolumeMax = Math.max(tidalVolumeMin, Math.min(1000, stored.tidalVolumeMax))
    const respiratoryRateMin = Math.max(0, Math.min(40, stored.respiratoryRateMin))
    const respiratoryRateMax = Math.max(respiratoryRateMin, Math.min(40, stored.respiratoryRateMax))
    return {
      apneaTime: Math.max(15, Math.min(120, stored.apneaTime)),
      peakPressure: Math.max(0, Math.min(60, stored.peakPressure)),
      co2Min,
      co2Max,
      minuteVentilationMin,
      minuteVentilationMax,
      tidalVolumeMin,
      tidalVolumeMax,
      respiratoryRateMin,
      respiratoryRateMax,
    }
  })
  const [waveformDisplay, setWaveformDisplay] = useState<WaveformDisplaySettings>(() => {
    const stored = loadStoredSettings(WAVEFORM_STORAGE_KEY, initialWaveformDisplay)
    const valid = (value: unknown): value is OptionalWaveform =>
      value === 'volume' || value === 'co2' || value === 'oesophagealPressure'
    return {
      third: valid(stored.third) ? stored.third : 'volume',
      fourth: valid(stored.fourth) ? stored.fourth : null,
    }
  })
  const [scenarioMediaIds, setScenarioMediaIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const parsed = JSON.parse(window.localStorage.getItem(SCENARIO_MEDIA_STORAGE_KEY) ?? '[]')
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string' && id.length > 0) : []
    } catch {
      return []
    }
  })
  const [alarmDialogOpen, setAlarmDialogOpen] = useState(false)
  const [measurementsOpen, setMeasurementsOpen] = useState(false)
  const [showPatientEffort, setShowPatientEffort] = useState(() => typeof window !== 'undefined' && window.localStorage.getItem(SHOW_PATIENT_EFFORT_STORAGE_KEY) === 'true')
  const [oxygenBoost, setOxygenBoost] = useState(false)
  const [oxygenBoostSecondsRemaining, setOxygenBoostSecondsRemaining] = useState(0)
  const [nebuliser, setNebuliser] = useState(false)
  const [alarmSilenced, setAlarmSilenced] = useState(false)
  const [alarmClock, setAlarmClock] = useState(() => Date.now())
  const [alarmLifecycle, setAlarmLifecycle] = useState<Record<string, { activeSince: number | null; resolvedAt: number | null; acknowledged: boolean }>>({})
  const [frozen, setFrozen] = useState(false)
  const [frozenSamples, setFrozenSamples] = useState<Sample[] | null>(null)
  const [traceCursor, setTraceCursor] = useState(Math.floor(WINDOW_SAMPLES * 0.7))
  const [inspiratoryHoldRequestTime, setInspiratoryHoldRequestTime] = useState<number | null>(null)
  const [inspiratoryHoldReleaseTime, setInspiratoryHoldReleaseTime] = useState<number | null>(null)
  const [expiratoryHoldRequestTime, setExpiratoryHoldRequestTime] = useState<number | null>(null)
  const [expiratoryHoldReleaseTime, setExpiratoryHoldReleaseTime] = useState<number | null>(null)
  const [alarmOnsets, setAlarmOnsets] = useState<Record<string, number | null>>({
    apnea: null,
    pressure: null,
    co2Low: null,
    co2High: null,
    minuteVentilationLow: null,
    minuteVentilationHigh: null,
    tidalVolumeLow: null,
    tidalVolumeHigh: null,
    respiratoryRateLow: null,
    respiratoryRateHigh: null,
    oxygenFailure: null,
  })
  const [diagnosticCopied, setDiagnosticCopied] = useState(false)
  const [candidateAlarmLevelForSession, setCandidateAlarmLevelForSession] = useState<CandidateAlarmLevel>(null)
  const scenarioClockOriginRef = useRef(WINDOW_SAMPLES * DT)
  const previousApneaAlarmActiveRef = useRef(false)

  const teachingSession = useTeachingSession({
    patient,
    ventilator,
    alarmLimits,
    patientTransitionSeconds,
    setPatient,
    setVentilator,
    setAlarmLimits,
    setPatientTransitionSeconds,
    candidateAlarmLevel: candidateAlarmLevelForSession,
  })

  const candidateWaveformOptions = useMemo(
    () => teachingSession.candidateOesophagealPressureAllowed
      ? waveformOptions
      : waveformOptions.filter((option) => option.value !== 'oesophagealPressure'),
    [teachingSession.candidateOesophagealPressureAllowed],
  )

  const currentInstructorScenario: InstructorScenarioSnapshot = {
    ventilator,
    patient,
    alarmLimits,
    patientTransitionSeconds,
    waveformDisplay,
    mediaIds: scenarioMediaIds,
  }

  const loadInstructorScenario = (scenario: InstructorScenarioSnapshot) => {
    scenarioClockOriginRef.current = simulationTimeRef.current
    setVentilator({ ...scenario.ventilator })
    setPatient({ ...scenario.patient })
    setAlarmLimits({ ...scenario.alarmLimits })
    setPatientTransitionSeconds(scenario.patientTransitionSeconds)
    setWaveformDisplay({ ...scenario.waveformDisplay })
    setScenarioMediaIds([...(scenario.mediaIds ?? [])])
  }

  const startInstructorSession = async (scenario?: InstructorScenarioSnapshot) => {
    if (scenario) {
      loadInstructorScenario(scenario)
      await teachingSession.startInstructor({
        patient: scenario.patient,
        ventilator: scenario.ventilator,
        alarmLimits: scenario.alarmLimits,
        patientTransitionSeconds: scenario.patientTransitionSeconds,
      })
      return
    }
    await teachingSession.startInstructor()
  }

  useEffect(() => {
    if (teachingSession.candidateOesophagealPressureAllowed) return
    setWaveformDisplay((current) => {
      const nextThird: OptionalWaveform = current.third === 'oesophagealPressure' ? 'volume' : current.third
      let nextFourth = current.fourth === 'oesophagealPressure' ? null : current.fourth
      if (nextFourth === nextThird) nextFourth = nextThird === 'volume' ? 'co2' : 'volume'
      if (nextThird === current.third && nextFourth === current.fourth) return current
      return { third: nextThird, fourth: nextFourth }
    })
  }, [teachingSession.candidateOesophagealPressureAllowed])

  const simulationStateRef = useRef(createSimulationState())
  const simulationTimeRef = useRef(0)
  const effectivePatientRef = useRef<PatientSettings>({ ...patient })
  const patientTransitionRef = useRef<{ from: PatientSettings; to: PatientSettings; start: number; duration: number } | null>(null)
  const alarmSilenceTimeoutRef = useRef<number | null>(null)
  const oxygenBoostDeadlineRef = useRef<number | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const alarmHistoryRef = useRef<Record<string, { everTriggered: boolean; triggerCount: number; firstTriggeredAt: number | null; lastTriggeredAt: number | null }>>({})
  const [timeline, setTimeline] = useState<Sample[]>(() => {
    const initialSamples = advanceSimulation(
      simulationStateRef.current,
      ventilator,
      patient,
      0,
      WINDOW_SAMPLES,
      DT,
    )
    simulationTimeRef.current = WINDOW_SAMPLES * DT
    return initialSamples
  })

  useEffect(() => {
    window.localStorage.setItem(VENTILATOR_STORAGE_KEY, JSON.stringify(ventilator))
  }, [ventilator])

  useEffect(() => {
    window.localStorage.setItem(PATIENT_STORAGE_KEY, JSON.stringify(patient))
  }, [patient])

  useEffect(() => {
    window.localStorage.setItem(PATIENT_TRANSITION_STORAGE_KEY, String(patientTransitionSeconds))
  }, [patientTransitionSeconds])

  useEffect(() => {
    if (patientTransitionSeconds <= 0) {
      effectivePatientRef.current = { ...patient }
      patientTransitionRef.current = null
      return
    }
    patientTransitionRef.current = {
      from: { ...effectivePatientRef.current },
      to: { ...patient },
      start: simulationTimeRef.current,
      duration: patientTransitionSeconds,
    }
  }, [patient, patientTransitionSeconds])

  useEffect(() => {
    window.localStorage.setItem(ALARM_STORAGE_KEY, JSON.stringify(alarmLimits))
  }, [alarmLimits])

  useEffect(() => {
    if (teachingSession.candidateAlarmsLocked) setAlarmDialogOpen(false)
  }, [teachingSession.candidateAlarmsLocked])

  useEffect(() => {
    window.localStorage.setItem(WAVEFORM_STORAGE_KEY, JSON.stringify(waveformDisplay))
  }, [waveformDisplay])

  useEffect(() => {
    window.localStorage.setItem(SCENARIO_MEDIA_STORAGE_KEY, JSON.stringify(scenarioMediaIds))
  }, [scenarioMediaIds])

  useEffect(() => {
    window.localStorage.setItem(SHOW_PATIENT_EFFORT_STORAGE_KEY, String(showPatientEffort))
  }, [showPatientEffort])

  useEffect(() => {
    if (!oxygenBoost) return

    const updateCountdown = () => {
      const deadline = oxygenBoostDeadlineRef.current
      if (deadline == null) return
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      setOxygenBoostSecondsRemaining(remaining)
      if (remaining <= 0) {
        oxygenBoostDeadlineRef.current = null
        setOxygenBoost(false)
      }
    }

    updateCountdown()
    const interval = window.setInterval(updateCountdown, 250)
    return () => window.clearInterval(interval)
  }, [oxygenBoost])

  const effectiveVentilator = useMemo(() => ({ ...ventilator, fio2: oxygenBoost ? 1 : ventilator.fio2 }), [ventilator, oxygenBoost])
  const holdOptions = useMemo(() => ({
    inspiratoryHoldRequestTime,
    inspiratoryHoldReleaseTime,
    expiratoryHoldRequestTime,
    expiratoryHoldReleaseTime,
  }), [inspiratoryHoldRequestTime, inspiratoryHoldReleaseTime, expiratoryHoldRequestTime, expiratoryHoldReleaseTime])

  useEffect(() => {
    if (frozen) return
    const timer = window.setInterval(() => {
      const startTime = simulationTimeRef.current
      const transition = patientTransitionRef.current
      let simulationPatient = patient
      if (transition) {
        const progress = (startTime - transition.start) / Math.max(transition.duration, 0.001)
        simulationPatient = interpolatePatientSettings(transition.from, transition.to, progress)
        effectivePatientRef.current = simulationPatient
        if (progress >= 1) {
          simulationPatient = { ...transition.to }
          effectivePatientRef.current = simulationPatient
          patientTransitionRef.current = null
        }
      } else {
        effectivePatientRef.current = { ...patient }
      }
      const nextSamples = advanceSimulation(
        simulationStateRef.current,
        effectiveVentilator,
        simulationPatient,
        startTime,
        TICK_STEPS,
        DT,
        holdOptions,
      )
      simulationTimeRef.current = startTime + TICK_STEPS * DT
      setTimeline((current) => {
        const combined = [...current, ...nextSamples]
        return combined.length > HISTORY_SAMPLES ? combined.slice(-HISTORY_SAMPLES) : combined
      })
    }, 100)
    return () => window.clearInterval(timer)
  }, [effectiveVentilator, patient, frozen, holdOptions])

  const movingSamples = useMemo(() => timeline.slice(-WINDOW_SAMPLES), [timeline])
  const samples = frozen && frozenSamples ? frozenSamples : movingSamples
  const measurementSamples = useMemo(() => timeline.slice(-MINUTE_SAMPLES), [timeline])
  const measures = useMemo(() => calculateMeasurements(measurementSamples, effectiveVentilator), [measurementSamples, effectiveVentilator])
  const physiologyMeasurements = useMemo(() => calculatePhysiologicalMeasurements(measurementSamples, effectiveVentilator), [measurementSamples, effectiveVentilator])
  const measuredIERatio = useMemo(() => calculateMeasuredIERatio(measurementSamples), [measurementSamples])
  const endTidalCO2 = useMemo(() => calculateEndTidalCO2(measurementSamples), [measurementSamples])
  const selectedSample = samples[Math.min(traceCursor, Math.max(0, samples.length - 1))]
  const latestSample = movingSamples[movingSamples.length - 1]
  const patientEffortVisible = teachingSession.role === 'candidate' ? teachingSession.candidatePatientEffortVisible : showPatientEffort
  const activeMode = latestSample?.mode ?? ventilator.mode
  const currentSimulationTime = latestSample?.time ?? simulationTimeRef.current
  const scenarioElapsedTime = Math.max(0, currentSimulationTime - scenarioClockOriginRef.current)
  const eventMeasures = useMemo(
    () => calculateEventMeasurements(measurementSamples, alarmLimits.apneaTime, currentSimulationTime),
    [measurementSamples, alarmLimits.apneaTime, currentSimulationTime],
  )
  let latestNonZeroVolumeTime: number | null = null
  for (let index = measurementSamples.length - 1; index >= 0; index -= 1) {
    const sample = measurementSamples[index]
    if (sample.time < scenarioClockOriginRef.current) break
    if (Math.abs(sample.volume) > 1) {
      latestNonZeroVolumeTime = sample.time
      break
    }
  }
  const volumeZeroDuration = latestNonZeroVolumeTime == null
    ? scenarioElapsedTime
    : Math.max(0, currentSimulationTime - latestNonZeroVolumeTime)
  const tidalVolumeDisplayAvailable = volumeZeroDuration <= 10
  const inspiratoryHoldPressed = inspiratoryHoldRequestTime != null && inspiratoryHoldReleaseTime == null
  const expiratoryHoldPressed = expiratoryHoldRequestTime != null && expiratoryHoldReleaseTime == null
  const ieRatio = Math.max(0, 60 / Math.max(ventilator.rate, 1) / Math.max(ventilator.inspiratoryTime, 0.2) - 1)
  const conventionalTimedMode = activeMode !== 'PSV' && activeMode !== 'APRV' && activeMode !== 'BIPAP'
  const volumeMandatoryMode = activeMode === 'VC-AC' || activeMode === 'SIMV-VC'
  const simvMode = activeMode === 'SIMV-VC' || activeMode === 'SIMV-PC'
  const manualHoldAvailable = activeMode !== 'PSV' && activeMode !== 'APRV' && activeMode !== 'BIPAP'

  const latestBreathStart = useMemo(() => getLatestBreathStart(timeline), [timeline])
  const apneaAlarmActive = latestBreathStart == null
    ? currentSimulationTime >= alarmLimits.apneaTime
    : currentSimulationTime - latestBreathStart >= alarmLimits.apneaTime
  const pressureAlarmActive = useMemo(
    () => isHighPressureAlarmActive(timeline, alarmLimits.peakPressure),
    [timeline, alarmLimits.peakPressure],
  )
  const minuteVentilationAvailable = measures.minuteVentilation > 0 || currentSimulationTime >= 5
  const minuteVentilationLowAlarmActive = minuteVentilationAvailable && measures.minuteVentilation < alarmLimits.minuteVentilationMin
  const minuteVentilationHighAlarmActive = minuteVentilationAvailable && measures.minuteVentilation > alarmLimits.minuteVentilationMax
  const tidalVolumeAlarmValue = eventMeasures.tidalVolume
  const tidalVolumeAvailable = tidalVolumeDisplayAvailable && tidalVolumeAlarmValue > 0
  const tidalVolumeLowAlarmActive = tidalVolumeAvailable && tidalVolumeAlarmValue < alarmLimits.tidalVolumeMin
  const tidalVolumeHighAlarmActive = tidalVolumeAvailable && tidalVolumeAlarmValue > alarmLimits.tidalVolumeMax
  const respiratoryRateAvailable = eventMeasures.respiratoryRate > 0 || currentSimulationTime >= 5
  const respiratoryRateLowAlarmActive = respiratoryRateAvailable && eventMeasures.respiratoryRate < alarmLimits.respiratoryRateMin
  const respiratoryRateHighAlarmActive = respiratoryRateAvailable && eventMeasures.respiratoryRate > alarmLimits.respiratoryRateMax
  // Reserved for upcoming scenario/instructor controls.
  const oxygenFailureActive = false

  // Once apnoea is established it is the dominant ventilatory alarm. Secondary
  // pressure/volume/rate/minute-ventilation alarms are suppressed until breaths
  // resume; oxygen failure remains independent and must still be annunciated.
  const suppressSecondaryAlarmsForApnea = apneaAlarmActive
  const alarmConditions = {
    apnea: apneaAlarmActive,
    pressure: !suppressSecondaryAlarmsForApnea && pressureAlarmActive,
    minuteVentilationLow: !suppressSecondaryAlarmsForApnea && minuteVentilationLowAlarmActive,
    minuteVentilationHigh: !suppressSecondaryAlarmsForApnea && minuteVentilationHighAlarmActive,
    tidalVolumeLow: !suppressSecondaryAlarmsForApnea && tidalVolumeLowAlarmActive,
    tidalVolumeHigh: !suppressSecondaryAlarmsForApnea && tidalVolumeHighAlarmActive,
    respiratoryRateLow: !suppressSecondaryAlarmsForApnea && respiratoryRateLowAlarmActive,
    respiratoryRateHigh: !suppressSecondaryAlarmsForApnea && respiratoryRateHighAlarmActive,
    oxygenFailure: oxygenFailureActive,
  }

  // Alarm annunciation is episode-scoped. When a breath resolves apnoea, do not
  // resurrect alarm-lifecycle entries that were resolved/suppressed during the
  // apnoeic episode. Clear those stale annunciations immediately, then let the
  // ordinary alarm evaluator below add back only conditions that are genuinely
  // active in the recovered ventilation state. O2 failure is deliberately kept.
  const apneaJustResolved = previousApneaAlarmActiveRef.current && !apneaAlarmActive
  useEffect(() => {
    const wasActive = previousApneaAlarmActiveRef.current
    previousApneaAlarmActiveRef.current = apneaAlarmActive
    if (!wasActive || apneaAlarmActive) return

    const staleApneaEpisodeKeys = new Set([
      'apnea',
      'pressure',
      'co2Low',
      'co2High',
      'minuteVentilationLow',
      'minuteVentilationHigh',
      'tidalVolumeLow',
      'tidalVolumeHigh',
      'respiratoryRateLow',
      'respiratoryRateHigh',
    ])

    setAlarmLifecycle((current) => {
      let changed = false
      const next = { ...current }
      for (const key of staleApneaEpisodeKeys) {
        if (key in next) {
          delete next[key]
          changed = true
        }
      }
      return changed ? next : current
    })

    setAlarmOnsets((current) => {
      let changed = false
      const next = { ...current }
      for (const key of staleApneaEpisodeKeys) {
        if (next[key] != null) {
          next[key] = null
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [apneaAlarmActive])

  useEffect(() => {
    const timer = window.setInterval(() => setAlarmClock(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const now = Date.now()
    setAlarmOnsets((current) => {
      let changed = false
      const next = { ...current }
      for (const [key, active] of Object.entries(alarmConditions)) {
        if (active && next[key] == null) {
          next[key] = currentSimulationTime
          changed = true
          const previousHistory = alarmHistoryRef.current[key]
          alarmHistoryRef.current[key] = {
            everTriggered: true,
            triggerCount: (previousHistory?.triggerCount ?? 0) + 1,
            firstTriggeredAt: previousHistory?.firstTriggeredAt ?? currentSimulationTime,
            lastTriggeredAt: currentSimulationTime,
          }
        }
        if (!active && next[key] != null) { next[key] = null; changed = true }
      }
      return changed ? next : current
    })

    setAlarmLifecycle((current) => {
      let changed = false
      const next = { ...current }
      for (const [key, active] of Object.entries(alarmConditions)) {
        const entry = current[key] ?? { activeSince: null, resolvedAt: null, acknowledged: false }
        if (active) {
          if (entry.activeSince == null || entry.resolvedAt != null) {
            next[key] = { activeSince: now, resolvedAt: null, acknowledged: false }
            changed = true
          }
        } else if (entry.activeSince != null && entry.resolvedAt == null) {
          next[key] = { ...entry, resolvedAt: now }
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [
    apneaAlarmActive,
    pressureAlarmActive,
    minuteVentilationLowAlarmActive,
    minuteVentilationHighAlarmActive,
    tidalVolumeLowAlarmActive,
    tidalVolumeHighAlarmActive,
    respiratoryRateLowAlarmActive,
    respiratoryRateHighAlarmActive,
    oxygenFailureActive,
    currentSimulationTime,
  ])

  useEffect(() => {
    setAlarmLifecycle((current) => {
      let changed = false
      const next = { ...current }
      for (const [key, entry] of Object.entries(current)) {
        if (entry.resolvedAt != null && alarmClock - entry.resolvedAt >= 120000) {
          delete next[key]
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [alarmClock])

  const criticalAlarmKeys = ['pressure', 'apnea', 'oxygenFailure'] as const
  const alarmVisibleDuringApnea = (key: string) => !apneaAlarmActive || key === 'apnea' || key === 'oxygenFailure'
  const activeAlarmKeys = Object.entries(alarmConditions).filter(([, active]) => active).map(([key]) => key)
  const resolvedYellowKeys = Object.entries(alarmLifecycle)
    .filter(([key, entry]) => !apneaJustResolved && alarmVisibleDuringApnea(key) && entry.resolvedAt != null && alarmClock - entry.resolvedAt < 10000)
    .map(([key]) => key)
  const greyAlarmKeys = Object.entries(alarmLifecycle)
    .filter(([key, entry]) => !apneaJustResolved && alarmVisibleDuringApnea(key) && entry.resolvedAt != null && alarmClock - entry.resolvedAt >= 10000 && alarmClock - entry.resolvedAt < 120000 && !entry.acknowledged)
    .map(([key]) => key)
  const criticalEscalated = criticalAlarmKeys.some((key) => {
    const entry = alarmLifecycle[key]
    return Boolean(alarmConditions[key] && entry?.activeSince != null && alarmClock - entry.activeSince >= 15000)
  })
  const audibleAlarmLevel: CandidateAlarmLevel = activeAlarmKeys.length || resolvedYellowKeys.length
    ? (criticalEscalated ? 'red' : 'yellow')
    : null
  const alarmLevel: 'red' | 'yellow' | 'grey' | null = audibleAlarmLevel ?? (greyAlarmKeys.length ? 'grey' : null)

  useEffect(() => {
    setCandidateAlarmLevelForSession(audibleAlarmLevel)
  }, [audibleAlarmLevel])
  const visibleAlarmKeys = new Set([...activeAlarmKeys, ...resolvedYellowKeys, ...greyAlarmKeys])
  const alarmLabels = [
    visibleAlarmKeys.has('pressure') ? 'HIGH PRESSURE' : null,
    visibleAlarmKeys.has('apnea') ? 'APNOEA' : null,
    visibleAlarmKeys.has('minuteVentilationLow') ? 'LOW MINUTE VENTILATION' : null,
    visibleAlarmKeys.has('minuteVentilationHigh') ? 'HIGH MINUTE VENTILATION' : null,
    visibleAlarmKeys.has('tidalVolumeLow') ? 'LOW TIDAL VOLUME' : null,
    visibleAlarmKeys.has('tidalVolumeHigh') ? 'HIGH TIDAL VOLUME' : null,
    visibleAlarmKeys.has('respiratoryRateLow') ? 'LOW RESPIRATORY RATE' : null,
    visibleAlarmKeys.has('respiratoryRateHigh') ? 'HIGH RESPIRATORY RATE' : null,
    visibleAlarmKeys.has('oxygenFailure') ? 'OXYGEN FAILURE' : null,
  ].filter((value): value is string => value != null)

  useEffect(() => {
    if (!audibleAlarmLevel || alarmSilenced || frozen || teachingSession.candidateAlarmsSilent) return
    const beep = () => {
      try {
        const AudioContextConstructor = window.AudioContext
        if (!AudioContextConstructor) return
        const context = audioContextRef.current ?? new AudioContextConstructor()
        audioContextRef.current = context
        if (context.state === 'suspended') void context.resume()
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        oscillator.type = 'square'
        oscillator.frequency.value = audibleAlarmLevel === 'red' ? 1040 : 820
        gain.gain.setValueAtTime(0.0001, context.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.055, context.currentTime + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.12)
        oscillator.connect(gain)
        gain.connect(context.destination)
        oscillator.start()
        oscillator.stop(context.currentTime + 0.13)
      } catch {
        // Browser audio may remain blocked until the page has received a user gesture.
      }
    }
    beep()
    const interval = window.setInterval(beep, audibleAlarmLevel === 'red' ? 700 : 1300)
    return () => window.clearInterval(interval)
  }, [audibleAlarmLevel, alarmSilenced, frozen, teachingSession.candidateAlarmsSilent])

  useEffect(() => () => {
    if (alarmSilenceTimeoutRef.current != null) window.clearTimeout(alarmSilenceTimeoutRef.current)
    void audioContextRef.current?.close()
  }, [])

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

  useEffect(() => {
    if (!frozen || frozenSamples) return
    setFrozenSamples(movingSamples)
    setTraceCursor(Math.min(Math.floor(movingSamples.length * 0.7), Math.max(0, movingSamples.length - 1)))
  }, [frozen, frozenSamples, movingSamples])

  const toggleFreeze = () => {
    if (!frozen) {
      setFrozenSamples(movingSamples)
      setTraceCursor(Math.min(Math.floor(movingSamples.length * 0.7), Math.max(0, movingSamples.length - 1)))
      setFrozen(true)
    } else {
      setFrozen(false)
      setFrozenSamples(null)
    }
  }

  const beginInspiratoryHold = () => {
    if (frozen || !manualHoldAvailable || inspiratoryHoldPressed) return
    setExpiratoryHoldRequestTime(null)
    setExpiratoryHoldReleaseTime(null)
    setInspiratoryHoldRequestTime(currentSimulationTime)
    setInspiratoryHoldReleaseTime(null)
  }

  const releaseInspiratoryHold = () => {
    if (!inspiratoryHoldPressed) return
    setInspiratoryHoldReleaseTime(currentSimulationTime)
    setFrozenSamples(movingSamples)
    setTraceCursor(Math.min(Math.floor(movingSamples.length * 0.7), Math.max(0, movingSamples.length - 1)))
    setFrozen(true)
  }

  const beginExpiratoryHold = () => {
    if (frozen || activeMode === 'APRV' || expiratoryHoldPressed) return
    setInspiratoryHoldRequestTime(null)
    setInspiratoryHoldReleaseTime(null)
    setExpiratoryHoldRequestTime(currentSimulationTime)
    setExpiratoryHoldReleaseTime(null)
  }

  const releaseExpiratoryHold = () => {
    if (!expiratoryHoldPressed) return
    setExpiratoryHoldReleaseTime(currentSimulationTime)
    setFrozenSamples(movingSamples)
    setTraceCursor(Math.min(Math.floor(movingSamples.length * 0.7), Math.max(0, movingSamples.length - 1)))
    setFrozen(true)
  }

  const silenceAlarm = () => {
    setAlarmLifecycle((current) => {
      const next = { ...current }
      for (const [key, entry] of Object.entries(current)) {
        if (entry.resolvedAt != null) delete next[key]
        else if (alarmConditions[key as keyof typeof alarmConditions]) next[key] = { ...entry, acknowledged: true }
      }
      return next
    })
    setAlarmSilenced(true)
    if (alarmSilenceTimeoutRef.current != null) window.clearTimeout(alarmSilenceTimeoutRef.current)
    alarmSilenceTimeoutRef.current = window.setTimeout(() => {
      setAlarmSilenced(false)
      alarmSilenceTimeoutRef.current = null
    }, 120000)
  }

  const copyDiagnostics = async () => {
    const historyFor = (key: string) => alarmHistoryRef.current[key] ?? { everTriggered: false, triggerCount: 0, firstTriggeredAt: null, lastTriggeredAt: null }
    const finiteVolumes = samples.map((sample) => sample.volume).filter(Number.isFinite)
    const waveformVolumeMin = finiteVolumes.length ? Math.min(...finiteVolumes) : null
    const waveformVolumeMax = finiteVolumes.length ? Math.max(...finiteVolumes) : null
    const alarmEvaluations = [
      { key: 'pressure', label: 'Peak pressure', priority: 'critical', value: eventMeasures.peakPressure, unit: 'cmH2O', limits: { high: alarmLimits.peakPressure }, active: pressureAlarmActive, history: historyFor('pressure') },
      { key: 'minuteVentilation', label: 'Minute ventilation', priority: 'non-critical', value: measures.minuteVentilation, unit: 'L/min', limits: { low: alarmLimits.minuteVentilationMin, high: alarmLimits.minuteVentilationMax }, active: minuteVentilationLowAlarmActive || minuteVentilationHighAlarmActive, lowActive: minuteVentilationLowAlarmActive, highActive: minuteVentilationHighAlarmActive, history: { low: historyFor('minuteVentilationLow'), high: historyFor('minuteVentilationHigh') } },
      { key: 'tidalVolume', label: 'Expired tidal volume', priority: 'non-critical', value: tidalVolumeAlarmValue, unit: 'mL', limits: { low: alarmLimits.tidalVolumeMin, high: alarmLimits.tidalVolumeMax }, active: tidalVolumeLowAlarmActive || tidalVolumeHighAlarmActive, lowActive: tidalVolumeLowAlarmActive, highActive: tidalVolumeHighAlarmActive, history: { low: historyFor('tidalVolumeLow'), high: historyFor('tidalVolumeHigh') } },
      { key: 'respiratoryRate', label: 'Respiratory rate', priority: 'non-critical', value: eventMeasures.respiratoryRate, unit: '/min', limits: { low: alarmLimits.respiratoryRateMin, high: alarmLimits.respiratoryRateMax }, active: respiratoryRateLowAlarmActive || respiratoryRateHighAlarmActive, lowActive: respiratoryRateLowAlarmActive, highActive: respiratoryRateHighAlarmActive, history: { low: historyFor('respiratoryRateLow'), high: historyFor('respiratoryRateHigh') } },
      { key: 'apnea', label: 'Apnoea', priority: 'critical', value: latestBreathStart == null ? currentSimulationTime : currentSimulationTime - latestBreathStart, unit: 's since breath', limits: { high: alarmLimits.apneaTime }, active: apneaAlarmActive, history: historyFor('apnea') },
    ]
    const copied = await copyDiagnosticSnapshot({
      appVersion: '0.77.1',
      simulation: { time: currentSimulationTime, paused: frozen, activeMode, oxygenBoost, nebuliser, alarmSilenced },
      settings: {
        ventilator,
        effectiveVentilator,
        patientTarget: patient,
        patientEffective: effectivePatientRef.current,
        patientTransitionSeconds,
        patientTransition: patientTransitionRef.current,
        alarmLimits,
        waveformDisplay,
      },
      alarms: {
        apneaActive: apneaAlarmActive,
        highPressureActive: pressureAlarmActive,
        minuteVentilationLowActive: minuteVentilationLowAlarmActive,
        minuteVentilationHighActive: minuteVentilationHighAlarmActive,
        tidalVolumeLowActive: tidalVolumeLowAlarmActive,
        tidalVolumeHighActive: tidalVolumeHighAlarmActive,
        respiratoryRateLowActive: respiratoryRateLowAlarmActive,
        respiratoryRateHighActive: respiratoryRateHighAlarmActive,
        oxygenFailureActive,
        level: alarmLevel,
        labels: alarmLabels,
        onsets: alarmOnsets,
        evaluations: alarmEvaluations,
      },
      measurements: {
        peakPressureCmH2O: eventMeasures.peakPressure,
        expiredTidalVolumeMl: eventMeasures.tidalVolume,
        respiratoryRatePerMin: eventMeasures.respiratoryRate,
        peepCmH2O: measures.peep,
        meanPressureCmH2O: measures.meanPressure,
        minuteVentilationLMin: measures.minuteVentilation,
        endTidalCo2MmHg: endTidalCO2,
        spo2Percent: latestSample?.spo2 ?? null,
        measuredIERatio,
        totalPeepCmH2O: measures.totalPeep,
        autoPeepCmH2O: measures.autoPeep,
      },
      waveformSummary: {
        visibleVolumeMinMl: waveformVolumeMin,
        visibleVolumeMaxMl: waveformVolumeMax,
        tidalVolumeAlarmSourceMl: tidalVolumeAlarmValue,
        tidalVolumeAlarmLimitsMl: { low: alarmLimits.tidalVolumeMin, high: alarmLimits.tidalVolumeMax },
      },
      cursor: { index: traceCursor, selectedSample: selectedSample ?? null },
    }, samples, frozen && frozenSamples ? 'frozen' : 'live', DT)
    setDiagnosticCopied(copied)
    if (copied) window.setTimeout(() => setDiagnosticCopied(false), 1800)
  }

  const toggleOxygenBoost = () => {
    if (oxygenBoost) {
      oxygenBoostDeadlineRef.current = null
      setOxygenBoost(false)
      setOxygenBoostSecondsRemaining(0)
      return
    }

    oxygenBoostDeadlineRef.current = Date.now() + 60_000
    setOxygenBoostSecondsRemaining(60)
    setOxygenBoost(true)
  }

  const oxygenBoostTimer = `0:${String(oxygenBoostSecondsRemaining).padStart(2, '0')}`
  const resetVentilator = () => setVentilator({ ...initialVentilator })
  const resetPatient = () => setPatient({ ...initialPatient })
  const isHoldKey = (key: string) => key === ' ' || key === 'Enter'

  return (
    <main className="app-shell">
      <PhysiologyMeasurementsDialog open={measurementsOpen} measurements={physiologyMeasurements} onClose={() => setMeasurementsOpen(false)} />
      <header className="topbar">
        <div className="brand-block"><span className="brand-kicker">EDUVENT</span><h1>Mechanical Ventilation Simulator</h1></div>
        <div className="top-simulation-controls">
          <button
            className={`top-simulation-pause ${frozen ? 'paused' : ''}`}
            type="button"
            onClick={toggleFreeze}
            aria-label={frozen ? 'Resume whole simulation' : 'Pause whole simulation'}
            title={frozen ? 'Resume whole simulation' : 'Pause whole simulation'}
          >
            <PauseIcon paused={frozen} />
            <span>{frozen ? 'RESUME SIMULATION' : 'PAUSE SIMULATION'}</span>
          </button>
          <div className={`simulation-clock ${frozen ? 'paused' : ''}`} aria-label={`Simulation time ${formatSimulationClock(scenarioElapsedTime)}`}>
            <span>TIME</span>
            <strong>{formatSimulationClock(scenarioElapsedTime)}</strong>
          </div>
        </div>
        <div className="status-cluster">
          <span className={`status-dot ${frozen ? 'paused' : ''}`} />
          <span>{frozen ? 'SIMULATION PAUSED' : 'SIMULATION ACTIVE'}</span>
          <InstructorAccountControls
            role={teachingSession.role}
            currentScenario={currentInstructorScenario}
            onLoadScenario={loadInstructorScenario}
          />
          <CaseMediaPanel
            role={teachingSession.role}
            sessionId={teachingSession.session?.id ?? null}
            scenarioMediaIds={scenarioMediaIds}
            onScenarioMediaIdsChange={setScenarioMediaIds}
          />
          <button
            className={`top-diagnostic-button ${diagnosticCopied ? 'active copied' : ''}`}
            type="button"
            onClick={copyDiagnostics}
            title={diagnosticCopied ? 'Diagnostic JSON copied' : 'Copy settings and visible waveform as diagnostic JSON'}
            aria-label={diagnosticCopied ? 'Diagnostic JSON copied' : 'Copy diagnostic JSON'}
          ><DiagnosticIcon copied={diagnosticCopied} /></button>
          <span className="version">v0.77.1</span>
        </div>
      </header>

      <div className="workspace">
        <section className="ventilator-console">
          <div className="console-mode-bar">
            <VentilatorModeControl
              settings={ventilator}
              onChange={setVentilator}
              disabled={teachingSession.candidateVentilatorLocked}
            />
            <div className="action-bar console-top-actions">
            <div className={`oxygen-enrichment-control ${oxygenBoost ? 'active' : ''}`}>
              <button
                className={`hardware-button oxygen-button ${oxygenBoost ? 'active amber' : ''}`}
                onClick={toggleOxygenBoost}
                title={oxygenBoost ? 'O₂ enrichment active at 100% — press to cancel' : 'O₂ enrichment: 100% oxygen for 1 minute'}
                aria-label={oxygenBoost ? `O₂ enrichment active, ${oxygenBoostSecondsRemaining} seconds remaining. Press to cancel.` : 'Start O₂ enrichment at 100 percent for 1 minute'}
              >O₂</button>
              {oxygenBoost && <span className="oxygen-enrichment-timer" aria-live="polite">{oxygenBoostTimer}</span>}
            </div>
            <button className={`hardware-button icon-button ${nebuliser ? 'active blue' : ''}`} onClick={() => setNebuliser((v) => !v)} title="Nebuliser" aria-label="Nebuliser"><NebuliserIcon /></button>
            <button className={`hardware-button icon-button freeze-button ${frozen ? 'active' : ''}`} onClick={toggleFreeze} title={frozen ? 'Resume simulation' : 'Pause and freeze waveforms'} aria-label={frozen ? 'Resume simulation' : 'Pause simulation'}><PauseIcon paused={frozen} /></button>
            <button
              className={`hardware-button ${inspiratoryHoldPressed ? 'active' : ''}`}
              disabled={frozen || !manualHoldAvailable}
              title={!manualHoldAvailable ? 'Inspiratory hold is unavailable in this mode' : 'Press and hold for an inspiratory occlusion; release to freeze the trace'}
              onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); beginInspiratoryHold() }}
              onPointerUp={releaseInspiratoryHold}
              onPointerCancel={releaseInspiratoryHold}
              onKeyDown={(event) => { if (isHoldKey(event.key) && !event.repeat) { event.preventDefault(); beginInspiratoryHold() } }}
              onKeyUp={(event) => { if (isHoldKey(event.key)) { event.preventDefault(); releaseInspiratoryHold() } }}
            >Insp Hold</button>
            <button
              className={`hardware-button ${expiratoryHoldPressed ? 'active' : ''}`}
              disabled={frozen || activeMode === 'APRV' || activeMode === 'BIPAP'}
              title={(activeMode === 'APRV' || activeMode === 'BIPAP') ? 'Expiratory hold is unavailable in two-level pressure modes' : 'Press and hold for an end-expiratory occlusion; release to freeze the trace'}
              onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); beginExpiratoryHold() }}
              onPointerUp={releaseExpiratoryHold}
              onPointerCancel={releaseExpiratoryHold}
              onKeyDown={(event) => { if (isHoldKey(event.key) && !event.repeat) { event.preventDefault(); beginExpiratoryHold() } }}
              onKeyUp={(event) => { if (isHoldKey(event.key)) { event.preventDefault(); releaseExpiratoryHold() } }}
            >Exp Hold</button>
            <button className="hardware-button icon-button measurements-button" type="button" onClick={() => setMeasurementsOpen(true)} title="Physiological measurements" aria-label="Open physiological measurements"><MeasurementsInfoIcon /></button>
            <button className={`hardware-button icon-button alarm-button alarm-silence-bottom ${alarmSilenced ? 'active' : ''}`} onClick={silenceAlarm} title="Silence alarm sound for 2 minutes" aria-label="Silence alarm sound for 2 minutes"><AlarmSilenceIcon /></button>
            </div>
          </div>

          <div className="alarm-slot" aria-live="polite">
            {alarmLevel && (
              <div className={`alarm-banner ${alarmLevel}`} role="alert">
                <strong>{alarmLabels.join(' • ')}</strong>
                {(alarmSilenced || teachingSession.candidateAlarmsSilent) && <span>ALARM SILENT</span>}
              </div>
            )}
          </div>

          <div className="screen-body">
            {alarmDialogOpen && (
              <div className="alarm-dialog-backdrop" onClick={() => setAlarmDialogOpen(false)}>
                <section className="alarm-dialog" role="dialog" aria-modal="true" aria-label="Alarm limits" onClick={(event) => event.stopPropagation()}>
                  <div className="alarm-dialog-title"><strong>Alarm limits</strong><button type="button" onClick={() => setAlarmDialogOpen(false)}>×</button></div>
                  <div className="alarm-slider-grid five-alarm-grid">
                    <label className="alarm-slider-card critical-alarm-card">
                      <span>Peak pressure</span>
                      <small className="alarm-priority">Critical</small>
                      <strong>{alarmLimits.peakPressure} <small>cmH₂O</small></strong>
                      <div className="vertical-slider-wrap">
                        <em>60</em>
                        <input className="vertical-alarm-slider" type="range" min="0" max="60" step="1" value={alarmLimits.peakPressure} onChange={(event) => setAlarmLimits((current) => ({ ...current, peakPressure: Number(event.target.value) }))} />
                        <em>0</em>
                      </div>
                    </label>
                    <VerticalDualAlarmSlider label="Minute ventilation" unit="L/min" min={0} max={20} step={0.5} low={alarmLimits.minuteVentilationMin} high={alarmLimits.minuteVentilationMax} onLowChange={(value) => setAlarmLimits((current) => ({ ...current, minuteVentilationMin: Math.min(value, current.minuteVentilationMax) }))} onHighChange={(value) => setAlarmLimits((current) => ({ ...current, minuteVentilationMax: Math.max(value, current.minuteVentilationMin) }))} />
                    <VerticalDualAlarmSlider label="Tidal volume" unit="mL" min={0} max={1000} step={10} low={alarmLimits.tidalVolumeMin} high={alarmLimits.tidalVolumeMax} onLowChange={(value) => setAlarmLimits((current) => ({ ...current, tidalVolumeMin: Math.min(value, current.tidalVolumeMax) }))} onHighChange={(value) => setAlarmLimits((current) => ({ ...current, tidalVolumeMax: Math.max(value, current.tidalVolumeMin) }))} />
                    <VerticalDualAlarmSlider label="Respiratory rate" unit="/min" min={0} max={40} step={1} low={alarmLimits.respiratoryRateMin} high={alarmLimits.respiratoryRateMax} onLowChange={(value) => setAlarmLimits((current) => ({ ...current, respiratoryRateMin: Math.min(value, current.respiratoryRateMax) }))} onHighChange={(value) => setAlarmLimits((current) => ({ ...current, respiratoryRateMax: Math.max(value, current.respiratoryRateMin) }))} />
                    <label className="alarm-slider-card critical-alarm-card">
                      <span>Apnoea time</span>
                      <small className="alarm-priority">Critical</small>
                      <strong>{alarmLimits.apneaTime} <small>s</small></strong>
                      <div className="vertical-slider-wrap">
                        <em>120</em>
                        <input className="vertical-alarm-slider" type="range" min="15" max="120" step="5" value={alarmLimits.apneaTime} onChange={(event) => setAlarmLimits((current) => ({ ...current, apneaTime: Number(event.target.value) }))} />
                        <em>15</em>
                      </div>
                    </label>
                  </div>
                  <button className="alarm-dialog-done" type="button" onClick={() => setAlarmDialogOpen(false)}>Done</button>
                </section>
              </div>
            )}

            <div className={`waveforms ${waveformDisplay.fourth ? 'four-traces' : ''}`}>
              <Waveform samples={samples} signal="pressure" label="Paw" unit="cmH₂O" min={0} max={45} accent="#f6df63" frozen={frozen} cursorIndex={traceCursor} onCursorChange={setTraceCursor} showTime showSimvSyncWindow={ventilator.showSimvSyncWindow} showPatientEffortMarkers={patientEffortVisible} />
              <Waveform samples={samples} signal="flow" label="Flow" unit="L/min" min={-80} max={80} accent="#69d8f1" frozen={frozen} cursorIndex={traceCursor} onCursorChange={setTraceCursor} />

              <div className="waveform-options-bar">
                <label>
                  <span>Trace 3</span>
                  <select value={waveformDisplay.third} disabled={teachingSession.candidateWaveformsLocked} onChange={(event) => setWaveformDisplay((current) => ({ ...current, third: event.target.value as OptionalWaveform }))}>
                    {candidateWaveformOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                {waveformDisplay.fourth ? (
                  <>
                    <label>
                      <span>Trace 4</span>
                      <select value={waveformDisplay.fourth} disabled={teachingSession.candidateWaveformsLocked} onChange={(event) => setWaveformDisplay((current) => ({ ...current, fourth: event.target.value as OptionalWaveform }))}>
                        {candidateWaveformOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                    <button type="button" disabled={teachingSession.candidateWaveformsLocked} onClick={() => setWaveformDisplay((current) => ({ ...current, fourth: null }))}>− 4th trace</button>
                  </>
                ) : (
                  <button type="button" disabled={teachingSession.candidateWaveformsLocked} onClick={() => setWaveformDisplay((current) => ({ ...current, fourth: current.third === 'volume' ? 'co2' : 'volume' }))}>+ 4th trace</button>
                )}
              </div>

              {(() => {
                const config = waveformConfig[waveformDisplay.third]
                return <Waveform samples={samples} signal={waveformDisplay.third} label={config.label} unit={config.unit} min={config.min} max={config.max} accent={config.accent} frozen={frozen} cursorIndex={traceCursor} onCursorChange={setTraceCursor} />
              })()}
              {waveformDisplay.fourth && (() => {
                const config = waveformConfig[waveformDisplay.fourth]
                return <Waveform samples={samples} signal={waveformDisplay.fourth} label={config.label} unit={config.unit} min={config.min} max={config.max} accent={config.accent} frozen={frozen} cursorIndex={traceCursor} onCursorChange={setTraceCursor} />
              })()}
            </div>

            <aside className="metrics-panel" aria-label="Measured values">
              <div className="metrics-actions">
                <button className="metrics-alarm-limits" type="button" disabled={teachingSession.candidateAlarmsLocked} onClick={() => setAlarmDialogOpen(true)} title={teachingSession.candidateAlarmsLocked ? 'Alarm limits controlled by instructor' : 'Set alarm limits'}>Alarm limits</button>
              </div>
              <div className="metrics-title">Measured</div>
              <Metric label="Ppeak" value={eventMeasures.peakPressure.toFixed(0)} unit="cmH₂O" />
              <Metric label="VTe" value={tidalVolumeDisplayAvailable ? eventMeasures.tidalVolume.toFixed(0) : '-'} unit={tidalVolumeDisplayAvailable ? 'mL' : ''} />
              <Metric label="RR" value={eventMeasures.respiratoryRate.toFixed(0)} unit="/min" />
              <Metric label="MV" value={measures.minuteVentilation.toFixed(1)} unit="L/min" />
              <Metric label="PEEP" value={measures.peep.toFixed(0)} unit="cmH₂O" />
              <Metric label="Pmean" value={measures.meanPressure.toFixed(1)} unit="cmH₂O" />
              <Metric label="I:E measured" value={measuredIERatio == null ? '—' : `1:${measuredIERatio.toFixed(1)}`} unit="" />
              <div className="metrics-spacer" aria-hidden="true" />
              <GasMetric
                etco2={endTidalCO2 == null ? '-' : endTidalCO2.toFixed(0)}
                spo2={latestSample?.spo2 == null ? '—' : latestSample.spo2.toFixed(0)}
              />
              {frozen && selectedSample && <div className="cursor-hint">← → or drag trace cursor</div>}
            </aside>
          </div>

          <InteractiveVentilatorStrip
            settings={ventilator}
            onChange={setVentilator}
            disabled={teachingSession.candidateVentilatorLocked}
          />
        </section>

        <aside className="control-panel">
          <SessionPanel
            role={teachingSession.role}
            connection={teachingSession.connection}
            session={teachingSession.session}
            members={teachingSession.members}
            error={teachingSession.error}
            recoverableInstructor={teachingSession.recoverableInstructor}
            recoverableCandidate={teachingSession.recoverableCandidate}
            currentScenario={currentInstructorScenario}
            onLoadScenario={loadInstructorScenario}
            onStartInstructor={startInstructorSession}
            onResumeInstructor={teachingSession.resumeInstructor}
            onJoinCandidate={teachingSession.joinCandidate}
            onResumeCandidate={teachingSession.resumeCandidate}
            onLeaveSession={teachingSession.leaveSession}
            onEndInstructorSession={teachingSession.endInstructorSession}
            onUpdatePolicy={teachingSession.updatePolicy}
            onBroadcastNow={teachingSession.broadcastNow}
          />
          <fieldset className={`session-lock-fieldset ${teachingSession.candidateVentilatorLocked ? 'locked' : ''}`} disabled={teachingSession.candidateVentilatorLocked}>
            {teachingSession.candidateVentilatorLocked && <div className="session-control-lock-label">Instructor controlled</div>}
            <VentilatorControls settings={ventilator} onChange={setVentilator} onReset={resetVentilator} />
          </fieldset>
          <fieldset className={`session-lock-fieldset ${teachingSession.candidatePatientLocked ? 'locked' : ''}`} disabled={teachingSession.candidatePatientLocked}>
            {teachingSession.candidatePatientLocked && <div className="session-control-lock-label">Instructor controlled</div>}
            <PatientControls settings={patient} onChange={setPatient} onReset={resetPatient} transitionSeconds={patientTransitionSeconds} onTransitionSecondsChange={setPatientTransitionSeconds} showPatientEffort={patientEffortVisible} onShowPatientEffortChange={teachingSession.role === 'candidate' ? () => undefined : setShowPatientEffort} patientEffortLocked={teachingSession.role === 'candidate'} />
          </fieldset>
          <InstructorLiveRoom role={teachingSession.role} members={teachingSession.members} />
          <div className="disclaimer">Educational simulation only — not a medical device and not for clinical decision-making.</div>
        </aside>
      </div>
    </main>
  )
}
