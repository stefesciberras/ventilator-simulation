/**
 * Pure shared respiratory CO2 kinetics, used by v1 EDUMON gas exchange and
 * experimental v2 session authority. Values are educational model outputs.
 *
 * This intentionally covers the same alveolar CO2 mass-balance path already
 * used by the v1 core. Oxygenation and waveform phase are separate milestones.
 */
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))
export function alveolarVentilationFromBreathing({ respiratoryRate, tidalVolumeMl, deadSpaceMl }) {
  if (![respiratoryRate, tidalVolumeMl, deadSpaceMl].every(Number.isFinite)) throw Error('invalid-ventilation')
  const rate = clamp(respiratoryRate, 0, 80)
  const tidal = Math.max(0, tidalVolumeMl)
  const dead = clamp(deadSpaceMl, 0, tidal)
  return { respiratoryRate: rate, tidalVolumeMl: tidal, deadSpaceMl: dead,
    minuteVentilationLMin: tidal * rate / 1000,
    alveolarVentilationLMin: Math.max(0, tidal - dead) * rate / 1000 }
}
export function advanceAlveolarCo2({ previousAlveolarCo2MmHg, respiratoryRate,
  tidalVolumeMl, deadSpaceMl, co2ProductionMlMin = 250,
  sex = 'male', heightCm = 170, deltaSeconds }) {
  if (![previousAlveolarCo2MmHg, co2ProductionMlMin, heightCm, deltaSeconds].every(Number.isFinite) ||
      deltaSeconds < 0 || deltaSeconds > 60 || !['male','female'].includes(sex)) throw Error('invalid-co2-input')
  const ventilation = alveolarVentilationFromBreathing({ respiratoryRate, tidalVolumeMl, deadSpaceMl })
  const pbw = Math.max(20, (sex === 'female' ? 45.5 : 50) + 0.91 * (heightCm - 152.4))
  const bufferCapacityL = Math.max(15, pbw * 0.55)
  const eliminatedCo2MlMin = ventilation.alveolarVentilationLMin * previousAlveolarCo2MmHg / 0.863
  const netCo2MlMin = Math.max(0, co2ProductionMlMin) - eliminatedCo2MlMin
  const deltaCo2 = (0.863 * netCo2MlMin / bufferCapacityL / 60) * deltaSeconds
  const alveolarCo2MmHg = clamp(previousAlveolarCo2MmHg + deltaCo2, 0, 150)
  return { ...ventilation, alveolarCo2MmHg, estimatedEtCo2MmHg: alveolarCo2MmHg }
}
