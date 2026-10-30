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

  const inspiratoryResistance = Math.max(patient.resistance, 0.5)
  const expiratoryResistance = Math.max(patient.expiratoryResistance, 0.5)
  const airwayInvolvement = clamp((expiratoryResistance - 10) / 30, 0, 1)
  const severityGain = Math.pow(severity, 1.4)
  const lowVolumeCeilingLs = Math.max(0.04, (0.55 - 0.50 * severityGain) * sizeScale)
  const volumeSlopePerSecond = Math.max(0.22, (1.40 - 1.13 * severityGain) * sizeScale)
  const airwayCollapseFactor = clamp(1 - 1.8 * airwayInvolvement * severityGain, 0.35, 1)

  const referenceTidalVolumeL = clamp((pbw * 7) / 1000, 0.18, 0.75)
  const volumeFractionOfReference = volumeL / Math.max(referenceTidalVolumeL, 0.05)
  const lowAirwayWeight = (1 - airwayInvolvement) ** 3

  // Mild-to-marked EFL (including the common 0.75 teaching setting): make the
  // opening spike reachable at ordinary 400-500 mL end-inspiratory volumes, but
  // let it collapse steeply over the first part of expiration.
  const markedOpeningFraction = clamp((volumeFractionOfReference - 0.55) / 0.45, 0, 1)
  const markedOpeningWeight = markedOpeningFraction ** 4
  const markedSpikeGain = severityGain * (1 - 0.45 * severityGain)
  const markedGenericReliefLs =
    0.35 * sizeScale * lowAirwayWeight * markedSpikeGain * markedOpeningWeight

  // Very severe EFL retains the v0.83.0.64 calibration that already passed the
  // dedicated severe-spike, incomplete-emptying and auto-PEEP regressions. This
  // branch prevents the marked-EFL morphology fix from erasing severe trapping.
  const severeElbowVolumeL = referenceTidalVolumeL * 0.78
  const severeHighVolumeWidthL = Math.max(referenceTidalVolumeL * 0.36, 0.07)
  const severeVolumeAboveElbowL = Math.max(0, volumeL - severeElbowVolumeL)
  const severeHighVolumeFraction = clamp(severeVolumeAboveElbowL / severeHighVolumeWidthL, 0, 1)
  const severeHighVolumeWeight = severeHighVolumeFraction ** 12
  const severeSpikeGain = severityGain * (1 - 0.8 * severityGain)
  const severeGenericReliefLs =
    lowAirwayWeight * severeSpikeGain * 5.0 * severeVolumeAboveElbowL * severeHighVolumeWeight

  const severeBlend = clamp((severity - 0.85) / 0.15, 0, 1)
  const genericEarlySpikeReliefLs =
    markedGenericReliefLs * (1 - severeBlend) + severeGenericReliefLs * severeBlend

  // Airway-disease phenotype: higher Rexp adds an early dog-leg component but
  // remains distinct from EFL severity itself. At very high lung volume, before
  // dynamic expiratory narrowing is fully established, the opening segment is
  // allowed to behave closer to the less-collapsed inspiratory airway calibre.
  // This is restricted to EFL breaths and disappears rapidly as lung volume
  // falls, so ordinary non-EFL high-resistance expiration is unchanged.
  const airwayElbowVolumeL = referenceTidalVolumeL * (0.65 + 0.20 * airwayInvolvement)
  const airwayVolumeAboveElbowL = Math.max(0, volumeL - airwayElbowVolumeL)
  const airwayOpeningFraction = clamp((volumeFractionOfReference - 1.05) / 0.25, 0, 1)
  const airwayOpeningWeight = airwayOpeningFraction ** 2
  const airwayEarlySpikeReliefLs =
    airwayInvolvement * severityGain * (0.75 + 0.35 * airwayInvolvement) * airwayVolumeAboveElbowL
  const airwayOpeningExtraReliefLs =
    0.15 * sizeScale * airwayInvolvement * severityGain * airwayOpeningWeight
  const earlyFlowSpikeReliefLs =
    genericEarlySpikeReliefLs + airwayEarlySpikeReliefLs + airwayOpeningExtraReliefLs

  const baseCeilingLs = (lowVolumeCeilingLs + volumeSlopePerSecond * volumeL) * airwayCollapseFactor
  const ceilingLs = baseCeilingLs + earlyFlowSpikeReliefLs

  const requestedMagnitude = -requestedFlowLs
  if (requestedMagnitude <= 1e-9) {
    return { flowLs: requestedFlowLs, limited: false, ceilingLs }
  }

  // Rexp is a late-expiratory/dynamic airway property in this model. During the
  // brief high-volume opening segment, reconstruct the same elastic recoil with
  // an airway calibre between Rexp and Rin. This lets high-Rexp asthma show the
  // expected initial dog-leg before the higher expiratory resistance takes over;
  // the EFL envelope still caps that opening demand.
  const openAirwayResistanceRatio = clamp(expiratoryResistance / inspiratoryResistance, 1, 2.5)
  const openAirwayRequestedMagnitude = requestedMagnitude * openAirwayResistanceRatio
  const effectiveRequestedMagnitude = requestedMagnitude +
    (openAirwayRequestedMagnitude - requestedMagnitude) * airwayInvolvement * airwayOpeningWeight

  // Monotone soft cap: approach the maximum-flow envelope without an S-shaped
  // blend that can create a secondary mid-expiratory hump.
  const blendWidth = Math.max(ceilingLs * 0.15, 0.015)
  const relativeBlendWidth = clamp(blendWidth / Math.max(ceilingLs, 1e-6), 0.08, 0.4)
  const softCapPower = clamp(2 / relativeBlendWidth, 8, 20)
  const ratio = effectiveRequestedMagnitude / Math.max(ceilingLs, 1e-9)
  const limitedMagnitude = ceilingLs * Math.pow(Math.pow(ratio, -softCapPower) + 1, -1 / softCapPower)
  const limited = limitedMagnitude < effectiveRequestedMagnitude * 0.995

  return {
    flowLs: -limitedMagnitude,
    limited,
    ceilingLs,
  }
}
