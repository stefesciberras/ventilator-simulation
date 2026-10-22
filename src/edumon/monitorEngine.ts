import { RollingSignalHistory } from '../core/RollingSignalHistory'
import type { CardiacRhythm, MonitorMeasurements, MonitorPatientState, MonitorSample } from './types'

const TWO_PI = Math.PI * 2
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const gaussian = (x: number, centre: number, width: number, amplitude: number) => amplitude * Math.exp(-0.5 * ((x - centre) / width) ** 2)
const fract = (value: number) => value - Math.floor(value)

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

function ecgAtPhase(time: number, state: MonitorPatientState, phase: number): number {
  const rhythm = state.rhythm
  if (rhythm === 'asystole') return 0.012 * Math.sin(time * 10.7)
  if (rhythm === 'ventricular-fibrillation') {
    return 0.65 * Math.sin(time * 18.1) + 0.33 * Math.sin(time * 31.7) + 0.17 * Math.sin(time * 47.3)
  }

  if (rhythm === 'ventricular-tachycardia') {
    return gaussian(phase, 0.16, 0.055, 1.55)
      - gaussian(phase, 0.08, 0.035, 0.45)
      - gaussian(phase, 0.28, 0.07, 0.7)
      + gaussian(phase, 0.58, 0.12, 0.22)
  }

  const qrsWidth = rhythm === 'svt' ? 0.018 : 0.022
  const fibrillatoryBaseline = rhythm === 'atrial-fibrillation'
    ? 0.055 * Math.sin(time * 42) + 0.028 * Math.sin(time * 67)
    : 0
  const pWave = rhythm === 'atrial-fibrillation' || rhythm === 'svt' ? 0 : gaussian(phase, 0.12, 0.025, 0.14)

  return fibrillatoryBaseline
    + pWave
    - gaussian(phase, 0.205, 0.012, 0.16)
    + gaussian(phase, 0.23, qrsWidth, 1.15)
    - gaussian(phase, 0.265, 0.015, 0.28)
    + gaussian(phase, 0.55, 0.065, 0.31)
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
  return clamp(1 + 0.18 * Math.sin(time * 2.7) + 0.09 * Math.sin(time * 7.9), 0.62, 1.38)
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

/**
 * Return the rolling monitor display history up to endTime.
 *
 * Unlike the original implementation, existing samples are never recalculated
 * from the latest patient state. Heart-rate, rhythm, pressure and perfusion
 * changes therefore affect only samples generated after the change while the
 * already-visible waveform scrolls out naturally.
 */
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

/** Reset EDUMON's streaming waveform timeline, primarily for future explicit reset/restart flows. */
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
  'atrial-fibrillation': 'Atrial fibrillation',
  svt: 'SVT',
  'ventricular-tachycardia': 'Ventricular tachycardia',
  'ventricular-fibrillation': 'Ventricular fibrillation',
  asystole: 'Asystole',
}

export const RHYTHMS = Object.keys(RHYTHM_LABELS) as CardiacRhythm[]
