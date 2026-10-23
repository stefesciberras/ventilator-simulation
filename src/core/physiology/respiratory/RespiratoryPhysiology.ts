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
  // This preserves the EDUVENT teaching model: obstruction contributes a small
  // V/Q penalty, PEEP can recruit shunt in low-compliance lungs, and systemic
  // oxygen extraction determines how strongly shunt lowers arterial content.
  const obstructionPenalty = clamp((input.expiratoryResistanceCmH2OLs - 8) / 32, 0, 1) * 0.018
  const effectiveFraction = clamp(alveolarFraction - obstructionPenalty, 0.01, 0.95)
  const endCapillaryPo2 = clamp(effectiveFraction * 650, 20, 650)
  const ventilatedSaturation = clamp(saturationFromOxygenTension(endCapillaryPo2), 50, 100)

  const baselineShunt = clamp(input.shuntFraction, 0, 0.5)
  const recruitability = clamp((60 - input.complianceMlPerCmH2O) / 45, 0, 1)
  const peepRecruitment = 0.55 * recruitability * clamp((input.peepCmH2O - 5) / 10, 0, 1)
  const effectiveShunt = baselineShunt * (1 - peepRecruitment)

  const haemoglobin = 15
  const oxygenCapacity = 1.34 * haemoglobin
  const ventilatedContent = oxygenCapacity * (ventilatedSaturation / 100) + 0.003 * endCapillaryPo2
  const cardiacOutputLMin = Math.max(input.referenceCardiacOutputLMin ?? 5, 0.1)
  const oxygenExtractionMlDl = Math.max(input.oxygenConsumptionMlMin, 0) / cardiacOutputLMin / 10
  const shuntContentPenalty = effectiveShunt >= 0.999
    ? ventilatedContent
    : (effectiveShunt / Math.max(1 - effectiveShunt, 0.001)) * oxygenExtractionMlDl
  const arterialContent = clamp(
    ventilatedContent - shuntContentPenalty,
    oxygenContentForSaturation(50),
    ventilatedContent,
  )

  let low = 50
  let high = 100
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const mid = (low + high) / 2
    if (oxygenContentForSaturation(mid) < arterialContent) low = mid
    else high = mid
  }
  const physiologicalSaturation = clamp((low + high) / 2, 50, 100)
  return Math.min(physiologicalSaturation, clamp(input.maxSpO2, 80, 100))
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

  const pbw = predictedBodyWeightKg(input.sex, input.heightCm)
  const co2BufferCapacityL = Math.max(15, pbw * 0.55)
  const eliminatedCo2MlMin = ventilation.alveolarVentilationLMin * previousState.alveolarCo2MmHg / 0.863
  const netCo2MlMin = co2Production - eliminatedCo2MlMin
  const changeMmHgPerMinute = 0.863 * netCo2MlMin / co2BufferCapacityL
  const alveolarCo2MmHg = clamp(
    previousState.alveolarCo2MmHg + (changeMmHgPerMinute / 60) * dt,
    0,
    150,
  )

  const frcL = clamp(Math.max(input.frcMl, 500) / 1000, 0.5, 8)
  const inspiredOxygenFraction = clamp(input.fio2, 0.21, 1)
  const oxygenConsumptionLs = oxygenConsumption / 1000 / 60
  const turnoverPerSecond = ventilation.alveolarVentilationLMin / 60 / frcL
  const metabolicDepletionPerSecond = oxygenConsumptionLs / frcL
  const oxygenDerivative = turnoverPerSecond * (inspiredOxygenFraction - previousState.alveolarOxygenFraction)
    - metabolicDepletionPerSecond
  const alveolarOxygenFraction = clamp(
    previousState.alveolarOxygenFraction + oxygenDerivative * dt,
    0.01,
    0.95,
  )

  const targetSpO2 = targetSpO2FromAlveolarFraction(alveolarOxygenFraction, input)
  const pulseOximeterResponseSeconds = targetSpO2 < previousState.spo2Percent ? 2.5 : 4
  const responseFraction = 1 - Math.exp(-dt / pulseOximeterResponseSeconds)
  const spo2Percent = clamp(
    previousState.spo2Percent + (targetSpO2 - previousState.spo2Percent) * responseFraction,
    50,
    100,
  )

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
