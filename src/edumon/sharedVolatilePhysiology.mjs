/**
 * Pure volatile-agent uptake and MAC/depth functions shared by v1 Anaesth
 * gas UI and Session Engine v2. No browser clock, globals or side effects.
 *
 * Educational single-compartment approximation, NOT clinical PK/PD.
 * Caller supplies effective alveolar ventilation from its own model.
 */
export const SEVO_MAC_PERCENT = 2
const clamp = (x, min, max) => Math.min(max, Math.max(min, x))
export function anaestheticDepthFromMac(mac, sensitivity = 0) {
  const effectiveMac = Math.max(0, mac) * (1 + 0.5 * clamp(sensitivity, -1, 1))
  return clamp(Math.round(5 - 2 * effectiveMac), 1, 5)
}
export function effectiveSevoDepth(etSevoPercent, sensitivity = 0) {
  return anaestheticDepthFromMac(etSevoPercent / SEVO_MAC_PERCENT, sensitivity)
}
export function advanceEndTidalSevo({ etSevoPercent, fiSevoPercent,
  alveolarVentilationLMin, frcMl, dtSeconds }) {
  if (![etSevoPercent, fiSevoPercent, alveolarVentilationLMin, frcMl, dtSeconds]
    .every(value => Number.isFinite(value)) ||
    alveolarVentilationLMin < 0 || frcMl <= 0 || dtSeconds < 0 || dtSeconds > 60) {
    throw new Error('Invalid volatile uptake input')
  }
  const frcL = Math.max(0.5, frcMl / 1000)
  const turnoverPerSecond = alveolarVentilationLMin / 60 / frcL
  const timeConstant = Math.max(8, 1 / Math.max(turnoverPerSecond * 0.62, 1 / 180))
  const fraction = 1 - Math.exp(-dtSeconds / timeConstant)
  return clamp(etSevoPercent + (fiSevoPercent - etSevoPercent) * fraction, 0, 8)
}
export function estimatedAlveolarVentilationLMin(respiratory) {
  const tidalVolumeMl = respiratory?.tidalVolumeMl ?? 500
  const deadSpaceMl = respiratory?.deadSpaceMl ?? 150
  const respiratoryRate = respiratory?.respiratoryRate ?? 12
  if (![tidalVolumeMl, deadSpaceMl, respiratoryRate].every(Number.isFinite)) {
    throw new Error('Invalid respiratory state')
  }
  return Math.max(0, (tidalVolumeMl - deadSpaceMl) * respiratoryRate / 1000)
}
