import { RollingSignalHistory } from '../core/RollingSignalHistory'
import { setActionRuntimeSimulationTime } from '../edusim/actions/ActionRuntime'
import { applyEdumonActionPhysiology } from './actionPhysiology'
import { currentEdumonRespiratorySpO2 } from './respiratoryPhysiology'
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
  pulseAmplitude: number
}

interface BeatMeasurement {
  time: number
  rrSeconds: number
  instantaneousRate: number
  pulseAmplitude: number
  systolic: number
  diastolic: number
  mean: number
  spo2: number | null
}

interface MonitorWaveformRuntime {
  history: RollingSignalHistory<MonitorSample>
  phaseHistory: CardiacPhaseHistorySample[]
  beatHistory: BeatMeasurement[]
  phase: number
  lastGeneratedTime: number | null
  lastBeatTime: number | null
  windowSeconds: number
  sampleRate: number
  beatIndex: number
  rateScale: number
  pulseAmplitude: number
  lastRhythm: CardiacRhythm | null
}

interface EffectiveBloodPressure {
  systolic: number
  diastolic: number
  mean: number
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

function isIrregularAtrialRhythm(rhythm: CardiacRhythm): boolean {
  return rhythm === 'atrial-fibrillation' || rhythm === 'atrial-flutter'
}

function beatRandom(index: number, rhythm: CardiacRhythm): number {
  const salt = rhythm === 'atrial-flutter' ? 17.41 : 29.73
  return fract(Math.sin((index + 1) * 12.9898 + salt) * 43758.5453)
}

function irregularRateScale(index: number, rhythm: CardiacRhythm): number {
  const random = beatRandom(index, rhythm)
  const rrRatio = rhythm === 'atrial-fibrillation'
    ? 0.72 + 0.56 * random
    : 0.85 + 0.30 * random
  return 1 / rrRatio
}

function pulseAmplitudeFromRr(rrSeconds: number, nominalRrSeconds: number): number {
  const rrRatio = clamp(rrSeconds / Math.max(0.12, nominalRrSeconds), 0.50, 1.7)
  if (rrRatio < 1) return clamp(Math.pow(rrRatio, 5), 0.28, 1)
  return clamp(1 + (rrRatio - 1) * 0.9, 1, 1.25)
}

function ventricularTachycardiaBloodPressure(state: MonitorPatientState): EffectiveBloodPressure {
  const rate = clamp(state.heartRate, 110, 240)
  const rateFraction = (rate - 110) / (240 - 110)
  const systolicCeiling = 80 - 20 * rateFraction
  const systolic = Math.min(state.systolicPressure, systolicCeiling)
  const diastolicCeiling = clamp(systolic * 0.55, 30, 48)
  const diastolic = Math.min(state.diastolicPressure, diastolicCeiling, Math.max(20, systolic - 10))
  const mean = diastolic + (systolic - diastolic) / 3
  return { systolic, diastolic, mean }
}

function effectiveBloodPressure(state: MonitorPatientState, rhythm: CardiacRhythm = state.rhythm): EffectiveBloodPressure {
  if (rhythm === 'ventricular-tachycardia') return ventricularTachycardiaBloodPressure(state)
  const systolic = state.systolicPressure
  const diastolic = state.diastolicPressure
  const mean = diastolic + (systolic - diastolic) / 3
  return { systolic, diastolic, mean }
}

function beatSystolicPressure(state: MonitorPatientState, rhythm: CardiacRhythm, pulseAmplitude: number): number {
  const pressure = effectiveBloodPressure(state, rhythm)
  return pressure.diastolic + (pressure.systolic - pressure.diastolic) * pulseAmplitude
}

function spo2ForSystolic(targetSpo2: number, systolic: number): number | null {
  if (systolic < 70) return null
  const hypotensionPenalty = systolic < 80 ? (80 - systolic) * 0.8 : 0
  return clamp(targetSpo2 - hypotensionPenalty, 0, 100)
}

function plethPerfusionFactor(systolic: number): number {
  if (systolic < 70) return 0
  if (systolic >= 80) return 1
  return clamp((systolic - 70) / 10, 0, 1)
}

function ventricularTachycardiaAtPhase(phase: number): number {
  const fundamental = Math.sin(TWO_PI * (phase + 0.015))
  const secondHarmonic = 0.30 * Math.sin(TWO_PI * 2 * (phase - 0.08))
  const thirdHarmonic = 0.09 * Math.sin(TWO_PI * 3 * (phase + 0.04))
  return 1.02 * fundamental + secondHarmonic + thirdHarmonic - 0.03
}

function ventricularFibrillationAtTime(time: number): number {
  const envelope = clamp(0.68 + 0.24 * Math.sin(time * 0.73 + 0.4) + 0.15 * Math.sin(time * 1.31 + 2.1) + 0.08 * Math.sin(time * 2.17 + 0.9), 0.26, 1.12)
  const oscillatorA = 0.58 * Math.sin(time * 18.4 + 0.72 * Math.sin(time * 0.41))
  const oscillatorB = 0.34 * Math.sin(time * 29.6 + 0.55 * Math.sin(time * 0.67 + 1.2))
  const oscillatorC = 0.21 * Math.sin(time * 43.1 + 0.44 * Math.sin(time * 0.29 + 2.4))
  const oscillatorD = 0.10 * Math.sin(time * 57.7 + 0.31 * Math.sin(time * 0.93))
  return envelope * (oscillatorA + oscillatorB + oscillatorC + oscillatorD)
}

function atrialFlutterBaseline(time: number): number {
  const atrialPhase = fract(time * 5)
  const descendingSaw = 1 - 2 * atrialPhase
  const rounding = 0.025 * Math.sin(TWO_PI * atrialPhase)
  return 0.105 * descendingSaw + rounding
}

function atrialFibrillationBaseline(time: number): number {
  const envelope = 0.78 + 0.22 * Math.sin(time * 0.84 + 0.7)
  return envelope * (0.040 * Math.sin(time * 39.5 + 0.35 * Math.sin(time * 0.77)) + 0.026 * Math.sin(time * 57.8 + 0.22 * Math.sin(time * 1.13 + 1.4)) + 0.014 * Math.sin(time * 73.1 + 2.1))
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
  return gaussian(phase, 0.12, pSigma, pAmplitude) - gaussian(phase, 0.205, qSigma, 0.16) + gaussian(phase, 0.23, qrsSigma, 1.15) - gaussian(phase, 0.265, sSigma, 0.28) + gaussian(phase, 0.55, tSigma, tAmplitude)
}

function narrowComplexWithoutP(phase: number, state: MonitorPatientState, tAmplitude = 0.24): number {
  const rate = Math.max(30, effectiveRate(state))
  const qrsSigma = clamp(0.014 * rate / 60, 0.010, 0.045)
  const qSigma = clamp(0.008 * rate / 60, 0.006, 0.026)
  const sSigma = clamp(0.010 * rate / 60, 0.007, 0.030)
  const tSigma = clamp(0.042 * rate / 60, 0.030, 0.095)
  return -gaussian(phase, 0.205, qSigma, 0.14) + gaussian(phase, 0.23, qrsSigma, 1.12) - gaussian(phase, 0.265, sSigma, 0.25) + gaussian(phase, 0.55, tSigma, tAmplitude)
}

function stJunctionWindow(phase: number): number {
  return smoothstep(0.265, 0.300, phase) * (1 - smoothstep(0.455, 0.525, phase))
}

function applyEcgMorphology(base: number, phase: number, state: MonitorPatientState): number {
  const morphology = state.ecgMorphology ?? 'nil'
  if (morphology === 'nil') return base
  if (state.rhythm === 'asystole' || state.rhythm === 'ventricular-fibrillation' || state.rhythm === 'ventricular-tachycardia') return base
  const severity = clamp((state.morphologySeverity ?? 50) / 100, 0, 1)
  if (severity <= 0) return base
  if (morphology === 'ischaemia') {
    const stSlope = 0.88 + 0.12 * smoothstep(0.31, 0.46, phase)
    return base - 0.32 * severity * stJunctionWindow(phase) * stSlope - gaussian(phase, 0.55, 0.075, 0.56 * severity)
  }
  if (morphology === 'infarction') {
    return base + gaussian(phase, 0.292, 0.036, 0.24 * severity) + 0.40 * severity * stJunctionWindow(phase) + gaussian(phase, 0.405, 0.095, 0.12 * severity) + gaussian(phase, 0.55, 0.090, 0.26 * severity)
  }
  if (morphology === 'hyperkalaemia') {
    const pSuppression = gaussian(phase, 0.12, 0.035, 0.13 * severity)
    const qrsBroadening = gaussian(phase, 0.23, 0.052, 0.20 * severity) - gaussian(phase, 0.295, 0.045, 0.07 * severity)
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

function arterialAtPhase(state: MonitorPatientState, phase: number, rhythm: CardiacRhythm, pulseAmplitude = 1): number {
  const pressure = effectiveBloodPressure(state, rhythm)
  if (rhythm === 'asystole' || rhythm === 'ventricular-fibrillation') return Math.max(0, pressure.mean * 0.34)
  return pressure.diastolic + (pressure.systolic - pressure.diastolic) * arterialPulse(phase) * pulseAmplitude
}

function plethPulse(phase: number, perfusion: number): number {
  const normalizedPerfusion = clamp(perfusion, 0, 1)
  const primary = ((1 - Math.exp(-phase / 0.035)) * Math.exp(-phase / 0.38)) / 0.73
  const featureScale = 0.22 + 0.78 * normalizedPerfusion
  const earlyShoulder = gaussian(phase, 0.18, 0.070, 0.045 * featureScale)
  const notch = gaussian(phase, 0.34, 0.028, -0.17 * featureScale)
  const rebound = gaussian(phase, 0.415, 0.050, 0.13 * featureScale)
  return Math.max(0, primary + earlyShoulder + notch + rebound)
}

function plethAtPhase(state: MonitorPatientState, phase: number, rhythm: CardiacRhythm, pulseAmplitude = 1): number {
  if (rhythm === 'asystole' || rhythm === 'ventricular-fibrillation') return 0
  const systolic = beatSystolicPressure(state, rhythm, pulseAmplitude)
  const perfusion = clamp(state.peripheralPerfusion, 0, 1) * plethPerfusionFactor(systolic)
  return plethPulse(phase, perfusion) * perfusion * pulseAmplitude
}

function createWaveformRuntime(windowSeconds: number, sampleRate: number): MonitorWaveformRuntime {
  return { history: new RollingSignalHistory<MonitorSample>(windowSeconds), phaseHistory: [], beatHistory: [], phase: 0, lastGeneratedTime: null, lastBeatTime: null, windowSeconds, sampleRate, beatIndex: 0, rateScale: 1, pulseAmplitude: 1, lastRhythm: null }
}

function ensureWaveformRuntime(endTime: number, windowSeconds: number, sampleRate: number): MonitorWaveformRuntime {
  const configurationChanged = waveformRuntime && (waveformRuntime.windowSeconds !== windowSeconds || waveformRuntime.sampleRate !== sampleRate)
  const timeRewound = waveformRuntime?.lastGeneratedTime != null && endTime < waveformRuntime.lastGeneratedTime - (1 / sampleRate)
  if (!waveformRuntime || configurationChanged || timeRewound) waveformRuntime = createWaveformRuntime(windowSeconds, sampleRate)
  return waveformRuntime
}

function delayedPhase(runtime: MonitorWaveformRuntime, targetTime: number): CardiacPhaseHistorySample | null {
  for (let index = runtime.phaseHistory.length - 1; index >= 0; index -= 1) if (runtime.phaseHistory[index].time <= targetTime) return runtime.phaseHistory[index]
  return runtime.phaseHistory[0] ?? null
}

function trimRuntimeHistory(runtime: MonitorWaveformRuntime, endTime: number): void {
  const phaseKeepAfter = endTime - 0.5
  let firstPhase = 0
  while (firstPhase < runtime.phaseHistory.length - 1 && runtime.phaseHistory[firstPhase].time < phaseKeepAfter) firstPhase += 1
  if (firstPhase > 0) runtime.phaseHistory.splice(0, firstPhase)
  const beatKeepAfter = endTime - 65
  let firstBeat = 0
  while (firstBeat < runtime.beatHistory.length && runtime.beatHistory[firstBeat].time < beatKeepAfter) firstBeat += 1
  if (firstBeat > 0) runtime.beatHistory.splice(0, firstBeat)
}

function recordBeat(runtime: MonitorWaveformRuntime, state: MonitorPatientState, time: number, rhythm: CardiacRhythm, pulseAmplitude: number): void {
  const rate = Math.max(1, effectiveRate(state))
  const nominalRr = 60 / rate
  const rrSeconds = runtime.lastBeatTime == null ? nominalRr : Math.max(0.12, time - runtime.lastBeatTime)
  runtime.lastBeatTime = time
  const pressure = effectiveBloodPressure(state, rhythm)
  const diastolic = pressure.diastolic
  const systolic = beatSystolicPressure(state, rhythm, pulseAmplitude)
  const mean = diastolic + (systolic - diastolic) / 3
  const perfusionNoise = (beatRandom(runtime.beatIndex + 101, rhythm) - 0.5) * (0.35 + (1 - clamp(state.peripheralPerfusion, 0, 1)) * 0.9)
  const physiologicalSpo2 = currentEdumonRespiratorySpO2(state.spo2)
  const perfusionSpo2 = spo2ForSystolic(physiologicalSpo2, systolic)
  runtime.beatHistory.push({ time, rrSeconds, instantaneousRate: 60 / rrSeconds, pulseAmplitude, systolic, diastolic, mean, spo2: perfusionSpo2 == null ? null : clamp(perfusionSpo2 + perfusionNoise, 0, 100) })
}

function generateNextSample(runtime: MonitorWaveformRuntime, state: MonitorPatientState, time: number, deltaTime: number): MonitorSample {
  const currentRhythm = state.rhythm
  const irregular = isIrregularAtrialRhythm(currentRhythm)
  if (runtime.lastRhythm !== currentRhythm) {
    runtime.lastRhythm = currentRhythm
    runtime.pulseAmplitude = 1
    runtime.rateScale = irregular ? irregularRateScale(runtime.beatIndex, currentRhythm) : 1
    runtime.lastBeatTime = null
  }
  const currentPhase = runtime.phase
  runtime.phaseHistory.push({ time, phase: currentPhase, rhythm: currentRhythm, pulseAmplitude: runtime.pulseAmplitude })
  const arterialPhase = delayedPhase(runtime, time - 0.16) ?? { time, phase: currentPhase, rhythm: currentRhythm, pulseAmplitude: runtime.pulseAmplitude }
  const plethPhase = delayedPhase(runtime, time - 0.29) ?? { time, phase: currentPhase, rhythm: currentRhythm, pulseAmplitude: runtime.pulseAmplitude }
  const sample: MonitorSample = { time, ecg: ecgAtPhase(time, state, currentPhase), arterialPressure: arterialAtPhase(state, arterialPhase.phase, arterialPhase.rhythm, arterialPhase.pulseAmplitude), pleth: plethAtPhase(state, plethPhase.phase, plethPhase.rhythm, plethPhase.pulseAmplitude) }
  const rate = effectiveRate(state)
  if (rate > 0) {
    const rateScale = irregular ? runtime.rateScale : 1
    const nextPhase = runtime.phase + (rate / 60) * deltaTime * rateScale
    if (nextPhase >= 1) {
      runtime.phase = fract(nextPhase)
      const nominalRr = 60 / rate
      const rrSeconds = runtime.lastBeatTime == null ? nominalRr / rateScale : Math.max(0.12, time - runtime.lastBeatTime)
      const nextPulseAmplitude = irregular ? pulseAmplitudeFromRr(rrSeconds, nominalRr) : 1
      runtime.pulseAmplitude = nextPulseAmplitude
      recordBeat(runtime, state, time, currentRhythm, nextPulseAmplitude)
      runtime.beatIndex += 1
      runtime.rateScale = irregular ? irregularRateScale(runtime.beatIndex, currentRhythm) : 1
    } else runtime.phase = nextPhase
  }
  trimRuntimeHistory(runtime, time)
  return sample
}

export function generateMonitorSamples(state: MonitorPatientState, endTime: number, seconds = 8, sampleRate = 100): MonitorSample[] {
  setActionRuntimeSimulationTime(endTime)
  const safeSampleRate = Math.max(1, sampleRate)
  const safeWindowSeconds = Math.max(0.1, seconds)
  const runtime = ensureWaveformRuntime(endTime, safeWindowSeconds, safeSampleRate)
  const step = 1 / safeSampleRate
  if (runtime.lastGeneratedTime == null) runtime.lastGeneratedTime = Math.max(0, endTime - safeWindowSeconds) - step
  let nextTime = runtime.lastGeneratedTime + step
  const epsilon = step * 0.1
  while (nextTime <= endTime + epsilon) {
    const previousTime = runtime.lastGeneratedTime
    const deltaTime = previousTime == null ? step : Math.max(step, nextTime - previousTime)
    const effectiveState = applyEdumonActionPhysiology(state, nextTime)
    runtime.history.append(generateNextSample(runtime, effectiveState, nextTime, deltaTime))
    runtime.lastGeneratedTime = nextTime
    nextTime += step
  }
  runtime.history.trim(endTime)
  return runtime.history.snapshot()
}

export function resetMonitorWaveformHistory(): void { waveformRuntime = null }

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

export function measurementsFor(state: MonitorPatientState): MonitorMeasurements {
  const actionTime = waveformRuntime?.lastGeneratedTime ?? 0
  setActionRuntimeSimulationTime(actionTime)
  state = applyEdumonActionPhysiology(state, actionTime)
  if (state.rhythm === 'asystole' || state.rhythm === 'ventricular-fibrillation') return { heartRate: null, systolicPressure: null, diastolicPressure: null, meanPressure: null, spo2: null }
  const runtime = waveformRuntime
  const now = runtime?.lastGeneratedTime ?? 0
  const beats = runtime?.beatHistory ?? []
  const latestBeat = beats.length ? beats[beats.length - 1] : null
  const hrBeats = beats.filter((beat) => beat.time >= now - 60)
  const spo2Beats = beats.filter((beat) => beat.time >= now - 30 && beat.spo2 != null)
  const pressure = effectiveBloodPressure(state)
  const currentSystolic = latestBeat?.systolic ?? pressure.systolic
  const physiologicalSpo2 = currentEdumonRespiratorySpO2(state.spo2)
  const fallbackSpo2 = spo2ForSystolic(physiologicalSpo2, currentSystolic)
  return {
    heartRate: Math.round(average(hrBeats.map((beat) => beat.instantaneousRate)) ?? effectiveRate(state)),
    systolicPressure: Math.round(currentSystolic),
    diastolicPressure: Math.round(latestBeat?.diastolic ?? pressure.diastolic),
    meanPressure: Math.round(latestBeat?.mean ?? pressure.mean),
    spo2: currentSystolic < 70 ? null : Math.round(average(spo2Beats.map((beat) => beat.spo2 as number)) ?? fallbackSpo2 ?? clamp(physiologicalSpo2, 0, 100)),
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
