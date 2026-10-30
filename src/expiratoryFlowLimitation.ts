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
 * Instead, severity controls how restrictive/flat the maximum-expiratory-flow
 * envelope becomes, while the existing expiratory-resistance setting provides
 * a continuous airway-involvement signal. High Rexp therefore biases the
 * envelope toward the early-airway/dog-leg phenotype without conflating airway
 * resistance itself with EFL severity.
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

  // Separate airway calibre from EFL severity. The paper found early EFL mainly
  // in patients with airway involvement and late EFL mainly in non-airway
  // disease. Rexp therefore biases morphology, while the EFL score retains its
  // own independent effect on the choke-flow envelope.
  const airwayInvolvement = clamp((Math.max(patient.expiratoryResistance, 0) - 10) / 30, 0, 1)

  // Preserve a genuinely mild lower end of the five-position control. The
  // previous envelope approached only ~0.73 L/s at 500 mL even as severity
  // approached zero, so the first non-zero step behaved like substantial EFL.
  // The revised high-flow endpoint starts above normal passive expiratory demand
  // and converges non-linearly onto the same severe envelope at severity 1.0.
  const severityGain = Math.pow(severity, 1.4)
  const lowVolumeCeilingLs = Math.max(0.04, (0.55 - 0.50 * severityGain) * sizeScale)
  const volumeSlopePerSecond = Math.max(0.22, (1.40 - 1.13 * severityGain) * sizeScale)

  // In airway disease, dynamic compression should remain distinct from the
  // linear expiratory-resistance term. Otherwise high Rexp can reduce requested
  // flow below the EFL ceiling and make even a severe EFL setting do nothing.
  const airwayCollapseFactor = clamp(1 - 1.8 * airwayInvolvement * severityGain, 0.35, 1)

  // Preserve the physiologic early expiratory spike/elbow at all EFL severities,
  // not only when Rexp is high. Dynamic airway compression is not instantaneous:
  // at high lung volume the opening phase of expiration can briefly carry more
  // flow before the choke point dominates. As volume falls through the elbow,
  // this relief disappears rapidly and the breath settles onto the flatter
  // maximum-expiratory-flow envelope. Airway involvement accentuates the effect.
  const referenceTidalVolumeL = clamp((pbw * 7) / 1000, 0.18, 0.75)
  const elbowVolumeL = referenceTidalVolumeL * (0.65 + 0.20 * airwayInvolvement)
  const volumeAboveElbowL = Math.max(0, volumeL - elbowVolumeL)
  const genericEarlySpikeReliefLs = severityGain * 1.25 * volumeAboveElbowL
  const airwayEarlySpikeReliefLs =
    airwayInvolvement * severityGain * (0.75 + 0.35 * airwayInvolvement) * volumeAboveElbowL

  const baseCeilingLs = (lowVolumeCeilingLs + volumeSlopePerSecond * volumeL) * airwayCollapseFactor
  const ceilingLs = baseCeilingLs + genericEarlySpikeReliefLs + airwayEarlySpikeReliefLs

  const requestedMagnitude = -requestedFlowLs
  if (requestedMagnitude <= 1e-9) {
    return { flowLs: requestedFlowLs, limited: false, ceilingLs }
  }

  // Smoothly approach the maximum-expiratory-flow envelope with a monotone
  // generalised soft minimum. This preserves the v0.83.0.63 fix that removed
  // the non-physiological mid-expiratory hump created by the old smoothstep band.
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
