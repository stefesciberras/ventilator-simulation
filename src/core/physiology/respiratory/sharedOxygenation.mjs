/**
 * Pure respiratory oxygenation kernel shared by v1 and Session Engine v2.
 * Preserves the established EDUSIM educational single-compartment oxygen
 * mixing, V/Q, shunt and 2.5s/4s pulse oximeter lag. Not clinical PK/PD.
 */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
export function oxygenTensionFromSaturation(saturationPercent) {
  const saturation = clamp(saturationPercent / 100, 0.001, 0.999)
  return clamp(26.8 * Math.pow(saturation / Math.max(1 - saturation, 0.001), 1 / 2.7), 1, 650)
}
export function oxygenContentForSaturation(saturationPercent) {
  const saturation = clamp(saturationPercent / 100, 0.5, 0.999)
  return 1.34 * 15 * saturation + 0.003 * oxygenTensionFromSaturation(saturationPercent)
}
export function saturationFromOxygenTension(po2MmHg) {
  const po2 = Math.max(po2MmHg, 1)
  return 100 / (1 + Math.pow(26.8 / po2, 2.7))
}
export function targetSpO2FromAlveolarFraction(alveolarFraction, input) {
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
    ? ventilatedContent : (effectiveShunt / Math.max(1 - effectiveShunt, 0.001)) * oxygenExtractionMlDl
  const arterialContent = clamp(
    ventilatedContent - shuntContentPenalty,
    oxygenContentForSaturation(50), ventilatedContent)
  let low = 50
  let high = 100
  for (let iteration = 0; iteration < 24; iteration++) {
    const mid = (low + high) / 2
    if (oxygenContentForSaturation(mid) < arterialContent) low = mid
    else high = mid
  }
  return Math.min(clamp((low + high) / 2, 50, 100), clamp(input.maxSpO2, 80, 100))
}
/** One numerical time step at the same equation and time constants as v1. */
export function advanceOxygenation(input) {
  const { alveolarOxygenFraction, spo2Percent, respiratoryRate, tidalVolumeMl, deadSpaceMl,
    fio2, frcMl, oxygenConsumptionMlMin, deltaSeconds } = input
  if (![alveolarOxygenFraction,spo2Percent,respiratoryRate,tidalVolumeMl,deadSpaceMl,
    fio2,frcMl,oxygenConsumptionMlMin,deltaSeconds].every(Number.isFinite) ||
    deltaSeconds < 0 || deltaSeconds > 60 || frcMl <= 0) throw Error('invalid-oxygenation-input')
  const rate = clamp(respiratoryRate, 0, 80)
  const tidal = Math.max(0, tidalVolumeMl)
  const dead = clamp(deadSpaceMl, 0, tidal)
  const ventilation = Math.max(0, tidal - dead) * rate / 1000
  const frcL = clamp(Math.max(frcMl, 500) / 1000, 0.5, 8)
  const inspiredOxygenFraction = clamp(fio2, 0.21, 1)
  const oxygenConsumption = Math.max(oxygenConsumptionMlMin, 0)
  const metabolicDepletionPerSecond = oxygenConsumption / 1000 / 60 / frcL
  const oxygenDerivative = ventilation / 60 / frcL * (inspiredOxygenFraction - alveolarOxygenFraction)
    - metabolicDepletionPerSecond
  const nextAlveolarFraction = clamp(alveolarOxygenFraction + oxygenDerivative * deltaSeconds, 0.01, 0.95)
  const targetSpO2 = targetSpO2FromAlveolarFraction(nextAlveolarFraction, input)
  const responseSeconds = targetSpO2 < spo2Percent ? 2.5 : 4
  const responseFraction = 1 - Math.exp(-deltaSeconds / responseSeconds)
  return {
    alveolarOxygenFraction: nextAlveolarFraction,
    spo2Percent: clamp(spo2Percent + (targetSpO2 - spo2Percent) * responseFraction, 50, 100),
    targetSpO2Percent: targetSpO2,
  }
}
