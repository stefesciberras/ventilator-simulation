import { advanceAlveolarCo2 } from './sharedCo2Kinetics.mjs'
import { advanceOxygenation, targetSpO2FromAlveolarFraction as sharedTargetSpO2 } from './sharedOxygenation.mjs'

export interface RespiratoryPhysiologyInput {
  sex: 'male' | 'female'
  heightCm: number
  respiratoryRate: number
  tidalVolumeMl: number
  deadSpaceMl: number
  fio2: number
  peepCmH2O: number
  complianceMlPerCmH2O: number
  expiratoryResistanceCmH2OLs: number
  frcMl: number
  shuntFraction: number
  maxSpO2: number
  oxygenConsumptionMlMin: number
  co2ProductionMlMin: number
  referenceCardiacOutputLMin?: number
}

export interface RespiratoryPhysiologyState {
  alveolarCo2MmHg: number
  alveolarOxygenFraction: number
  spo2Percent: number
}

export interface RespiratoryPhysiologyOutput {
  respiratoryRate: number
  tidalVolumeMl: number
  deadSpaceMl: number
  alveolarTidalVolumeMl: number
  minuteVentilationLMin: number
  alveolarVentilationLMin: number
  oxygenConsumptionMlMin: number
  co2ProductionMlMin: number
  alveolarCo2MmHg: number
  paCo2MmHg: number
  estimatedEtCo2MmHg: number
  alveolarOxygenFraction: number
  paO2MmHg: number
  spo2Percent: number
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function predictedBodyWeightKg(sex: 'male' | 'female', heightCm: number): number {
  return Math.max(20, (sex === 'female' ? 45.5 : 50) + 0.91 * (heightCm - 152.4))
}

export function calculateAlveolarVentilation(
  respiratoryRate: number,
  tidalVolumeMl: number,
  deadSpaceMl: number,
): { alveolarTidalVolumeMl: number; minuteVentilationLMin: number; alveolarVentilationLMin: number } {
  const safeRate = clamp(respiratoryRate, 0, 80)
  const safeTidalVolume = Math.max(0, tidalVolumeMl)
  const safeDeadSpace = clamp(deadSpaceMl, 0, safeTidalVolume)
  const alveolarTidalVolumeMl = Math.max(0, safeTidalVolume - safeDeadSpace)
  return {
    alveolarTidalVolumeMl,
    minuteVentilationLMin: safeTidalVolume * safeRate / 1000,
    alveolarVentilationLMin: alveolarTidalVolumeMl * safeRate / 1000,
  }
}

export function saturationFromOxygenTension(po2MmHg: number): number {
  const p50 = 26.8
  const hillExponent = 2.7
  const po2 = Math.max(po2MmHg, 1)
  return 100 / (1 + Math.pow(p50 / po2, hillExponent))
}

export function oxygenTensionFromSaturation(saturationPercent: number): number {
  const p50 = 26.8
  const hillExponent = 2.7
  const saturation = clamp(saturationPercent / 100, 0.001, 0.999)
  return clamp(p50 * Math.pow(saturation / Math.max(1 - saturation, 0.001), 1 / hillExponent), 1, 650)
}

export function oxygenContentForSaturation(saturationPercent: number): number {
  const haemoglobin = 15
  const oxygenCapacity = 1.34 * haemoglobin
  const saturation = clamp(saturationPercent / 100, 0.5, 0.999)
  const po2 = oxygenTensionFromSaturation(saturationPercent)
  return oxygenCapacity * saturation + 0.003 * po2
}

export function targetSpO2FromAlveolarFraction(
  alveolarFraction: number,
  input: Pick<RespiratoryPhysiologyInput,
    | 'expiratoryResistanceCmH2OLs'
    | 'shuntFraction'
    | 'complianceMlPerCmH2O'
    | 'peepCmH2O'
    | 'oxygenConsumptionMlMin'
    | 'referenceCardiacOutputLMin'
    | 'maxSpO2'
  >,
): number {
  return sharedTargetSpO2(alveolarFraction, input)
}

export function createRespiratoryPhysiologyState(
  initial: Partial<RespiratoryPhysiologyState> = {},
): RespiratoryPhysiologyState {
  return {
    alveolarCo2MmHg: clamp(initial.alveolarCo2MmHg ?? 40, 0, 150),
    alveolarOxygenFraction: clamp(initial.alveolarOxygenFraction ?? 0.16, 0.01, 0.95),
    spo2Percent: clamp(initial.spo2Percent ?? 98, 50, 100),
  }
}

export function stepRespiratoryPhysiology(
  previousState: RespiratoryPhysiologyState,
  input: RespiratoryPhysiologyInput,
  deltaTimeSeconds: number,
): { state: RespiratoryPhysiologyState; output: RespiratoryPhysiologyOutput } {
  const dt = Math.max(0, deltaTimeSeconds)
  const ventilation = calculateAlveolarVentilation(input.respiratoryRate, input.tidalVolumeMl, input.deadSpaceMl)
  const co2Production = Math.max(input.co2ProductionMlMin, 0)
  const oxygenConsumption = Math.max(input.oxygenConsumptionMlMin, 0)

  const { alveolarCo2MmHg } = advanceAlveolarCo2({
    previousAlveolarCo2MmHg: previousState.alveolarCo2MmHg,
    respiratoryRate: input.respiratoryRate,
    tidalVolumeMl: input.tidalVolumeMl,
    deadSpaceMl: input.deadSpaceMl,
    co2ProductionMlMin: co2Production,
    sex: input.sex,
    heightCm: input.heightCm,
    deltaSeconds: dt,
  })

  const { alveolarOxygenFraction, spo2Percent } = advanceOxygenation({
    ...input,
    alveolarOxygenFraction: previousState.alveolarOxygenFraction,
    spo2Percent: previousState.spo2Percent,
    deltaSeconds: dt,
  })

  const state: RespiratoryPhysiologyState = { alveolarCo2MmHg, alveolarOxygenFraction, spo2Percent }
  const output: RespiratoryPhysiologyOutput = {
    respiratoryRate: clamp(input.respiratoryRate, 0, 80),
    tidalVolumeMl: Math.max(0, input.tidalVolumeMl),
    deadSpaceMl: clamp(input.deadSpaceMl, 0, Math.max(0, input.tidalVolumeMl)),
    alveolarTidalVolumeMl: ventilation.alveolarTidalVolumeMl,
    minuteVentilationLMin: ventilation.minuteVentilationLMin,
    alveolarVentilationLMin: ventilation.alveolarVentilationLMin,
    oxygenConsumptionMlMin: oxygenConsumption,
    co2ProductionMlMin: co2Production,
    alveolarCo2MmHg,
    paCo2MmHg: alveolarCo2MmHg,
    // The shared physiology layer supplies the gas-exchange target. Product
    // waveform renderers may add an arterial-to-end-tidal gradient later.
    estimatedEtCo2MmHg: alveolarCo2MmHg,
    alveolarOxygenFraction,
    paO2MmHg: oxygenTensionFromSaturation(spo2Percent),
    spo2Percent,
  }

  return { state, output }
}
