import type { PatientSettings } from './simulation/types'
import { calculatePredictedBodyWeight } from './patientMetrics'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export interface ExpiratoryFlowLimitResult {
  flowLs: number
  limited: boolean
  ceilingLs: number | null
}

/**
 * Approximate effort-independent expiratory flow limitation.
 *
 * The ordinary single-compartment model gives flow = -V/(Rexp*C), so greater
 * trapped volume always creates proportionally greater expiratory flow. In
 * obstructive disease that becomes unrealistic once dynamic airway compression
 * creates a choke point. We therefore cap negative flow with a simple
 * volume-dependent maximum-expiratory-flow envelope. The envelope rises with
 * lung volume, allowing a new hyperinflated equilibrium rather than unlimited
 * volume accumulation, while becoming progressively flatter as severity rises.
 *
 * Severity 0 leaves the linear RC model unchanged.
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

  // A simplified maximum-expiratory-flow/volume envelope. At severe settings
  // the pressure-independent portion dominates; at higher lung volumes the
  // ceiling still rises enough for a stable EELV to exist.
  const lowVolumeCeilingLs = Math.max(0.03, (0.14 - 0.10 * severity) * sizeScale)
  const volumeSlopePerSecond = Math.max(0.12, (0.38 - 0.13 * severity) * sizeScale)
  const ceilingLs = lowVolumeCeilingLs + volumeSlopePerSecond * Math.max(volumeAboveSetPeepL, 0)

  const requestedMagnitude = -requestedFlowLs
  const limitedMagnitude = Math.min(requestedMagnitude, ceilingLs)
  return {
    flowLs: -limitedMagnitude,
    limited: requestedMagnitude > ceilingLs + 1e-6,
    ceilingLs,
  }
}
