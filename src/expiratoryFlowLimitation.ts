import type { PatientSettings } from './simulation/types'
import { calculatePredictedBodyWeight } from './patientMetrics'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export interface ExpiratoryFlowLimitResult {
  flowLs: number
  limited: boolean
  ceilingLs: number | null
}

/**
 * Approximate effort-independent expiratory flow limitation (EFL).
 *
 * `patient.expiratoryFlowLimitation` is a dimensionless SEVERITY SCORE:
 *   0.0 = no EFL
 *   1.0 = very severe EFL
 * It is deliberately not a percentage reduction in expiratory flow.
 *
 * The model is informed by Junhasavasdikul et al. (Crit Care 2024;
 * doi:10.1186/s13054-024-04953-9), who describe two useful physiological
 * patterns during mechanical ventilation:
 *   - early EFL, associated mainly with airway disease and sometimes showing
 *     an initial expiratory-flow spike followed by a flatter low-flow segment;
 *   - late EFL, in which expiration initially resembles the unrestricted
 *     resistance curve and becomes flow-limited later in expiration.
 *
 * The displayed morphology also follows the classic ventilator-waveform pattern
 * illustrated by Flynn et al. (Anesthesiology 2022;137:85-92): rapid early
 * expiratory flow followed by a smooth, flattened flow-limited return toward
 * zero rather than a secondary artificial shoulder.
 *
 * We do not claim that the 0-1 score is clinically calibrated to either study.
 */
export function applyExpiratoryFlowLimitation(
  requestedFlowLs: number,
  volumeAboveSetPeepL: number,
  patient: PatientSettings,
): ExpiratoryFlowLimitResult {
  if (requestedFlowLs >= 0) return { flowLs: requestedFlowLs, limited: false, ceilingLs: null }

  const severity = clamp(patient.expiratoryFlowLimitation ?? 0, 0, 1)
  if (severity <= 0.001) return { flowLs: requestedFlowLs, limited: false, ceilingLs: null }

  const pbw = calculatePredictedBodyWeight(patient.sex ?? 'male', patient.heightCm ?? 170)
  const sizeScale = clamp(Math.sqrt(pbw / 66), 0.55, 1.35)
  const volumeL = Math.max(volumeAboveSetPeepL, 0)

  const airwayInvolvement = clamp((Math.max(patient.expiratoryResistance, 0) - 10) / 30, 0, 1)

  const severityGain = Math.pow(severity, 1.4)
  const lowVolumeCeilingLs = Math.max(0.04, (0.55 - 0.50 * severityGain) * sizeScale)
  const volumeSlopePerSecond = Math.max(0.22, (1.40 - 1.13 * severityGain) * sizeScale)
  const airwayCollapseFactor = clamp(1 - 1.8 * airwayInvolvement * severityGain, 0.35, 1)

  // Preserve a physiologic early expiratory spike/elbow at all EFL severities.
  // Spike prominence is deliberately not proportional to EFL severity. At the
  // most severe setting the choke point dominates earlier, so the opening spike
  // remains visible but is smaller than at intermediate/marked EFL.
  const referenceTidalVolumeL = clamp((pbw * 7) / 1000, 0.18, 0.75)
  const airwayElbowVolumeL = referenceTidalVolumeL * (0.65 + 0.20 * airwayInvolvement)
  const airwayVolumeAboveElbowL = Math.max(0, volumeL - airwayElbowVolumeL)

  // For low-Rexp EFL, use a steep high-volume weighting instead of a hard
  // threshold. This allows a visible opening spike in pressure-controlled breaths
  // even after auto-PEEP has altered steady-state volume, but makes the extra flow
  // allowance collapse rapidly as expiration proceeds. The cubic weighting keeps
  // its contribution negligible through the mid/late expiratory limb, preserving
  // severe-EFL trapping and the flat choke-flow morphology.
  const genericElbowVolumeL = referenceTidalVolumeL * 0.65
  const genericVolumeAboveElbowL = Math.max(0, volumeL - genericElbowVolumeL)
  const genericHighVolumeWidthL = Math.max(referenceTidalVolumeL * 0.35, 0.06)
  const genericHighVolumeFraction = clamp(genericVolumeAboveElbowL / genericHighVolumeWidthL, 0, 1)
  const genericHighVolumeWeight = genericHighVolumeFraction ** 3

  const genericSpikeGain = severityGain * (1 - 0.8 * severityGain)
  const genericEarlySpikeReliefLs =
    (1 - airwayInvolvement) * genericSpikeGain * 3.0 * genericVolumeAboveElbowL * genericHighVolumeWeight
  const airwayEarlySpikeReliefLs =
    airwayInvolvement * severityGain * (0.75 + 0.35 * airwayInvolvement) * airwayVolumeAboveElbowL
  const earlyFlowSpikeReliefLs = genericEarlySpikeReliefLs + airwayEarlySpikeReliefLs

  const baseCeilingLs = (lowVolumeCeilingLs + volumeSlopePerSecond * volumeL) * airwayCollapseFactor
  const ceilingLs = baseCeilingLs + earlyFlowSpikeReliefLs

  const requestedMagnitude = -requestedFlowLs
  if (requestedMagnitude <= 1e-9) {
    return { flowLs: requestedFlowLs, limited: false, ceilingLs }
  }

  // Retain the monotone soft cap introduced in v0.83.0.63 so the early elbow
  // cannot reintroduce the artificial mid-expiratory hump/shoulder.
  const blendWidth = Math.max(ceilingLs * 0.15, 0.015)
  const relativeBlendWidth = clamp(blendWidth / Math.max(ceilingLs, 1e-6), 0.08, 0.4)
  const softCapPower = clamp(2 / relativeBlendWidth, 8, 20)
  const ratio = requestedMagnitude / Math.max(ceilingLs, 1e-9)
  const limitedMagnitude = ceilingLs * Math.pow(Math.pow(ratio, -softCapPower) + 1, -1 / softCapPower)
  const limited = limitedMagnitude < requestedMagnitude * 0.995

  return {
    flowLs: -limitedMagnitude,
    limited,
    ceilingLs,
  }
}
