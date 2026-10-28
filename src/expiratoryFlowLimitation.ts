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
 * We do not claim that the 0-1 score is clinically calibrated to that study.
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
  // disease. Rexp is therefore used only to bias morphology/onset, not to define
  // the EFL severity score itself.
  const airwayInvolvement = clamp((Math.max(patient.expiratoryResistance, 0) - 10) / 30, 0, 1)

  // Make the lower half of the severity scale genuinely mild/moderate instead
  // of behaving almost like severe clipping. At 1.0 the envelope remains close
  // to the previous severe-obstruction ceiling.
  const severityGain = Math.pow(severity, 1.4)
  const lowVolumeCeilingLs = Math.max(0.04, (0.30 - 0.25 * severityGain) * sizeScale)
  const volumeSlopePerSecond = Math.max(0.22, (0.85 - 0.58 * severityGain) * sizeScale)

  // Airway-type early EFL: permit a brief high-volume flow spike, then lose that
  // extra flow rapidly as lung volume falls through the elbow. This creates the
  // clinically recognisable spike -> flatter low-flow ('dog-leg') morphology
  // described for severe early EFL, while low-Rexp patients retain a smoother
  // late-EFL pattern.
  const referenceTidalVolumeL = clamp((pbw * 7) / 1000, 0.18, 0.75)
  const elbowVolumeL = referenceTidalVolumeL * (0.65 + 0.20 * airwayInvolvement)
  const volumeAboveElbowL = Math.max(0, volumeL - elbowVolumeL)
  const earlyFlowSpikeReliefLs =
    airwayInvolvement * severityGain * (0.75 + 0.35 * airwayInvolvement) * volumeAboveElbowL

  const ceilingLs =
    lowVolumeCeilingLs +
    volumeSlopePerSecond * volumeL +
    earlyFlowSpikeReliefLs

  const requestedMagnitude = -requestedFlowLs

  // Smooth convergence onto the maximum-expiratory-flow envelope. This mirrors
  // the physiological idea that reducing downstream pressure does not increase
  // flow once the choke-flow envelope is reached, but avoids a numerical corner
  // on the displayed waveform.
  const blendWidth = Math.max(ceilingLs * 0.15, 0.015)
  const blendLow = Math.max(0, ceilingLs - blendWidth)
  const blendHigh = ceilingLs + blendWidth
  let limitedMagnitude = requestedMagnitude
  let limited = false

  if (requestedMagnitude >= blendHigh) {
    limitedMagnitude = ceilingLs
    limited = true
  } else if (requestedMagnitude > blendLow) {
    const x = clamp((requestedMagnitude - blendLow) / Math.max(blendHigh - blendLow, 1e-6), 0, 1)
    const smooth = x * x * (3 - 2 * x)
    limitedMagnitude = requestedMagnitude + (ceilingLs - requestedMagnitude) * smooth
    limited = smooth > 0.01
  }

  return {
    flowLs: -limitedMagnitude,
    limited,
    ceilingLs,
  }
}
