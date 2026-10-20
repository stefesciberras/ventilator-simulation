import type { CardiacRhythm, MonitorMeasurements, MonitorPatientState, MonitorSample } from './types'

const TWO_PI = Math.PI * 2
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const gaussian = (x: number, centre: number, width: number, amplitude: number) => amplitude * Math.exp(-0.5 * ((x - centre) / width) ** 2)
const fract = (value: number) => value - Math.floor(value)

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

function cardiacPhase(time: number, rate: number, rhythm: CardiacRhythm): number {
  if (rate <= 0) return 0
  const beatsPerSecond = rate / 60
  if (rhythm === 'atrial-fibrillation') {
    const warped = time * beatsPerSecond + 0.11 * Math.sin(time * 2.7) + 0.05 * Math.sin(time * 7.9)
    return fract(warped)
  }
  return fract(time * beatsPerSecond)
}

function ecgAt(time: number, state: MonitorPatientState): number {
  const rhythm = state.rhythm
  if (rhythm === 'asystole') return 0.012 * Math.sin(time * 10.7)
  if (rhythm === 'ventricular-fibrillation') {
    return 0.65 * Math.sin(time * 18.1) + 0.33 * Math.sin(time * 31.7) + 0.17 * Math.sin(time * 47.3)
  }

  const rate = effectiveRate(state)
  const phase = cardiacPhase(time, rate, rhythm)

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

function arterialAt(time: number, state: MonitorPatientState): number {
  const rhythm = state.rhythm
  const map = state.diastolicPressure + (state.systolicPressure - state.diastolicPressure) / 3
  if (rhythm === 'asystole' || rhythm === 'ventricular-fibrillation') return Math.max(0, map * 0.34)

  const rate = effectiveRate(state)
  const delayedTime = Math.max(0, time - 0.16)
  const phase = cardiacPhase(delayedTime, rate, rhythm)
  const pulse = arterialPulse(phase)
  return state.diastolicPressure + (state.systolicPressure - state.diastolicPressure) * pulse
}

function plethPulse(phase: number): number {
  const primary = Math.pow(Math.max(0, Math.sin(Math.PI * clamp(phase / 0.72, 0, 1))), 1.9)
  const notch = gaussian(phase, 0.54, 0.035, -0.12)
  const rebound = gaussian(phase, 0.63, 0.055, 0.13)
  return Math.max(0, primary + notch + rebound)
}

function plethAt(time: number, state: MonitorPatientState): number {
  if (state.rhythm === 'asystole' || state.rhythm === 'ventricular-fibrillation') return 0
  const rate = effectiveRate(state)
  const delayedTime = Math.max(0, time - 0.29)
  const phase = cardiacPhase(delayedTime, rate, state.rhythm)
  const perfusion = clamp(state.peripheralPerfusion, 0, 1)
  return plethPulse(phase) * perfusion
}

export function generateMonitorSamples(state: MonitorPatientState, endTime: number, seconds = 8, sampleRate = 100): MonitorSample[] {
  const sampleCount = Math.max(2, Math.round(seconds * sampleRate))
  const start = Math.max(0, endTime - seconds)
  const samples: MonitorSample[] = []

  for (let index = 0; index < sampleCount; index += 1) {
    const time = start + (index / (sampleCount - 1)) * seconds
    samples.push({
      time,
      ecg: ecgAt(time, state),
      arterialPressure: arterialAt(time, state),
      pleth: plethAt(time, state),
    })
  }

  return samples
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
