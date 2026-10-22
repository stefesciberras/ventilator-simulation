import { RollingSignalHistory } from '../core/RollingSignalHistory'
import type { CardiacRhythm, EcgMorphology, MonitorMeasurements, MonitorPatientState, MonitorSample } from './types'

const TWO_PI = Math.PI * 2
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const gaussian = (x: number, centre: number, width: number, amplitude: number) => amplitude * Math.exp(-0.5 * ((x - centre) / width) ** 2)
const fract = (value: number) => value - Math.floor(value)
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const x = clamp((value - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1)
  return x * x * (3 - 2 * x)
}

interface CardiacPhaseHistorySample {
  time: number
  phase: number
  rhythm: CardiacRhythm
}

interface MonitorWaveformRuntime {
  history: RollingSignalHistory<MonitorSample>
  phaseHistory: CardiacPhaseHistorySample[]
  phase: number
  lastGeneratedTime: number | null
  windowSeconds: number
  sampleRate: number
}

let waveformRuntime: MonitorWaveformRuntime | null = null

function effectiveRate(state: MonitorPatientState): number {
  switch (state.rhythm) {
    case 'sinus-bradycardia': return clamp(state.heartRate, 30, 59)
    case 'sinus-tachycardia': return clamp(state.heartRate, 101, 180)
    case 'svt': return clamp(state.heartRate, 140, 240)
    case 'ventricular-tachycardia': return clamp(state.heartRate, 110, 240)
    case 'ventricular-fibrillation':
    case 'asystole': return 0
    default: return clamp(state.heartRate, 30, 220)
  }
}

/** Monomorphic broad-complex VT with no intervening normal P-QRS-T morphology. */
function ventricularTachycardiaAtPhase(phase: number): number {
  const fundamental = Math.sin(TWO_PI * (phase + 0.015))
  const secondHarmonic = 0.30 * Math.sin(TWO_PI * 2 * (phase - 0.08))
  const thirdHarmonic = 0.09 * Math.sin(TWO_PI * 3 * (phase + 0.04))
  return 1.02 * fundamental + secondHarmonic + thirdHarmonic - 0.03
}

/** Deterministic chaotic VF with slow coarse/fine amplitude and frequency variation. */
function ventricularFibrillationAtTime(time: number): number {
  const envelope = clamp(
    0.68
      + 0.24 * Math.sin(time * 0.73 + 0.4)
      + 0.15 * Math.sin(time * 1.31 + 2.1)
      + 0.08 * Math.sin(time * 2.17 + 0.9),
    0.26,
    1.12,
  )
  const oscillatorA = 0.58 * Math.sin(time * 18.4 + 0.72 * Math.sin(time * 0.41))
  const oscillatorB = 0.34 * Math.sin(time * 29.6 + 0.55 * Math.sin(time * 0.67 + 1.2))
  const oscillatorC = 0.21 * Math.sin(time * 43.1 + 0.44 * Math.sin(time * 0.29 + 2.4))
  const oscillatorD = 0.10 * Math.sin(time * 57.7 + 0.31 * Math.sin(time * 0.93))
  return envelope * (oscillatorA + oscillatorB + oscillatorC + oscillatorD)
}

/** Typical flutter waves near 300/min, independent of the conducted ventricular rate. */
function atrialFlutterBaseline(time: number): number {
  const atrialPhase = fract(time * 5)
  const descendingSaw = 1 - 2 * atrialPhase
  const rounding = 0.025 * Math.sin(TWO_PI * atrialPhase)
  return 0.105 * descendingSaw + rounding
}

function atrialFibrillationBaseline(time: number): number {
  const envelope = 0.78 + 0.22 * Math.sin(time * 0.84 + 0.7)
  return envelope * (
    0.040 * Math.sin(time * 39.5 + 0.35 * Math.sin(time * 0.77))
    + 0.026 * Math.sin(time * 57.8 + 0.22 * Math.sin(time * 1.13 + 1.4))
    + 0.014 * Math.sin(time * 73.1 + 2.1)
  )
}

function sinusFamilyMorphology(phase: number, state: MonitorPatientState): number {
  const rate = Math.max(30, effectiveRate(state))
  const qrsSigma = clamp(0.018 * rate / 60, 0.011, 0.050)
  const qSigma = clamp(0.010 * rate / 60, 0.007, 0.030)
  const sSigma = clamp(0.012 * rate / 60, 0.008, 0.035)
  const pSigma = clamp(0.020 * rate / 60, 0.012, 0.050)
  const tSigma = clamp(0.050 * rate / 60, 0.035, 0.110)
  const pAmplitude = state.rhythm === 'sinus-bradycardia' ? 0.16 : state.rhythm === 'sinus-tachycardia' ? 0.11 : 0.14
  const tAmplitude = state.rhythm === 'sinus-bradycardia' ? 0.34 : state.rhythm === 'sinus-tachycardia' ? 0.26 : 0.31

  return gaussian(phase, 0.12, pSigma, pAmplitude)
    - gaussian(phase, 0.205, qSigma, 0.16)
    + gaussian(phase, 0.23, qrsSigma, 1.15)
    - gaussian(phase, 0.265, sSigma, 0.28)
    + gaussian(phase, 0.55, tSigma, tAmplitude)
}

function narrowComplexWithoutP(phase: number, state: MonitorPatientState, tAmplitude = 0.24): number {
  const rate = Math.max(30, effectiveRate(state))
  const qrsSigma = clamp(0.014 * rate / 60, 0.010, 0.045)
  const qSigma = clamp(0.008 * rate / 60, 0.006, 0.026)
  const sSigma = clamp(0.010 * rate / 60, 0.007, 0.030)
  const tSigma = clamp(0.042 * rate / 60, 0.030, 0.095)
  return -gaussian(phase, 0.205, qSigma, 0.14)
    + gaussian(phase, 0.23, qrsSigma, 1.12)
    - gaussian(phase, 0.265, sSigma, 0.25)
    + gaussian(phase, 0.55, tSigma, tAmplitude)
}

function stSegmentWindow(phase: number): number {
  const rise = smoothstep(0.285, 0.325, phase)
  const fall = 1 - smoothstep(0.455, 0.515, phase)
  return rise * fall
}

/**
 * Apply an ECG morphology overlay to organized rhythms. Severity is 0..100.
 * Existing samples are already committed to rolling history, so morphology
 * changes affect only samples generated after the control change.
 */
function applyEcgMorphology(base: number, phase: number, state: MonitorPatientState): number {
  const morphology = state.ecgMorphology ?? 'nil'
  if (morphology === 'nil') return base
  if (state.rhythm === 'asystole' || state.rhythm === 'ventricular-fibrillation' || state.rhythm === 'ventricular-tachycardia') return base

  const severity = clamp((state.morphologySeverity ?? 50) / 100, 0, 1)
  if (severity <= 0) return base

  if (morphology === 'ischaemia') {
    const depression = 0.34 * severity * stSegmentWindow(phase)
    const tFlattening = gaussian(phase, 0.55, 0.085, 0.10 * severity)
    return base - depression - tFlattening
  }

  if (morphology === 'infarction') {
    const elevation = 0.42 * severity * stSegmentWindow(phase)
    const convexShoulder = gaussian(phase, 0.405, 0.085, 0.10 * severity)
    return base + elevation + convexShoulder
  }

  if (morphology === 'hyperkalaemia') {
    const pSuppression = gaussian(phase, 0.12, 0.035, 0.13 * severity)
    const qrsBroadening = gaussian(phase, 0.23, 0.052, 0.20 * severity)
      - gaussian(phase, 0.295, 0.045, 0.07 * severity)
    const peakedT = gaussian(phase, 0.55, Math.max(0.020, 0.050 - 0.022 * severity), 0.78 * severity)
    return base - pSuppression + qrsBroadening + peakedT
  }

  return base
}

function ecgAtPhase(time: number, state: MonitorPatientState, phase: number): number {
  const rhythm = state.rhythm
  if (rhythm === 'asystole') return 0.012 * Math.sin(time * 10.7)
  if (rhythm === 'ventricular-fibrillation') return ventricularFibrillationAtTime(time)
  if (rhythm === 'ventricular-tachycardia') return ventricularTachycardiaAtPhase(phase)

  let base: number
  if (rhythm === 'atrial-flutter') base = atrialFlutterBaseline(time) + narrowComplexWithoutP(phase, state, 0.18)
  else if (rhythm === 'atrial-fibrillation') base = atrialFibrillationBaseline(time) + narrowComplexWithoutP(phase, state, 0.22)
  else if (rhythm === 'svt') base = narrowComplexWithoutP(phase, state, 0.18)
  else base = sinusFamilyMorphology(phase, state)

  return applyEcgMorphology(base, phase, state)
}

function arterialPulse(phase: number): number {
  if (phase < 0.03) return phase / 0.03
  if (phase < 0.16) return 1 - ((phase - 0.03) / 0.13) * 0.12
  if (phase < 0.30) return 0.88 - ((phase - 0.16) / 0.14) * 0.34
  if (phase < 0.35) return 0.54 - ((phase - 0.30) / 0.05) * 0.16
  if (phase < 0.42) return 0.38 + ((phase - 0.35) / 0.07) * 0.10
  return 0.48 * Math.exp(-(phase - 0.42) * 4.1)
}

function arterialAtPhase(state: MonitorPatientState, phase: number, rhythm: CardiacRhythm): number {
  const map = state.diastolicPressure + (state.systolicPressure - state.diastolicPressure) / 3
  if (rhythm === 'asystole' || rhythm === 'ventricular-fibrillation') return Math.max(0, map * 0.34)
  const pulse = arterialPulse(phase)
  return state.diastolicPressure + (state.systolicPressure - state.diastolicPressure) * pulse
}

function plethPulse(phase: number): number {
  const primary = Math.pow(Math.max(0, Math.sin(Math.PI * clamp(phase / 0.72, 0, 1))), 1.9)
  const notch = gaussian(phase, 0.54, 0.035, -0.12)
  const rebound = gaussian(phase, 0.63, 0.055, 0.13)
  return Math.max(0, primary + notch + rebound)
}

function plethAtPhase(state: MonitorPatientState, phase: number, rhythm: CardiacRhythm): number {
  if (rhythm === 'asystole' || rhythm === 'ventricular-fibrillation') return 0
  const perfusion = clamp(state.peripheralPerfusion, 0, 1)
  return plethPulse(phase) * perfusion
}

function createWaveformRuntime(windowSeconds: number, sampleRate: number): MonitorWaveformRuntime {
  return {
    history: new RollingSignalHistory<MonitorSample>(windowSeconds),
    phaseHistory: [],
    phase: 0,
    lastGeneratedTime: null,
    windowSeconds,
    sampleRate,
  }
}

function ensureWaveformRuntime(endTime: number, windowSeconds: number, sampleRate: number): MonitorWaveformRuntime {
  const configurationChanged = waveformRuntime
    && (waveformRuntime.windowSeconds !== windowSeconds || waveformRuntime.sampleRate !== sampleRate)
  const timeRewound = waveformRuntime?.lastGeneratedTime != null && endTime < waveformRuntime.lastGeneratedTime - (1 / sampleRate)
  if (!waveformRuntime || configurationChanged || timeRewound) {
    waveformRuntime = createWaveformRuntime(windowSeconds, sampleRate)
  }
  return waveformRuntime
}

function delayedPhase(runtime: MonitorWaveformRuntime, targetTime: number): CardiacPhaseHistorySample | null {
  for (let index = runtime.phaseHistory.length - 1; index >= 0; index -= 1) {
    if (runtime.phaseHistory[index].time <= targetTime) return runtime.phaseHistory[index]
  }
  return runtime.phaseHistory[0] ?? null
}

function trimPhaseHistory(runtime: MonitorWaveformRuntime, endTime: number): void {
  const keepAfter = endTime - 0.5
  let first = 0
  while (first < runtime.phaseHistory.length - 1 && runtime.phaseHistory[first].time < keepAfter) first += 1
  if (first > 0) runtime.phaseHistory.splice(0, first)
}

function phaseRateMultiplier(time: number, rhythm: CardiacRhythm): number {
  if (rhythm !== 'atrial-fibrillation') return 1
  return clamp(
    1
      + 0.22 * Math.sin(time * 2.31 + 0.4)
      + 0.14 * Math.sin(time * 5.73 + 1.7)
      + 0.07 * Math.sin(time * 11.17 + 2.2),
    0.48,
    1.55,
  )
}

function generateNextSample(
  runtime: MonitorWaveformRuntime,
  state: MonitorPatientState,
  time: number,
  deltaTime: number,
): MonitorSample {
  const currentPhase = runtime.phase
  const currentRhythm = state.rhythm
  runtime.phaseHistory.push({ time, phase: currentPhase, rhythm: currentRhythm })

  const arterialPhase = delayedPhase(runtime, time - 0.16) ?? { time, phase: currentPhase, rhythm: currentRhythm }
  const plethPhase = delayedPhase(runtime, time - 0.29) ?? { time, phase: currentPhase, rhythm: currentRhythm }

  const sample: MonitorSample = {
    time,
    ecg: ecgAtPhase(time, state, currentPhase),
    arterialPressure: arterialAtPhase(state, arterialPhase.phase, arterialPhase.rhythm),
    pleth: plethAtPhase(state, plethPhase.phase, plethPhase.rhythm),
  }

  const rate = effectiveRate(state)
  if (rate > 0) {
    runtime.phase = fract(runtime.phase + (rate / 60) * deltaTime * phaseRateMultiplier(time, currentRhythm))
  }
  trimPhaseHistory(runtime, time)
  return sample
}

export function generateMonitorSamples(state: MonitorPatientState, endTime: number, seconds = 8, sampleRate = 100): MonitorSample[] {
  const safeSampleRate = Math.max(1, sampleRate)
  const safeWindowSeconds = Math.max(0.1, seconds)
  const runtime = ensureWaveformRuntime(endTime, safeWindowSeconds, safeSampleRate)
  const step = 1 / safeSampleRate

  if (runtime.lastGeneratedTime == null) {
    runtime.lastGeneratedTime = Math.max(0, endTime - safeWindowSeconds) - step
  }

  let nextTime = runtime.lastGeneratedTime + step
  const epsilon = step * 0.1
  while (nextTime <= endTime + epsilon) {
    const previousTime = runtime.lastGeneratedTime
    const deltaTime = previousTime == null ? step : Math.max(step, nextTime - previousTime)
    runtime.history.append(generateNextSample(runtime, state, nextTime, deltaTime))
    runtime.lastGeneratedTime = nextTime
    nextTime += step
  }

  runtime.history.trim(endTime)
  return runtime.history.snapshot()
}

export function resetMonitorWaveformHistory(): void {
  waveformRuntime = null
}

export function measurementsFor(state: MonitorPatientState): MonitorMeasurements {
  const arrestRhythm = state.rhythm === 'asystole' || state.rhythm === 'ventricular-fibrillation'
  const meanPressure = Math.round(state.diastolicPressure + (state.systolicPressure - state.diastolicPressure) / 3)
  return {
    heartRate: arrestRhythm ? null : Math.round(effectiveRate(state)),
    systolicPressure: arrestRhythm ? null : Math.round(state.systolicPressure),
    diastolicPressure: arrestRhythm ? null : Math.round(state.diastolicPressure),
    meanPressure: arrestRhythm ? null : meanPressure,
    spo2: arrestRhythm ? null : Math.round(clamp(state.spo2, 0, 100)),
  }
}

export const RHYTHM_LABELS: Record<CardiacRhythm, string> = {
  sinus: 'Sinus rhythm',
  'sinus-bradycardia': 'Sinus bradycardia',
  'sinus-tachycardia': 'Sinus tachycardia',
  'atrial-flutter': 'Atrial flutter',
  'atrial-fibrillation': 'Atrial fibrillation',
  svt: 'SVT',
  'ventricular-tachycardia': 'Ventricular tachycardia',
  'ventricular-fibrillation': 'Ventricular fibrillation',
  asystole: 'Asystole',
}

export const RHYTHMS = Object.keys(RHYTHM_LABELS) as CardiacRhythm[]

export const ECG_MORPHOLOGY_LABELS: Record<EcgMorphology, string> = {
  nil: 'Nil',
  ischaemia: 'Ischaemia (ST depression)',
  infarction: 'Infarction (ST elevation)',
  hyperkalaemia: 'Hyperkalaemia',
}

export const ECG_MORPHOLOGIES = Object.keys(ECG_MORPHOLOGY_LABELS) as EcgMorphology[]
