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

  const referenceTidalVolumeL = clamp((pbw * 7) / 1000, 0.18, 0.75)
  const volumeFractionOfReference = volumeL / Math.max(referenceTidalVolumeL, 0.05)

  // Generic EFL morphology: preserve a short opening expiratory spike at high
  // lung volume, then collapse rapidly onto the choke-flow limb. The previous
  // 12th-power gate only activated when volume was unrealistically close to the
  // top of its configured range, so ordinary PC breaths around 400-500 mL could
  // be clipped onto the low-flow limb immediately. This gate is deliberately
  // reachable at a normal end-inspiratory volume but decays steeply once roughly
  // the first 50-100 mL have left the lung.
  const genericOpeningFraction = clamp((volumeFractionOfReference - 0.55) / 0.45, 0, 1)
  const genericOpeningWeight = genericOpeningFraction ** 4
  const lowAirwayWeight = (1 - airwayInvolvement) ** 3
  const genericSpikeGain = severityGain * (1 - 0.45 * severityGain)
  const genericEarlySpikeReliefLs =
    0.35 * sizeScale * lowAirwayWeight * genericSpikeGain * genericOpeningWeight

  // Airway-disease phenotype: higher Rexp adds an early dog-leg component but
  // remains distinct from EFL severity itself. This term disappears as volume
  // falls below the airway elbow, leaving the flatter effort-independent limb.
  const airwayElbowVolumeL = referenceTidalVolumeL * (0.65 + 0.20 * airwayInvolvement)
  const airwayVolumeAboveElbowL = Math.max(0, volumeL - airwayElbowVolumeL)
  const airwayEarlySpikeReliefLs =
    airwayInvolvement * severityGain * (0.75 + 0.35 * airwayInvolvement) * airwayVolumeAboveElbowL

  const baseCeilingLs = (lowVolumeCeilingLs + volumeSlopePerSecond * volumeL) * airwayCollapseFactor
  const ceilingLs = baseCeilingLs + genericEarlySpikeReliefLs + airwayEarlySpikeReliefLs

  const requestedMagnitude = -requestedFlowLs
  if (requestedMagnitude <= 1e-9) {
    return { flowLs: requestedFlowLs, limited: false, ceilingLs }
  }

  // Monotone soft cap: approach the maximum-flow envelope without an S-shaped
  // blend that can create a secondary mid-expiratory hump.
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
