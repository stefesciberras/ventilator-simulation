import { useEffect, useMemo, useRef, useState } from 'react'
import { PatientControls, VentilatorControls } from './components/Controls'
import { Waveform } from './components/Waveform'
import type { Signal } from './components/Waveform'
import { advanceSimulation, calculateMeasurements, createSimulationState } from './simulation/engine'
import type { PatientSettings, Sample, VentilatorSettings } from './simulation/types'

const initialVentilator: VentilatorSettings = {
  mode: 'VC-AC', fio2: 0.35, peep: 5, rate: 14, tidalVolume: 500, inspiratoryTime: 1,
  inspiratoryFlow: 30, plateauPercent: 0, pressureControl: 15, pressureSupport: 10, triggerType: 'pressure', triggerSensitivity: 2, flowTriggerSensitivity: 2, terminationSensitivity: 25,
  simvSyncWindowPercent: 25, showSimvSyncWindow: false,
  pHigh: 24, pLow: 5, tHigh: 4, tLow: 0.5,
}

const initialPatient: PatientSettings = {
  compliance: 60, resistance: 6, expiratoryResistance: 8, spontaneousRate: 12, effort: 5, neuralInspiratoryTime: 1, endExpiratoryOesophagealPressure: -5, co2Production: 250, deadSpaceVolume: 150,
}

interface AlarmLimits {
  apneaTime: number
  peakPressure: number
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

const initialAlarmLimits: AlarmLimits = { apneaTime: 30, peakPressure: 40 }
const VENTILATOR_STORAGE_KEY = 'eduvent.ventilator-settings'
const PATIENT_STORAGE_KEY = 'eduvent.patient-settings'
const ALARM_STORAGE_KEY = 'eduvent.alarm-limits'
const WAVEFORM_STORAGE_KEY = 'eduvent.waveform-display'
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
  }
  return null
}

function calculateEndTidalCO2(samples: Sample[]): number | null {
  if (samples.length < 2) return null
  let expiratoryPeak = 0
  let inExpiration = samples[0].phase === 'expiration'
  let lastCompleted: number | null = null

  if (inExpiration) expiratoryPeak = samples[0].co2
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]
    const current = samples[index]
    if (current.phase === 'expiration') {
      if (!inExpiration) {
        inExpiration = true
        expiratoryPeak = current.co2
      } else {
        expiratoryPeak = Math.max(expiratoryPeak, current.co2)
      }
    }
    if (previous.phase === 'expiration' && current.phase === 'inspiration' && inExpiration) {
      lastCompleted = expiratoryPeak
      inExpiration = false
      expiratoryPeak = 0
    }
  }
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
  const [patient, setPatient] = useState<PatientSettings>(() => loadStoredSettings(PATIENT_STORAGE_KEY, initialPatient))
  const [alarmLimits, setAlarmLimits] = useState<AlarmLimits>(() => {
    const stored = loadStoredSettings(ALARM_STORAGE_KEY, initialAlarmLimits)
    return {
      apneaTime: Math.max(15, Math.min(120, stored.apneaTime)),
      peakPressure: Math.max(0, Math.min(60, stored.peakPressure)),
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
  const [alarmDialogOpen, setAlarmDialogOpen] = useState(false)
  const [oxygenBoost, setOxygenBoost] = useState(false)
  const [nebuliser, setNebuliser] = useState(false)
  const [alarmSilenced, setAlarmSilenced] = useState(false)
  const [frozen, setFrozen] = useState(false)
  const [frozenSamples, setFrozenSamples] = useState<Sample[] | null>(null)
  const [traceCursor, setTraceCursor] = useState(Math.floor(WINDOW_SAMPLES * 0.7))
  const [inspiratoryHoldRequestTime, setInspiratoryHoldRequestTime] = useState<number | null>(null)
  const [inspiratoryHoldReleaseTime, setInspiratoryHoldReleaseTime] = useState<number | null>(null)
  const [expiratoryHoldRequestTime, setExpiratoryHoldRequestTime] = useState<number | null>(null)
  const [expiratoryHoldReleaseTime, setExpiratoryHoldReleaseTime] = useState<number | null>(null)
  const [alarmOnsets, setAlarmOnsets] = useState<{ apnea: number | null; pressure: number | null }>({ apnea: null, pressure: null })

  const simulationStateRef = useRef(createSimulationState())
  const simulationTimeRef = useRef(0)
  const alarmSilenceTimeoutRef = useRef<number | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
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
    window.localStorage.setItem(ALARM_STORAGE_KEY, JSON.stringify(alarmLimits))
  }, [alarmLimits])

  useEffect(() => {
    window.localStorage.setItem(WAVEFORM_STORAGE_KEY, JSON.stringify(waveformDisplay))
  }, [waveformDisplay])

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
      const nextSamples = advanceSimulation(
        simulationStateRef.current,
        effectiveVentilator,
        patient,
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
  const measuredIERatio = useMemo(() => calculateMeasuredIERatio(measurementSamples), [measurementSamples])
  const endTidalCO2 = useMemo(() => calculateEndTidalCO2(measurementSamples), [measurementSamples])
  const selectedSample = samples[Math.min(traceCursor, Math.max(0, samples.length - 1))]
  const latestSample = movingSamples[movingSamples.length - 1]
  const activeMode = latestSample?.mode ?? ventilator.mode
  const currentSimulationTime = latestSample?.time ?? simulationTimeRef.current
  const eventMeasures = useMemo(
    () => calculateEventMeasurements(measurementSamples, alarmLimits.apneaTime, currentSimulationTime),
    [measurementSamples, alarmLimits.apneaTime, currentSimulationTime],
  )
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

  useEffect(() => {
    setAlarmOnsets((current) => {
      let changed = false
      const next = { ...current }
      if (apneaAlarmActive && next.apnea == null) { next.apnea = currentSimulationTime; changed = true }
      if (!apneaAlarmActive && next.apnea != null) { next.apnea = null; changed = true }
      if (pressureAlarmActive && next.pressure == null) { next.pressure = currentSimulationTime; changed = true }
      if (!pressureAlarmActive && next.pressure != null) { next.pressure = null; changed = true }
      return changed ? next : current
    })
  }, [apneaAlarmActive, pressureAlarmActive, currentSimulationTime])

  const activeAlarmOnsets = [alarmOnsets.apnea, alarmOnsets.pressure].filter((value): value is number => value != null)
  const earliestAlarmOnset = activeAlarmOnsets.length ? Math.min(...activeAlarmOnsets) : null
  const alarmLevel = (apneaAlarmActive || pressureAlarmActive)
    ? earliestAlarmOnset != null && currentSimulationTime - earliestAlarmOnset >= 15 ? 'red' : 'yellow'
    : null
  const alarmLabels = [
    pressureAlarmActive ? 'HIGH PRESSURE' : null,
    apneaAlarmActive ? 'APNOEA' : null,
  ].filter((value): value is string => value != null)

  useEffect(() => {
    if (!alarmLevel || alarmSilenced) return
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
        oscillator.frequency.value = alarmLevel === 'red' ? 1040 : 820
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
    const interval = window.setInterval(beep, alarmLevel === 'red' ? 700 : 1300)
    return () => window.clearInterval(interval)
  }, [alarmLevel, alarmSilenced])

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
    setAlarmSilenced(true)
    if (alarmSilenceTimeoutRef.current != null) window.clearTimeout(alarmSilenceTimeoutRef.current)
    alarmSilenceTimeoutRef.current = window.setTimeout(() => {
      setAlarmSilenced(false)
      alarmSilenceTimeoutRef.current = null
    }, 120000)
  }

  const resetVentilator = () => setVentilator({ ...initialVentilator })
  const resetPatient = () => setPatient({ ...initialPatient })
  const isHoldKey = (key: string) => key === ' ' || key === 'Enter'

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block"><span className="brand-kicker">EDUVENT</span><h1>Mechanical Ventilation Simulator</h1></div>
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
        <div className="status-cluster"><span className={`status-dot ${frozen ? 'paused' : ''}`} />{frozen ? 'SIMULATION PAUSED' : 'SIMULATION ACTIVE'} <span className="version">v0.31</span></div>
      </header>

      <div className="workspace">
        <section className="ventilator-console">
          <div className="screen-header">
            <div className="mode-title"><span>Mode</span><strong>{activeMode}</strong></div>
            <div className="screen-settings">
              <span>FiO₂ <b>{Math.round(effectiveVentilator.fio2 * 100)}%</b></span>
              {activeMode === 'APRV' ? (
                <>
                  <span>Phigh <b>{ventilator.pHigh}</b></span>
                  <span>Plow <b>{ventilator.pLow}</b></span>
                  <span>Thigh <b>{ventilator.tHigh.toFixed(1)} s</b></span>
                  <span>Tlow <b>{ventilator.tLow.toFixed(2)} s</b></span>
                </>
              ) : activeMode === 'BIPAP' ? (
                <>
                  <span>Pinsp <b>{ventilator.pressureControl}</b></span>
                  <span>PEEP <b>{ventilator.peep}</b></span>
                  <span>RR <b>{ventilator.rate}</b></span>
                  <span>I:E <b>1:{ieRatio.toFixed(1)}</b></span>
                </>
              ) : (
                <>
                  <span>PEEP <b>{ventilator.peep}</b></span>
                  {conventionalTimedMode && <span>I:E <b>1:{ieRatio.toFixed(1)}</b></span>}
                  {volumeMandatoryMode && <span>Flow <b>{ventilator.inspiratoryFlow.toFixed(0)} L/min</b></span>}
                  {volumeMandatoryMode && <span>Plateau <b>{ventilator.plateauPercent ?? 0}%</b></span>}
                  {activeMode === 'VG-PC' && <span>VT target <b>{ventilator.tidalVolume} mL</b></span>}
                  {(activeMode === 'PSV' || simvMode) && <span>PS <b>{ventilator.pressureSupport}</b></span>}
                  {(activeMode === 'PSV' || simvMode) && <span>ETS <b>{ventilator.terminationSensitivity}%</b></span>}
                  {simvMode && <span>Sync <b>{ventilator.simvSyncWindowPercent ?? 25}%</b></span>}
                </>
              )}
            </div>
          </div>

          {alarmLevel && (
            <div className={`alarm-banner ${alarmLevel}`} role="alert">
              <strong>{alarmLabels.join(' • ')}</strong>
              {alarmSilenced && <span>ALARM SILENCED</span>}
            </div>
          )}

          <div className="screen-body">
            {alarmDialogOpen && (
              <div className="alarm-dialog-backdrop" onClick={() => setAlarmDialogOpen(false)}>
                <section className="alarm-dialog" role="dialog" aria-modal="true" aria-label="Alarm limits" onClick={(event) => event.stopPropagation()}>
                  <div className="alarm-dialog-title"><strong>Alarm limits</strong><button type="button" onClick={() => setAlarmDialogOpen(false)}>×</button></div>
                  <div className="alarm-slider-grid">
                    <label className="alarm-slider-card">
                      <span>Peak pressure</span>
                      <strong>{alarmLimits.peakPressure} <small>cmH₂O</small></strong>
                      <div className="vertical-slider-wrap">
                        <em>60</em>
                        <input
                          className="vertical-alarm-slider"
                          type="range"
                          min="0"
                          max="60"
                          step="1"
                          value={alarmLimits.peakPressure}
                          onChange={(event) => setAlarmLimits((current) => ({ ...current, peakPressure: Number(event.target.value) }))}
                        />
                        <em>0</em>
                      </div>
                    </label>
                    <label className="alarm-slider-card">
                      <span>Apnoea time</span>
                      <strong>{alarmLimits.apneaTime} <small>s</small></strong>
                      <div className="vertical-slider-wrap">
                        <em>120</em>
                        <input
                          className="vertical-alarm-slider"
                          type="range"
                          min="15"
                          max="120"
                          step="5"
                          value={alarmLimits.apneaTime}
                          onChange={(event) => setAlarmLimits((current) => ({ ...current, apneaTime: Number(event.target.value) }))}
                        />
                        <em>15</em>
                      </div>
                    </label>
                  </div>
                  <button className="alarm-dialog-done" type="button" onClick={() => setAlarmDialogOpen(false)}>Done</button>
                </section>
              </div>
            )}

            <div className={`waveforms ${waveformDisplay.fourth ? 'four-traces' : ''}`}>
              <Waveform samples={samples} signal="pressure" label="Paw" unit="cmH₂O" min={0} max={45} accent="#f6df63" frozen={frozen} cursorIndex={traceCursor} onCursorChange={setTraceCursor} showTime showSimvSyncWindow={ventilator.showSimvSyncWindow} />
              <Waveform samples={samples} signal="flow" label="Flow" unit="L/min" min={-80} max={80} accent="#69d8f1" frozen={frozen} cursorIndex={traceCursor} onCursorChange={setTraceCursor} />

              <div className="waveform-options-bar">
                <label>
                  <span>Trace 3</span>
                  <select value={waveformDisplay.third} onChange={(event) => setWaveformDisplay((current) => ({ ...current, third: event.target.value as OptionalWaveform }))}>
                    {waveformOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                {waveformDisplay.fourth ? (
                  <>
                    <label>
                      <span>Trace 4</span>
                      <select value={waveformDisplay.fourth} onChange={(event) => setWaveformDisplay((current) => ({ ...current, fourth: event.target.value as OptionalWaveform }))}>
                        {waveformOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                    <button type="button" onClick={() => setWaveformDisplay((current) => ({ ...current, fourth: null }))}>− 4th trace</button>
                  </>
                ) : (
                  <button type="button" onClick={() => setWaveformDisplay((current) => ({ ...current, fourth: current.third === 'volume' ? 'co2' : 'volume' }))}>+ 4th trace</button>
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
              <div className="metrics-title">Measured</div>
              <div className="metrics-actions">
                <button className="metrics-alarm-limits" type="button" onClick={() => setAlarmDialogOpen(true)} title="Set alarm limits">Alarm limits</button>
              </div>
              <Metric label="Ppeak" value={eventMeasures.peakPressure.toFixed(0)} unit="cmH₂O" />
              <Metric label="VTe" value={eventMeasures.tidalVolume.toFixed(0)} unit="mL" />
              <Metric label="RR" value={eventMeasures.respiratoryRate.toFixed(0)} unit="/min" />
              <Metric label="PEEP" value={measures.peep.toFixed(0)} unit="cmH₂O" />
              <Metric label="Pmean" value={measures.meanPressure.toFixed(1)} unit="cmH₂O" />
              <Metric label="EtCO₂" value={endTidalCO2 == null ? '—' : endTidalCO2.toFixed(0)} unit="mmHg" />
              <Metric label="I:E measured" value={measuredIERatio == null ? '—' : `1:${measuredIERatio.toFixed(1)}`} unit="" />
              {frozen && selectedSample && <div className="cursor-hint">← → or drag trace cursor</div>}
            </aside>
          </div>

          <div className="action-bar">
            <button className={`hardware-button oxygen-button ${oxygenBoost ? 'active amber' : ''}`} onClick={() => setOxygenBoost((v) => !v)} title="O₂ enrichment" aria-label="O₂ enrichment">O₂</button>
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
            <button className={`hardware-button icon-button alarm-button alarm-silence-bottom ${alarmSilenced ? 'active' : ''}`} onClick={silenceAlarm} title="Silence alarm sound for 2 minutes" aria-label="Silence alarm sound for 2 minutes"><AlarmSilenceIcon /></button>
          </div>
        </section>

        <aside className="control-panel">
          <VentilatorControls settings={ventilator} onChange={setVentilator} onReset={resetVentilator} />
          <PatientControls settings={patient} onChange={setPatient} onReset={resetPatient} />
          <div className="disclaimer">Educational simulation only — not a medical device and not for clinical decision-making.</div>
        </aside>
      </div>
    </main>
  )
}
