import type { PatientSettings } from './types'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * EDUVENT-only spontaneous breathing and patient/ventilator interaction mechanics.
 *
 * This module deliberately lives under src/simulation rather than the shared
 * EDUSIM respiratory physiology core. EDUMON/Anaesth consumes the shared gas
 * exchange core independently and must not inherit ventilator pneumatic
 * behaviour from EDUVENT.
 */

export interface PressureDemandInput {
  peepCmH2O: number
  targetAssistPressureCmH2O: number
  musclePressureCmH2O: number
  volumeAbovePeepL: number
  complianceLPerCmH2O: number
  airwayResistanceCmH2OPerLs: number
  sourceResistanceCmH2OPerLs?: number
}

export interface PressureDemandResult {
  flowLs: number
  airwayPressureCmH2O: number
  elasticPressureCmH2O: number
  idealInfiniteSourceFlowLs: number
  sourcePressureDropCmH2O: number
}

export interface PressureLevelInteractionInput extends PressureDemandInput {
  expiratoryResistanceCmH2OPerLs: number
}

export interface PressureLevelInteractionResult extends PressureDemandResult {
  inspiratory: boolean
}

export interface FlowControlledPressureInput {
  peepCmH2O: number
  commandedFlowLs: number
  musclePressureCmH2O: number
  volumeAbovePeepL: number
  complianceLPerCmH2O: number
  airwayResistanceCmH2OPerLs: number
}

export interface FlowControlledPressureResult {
  airwayPressureCmH2O: number
  elasticPressureCmH2O: number
  resistivePressureCmH2O: number
}

/**
 * Effective source impedance of the ventilator demand valve/circuit during
 * pressure-targeted ventilation. This keeps ordinary flow close to the ideal
 * equation-of-motion solution, but prevents an infinitely stiff pressure source
 * from generating very large instantaneous flow when patient demand is high.
 */
export const DEFAULT_PRESSURE_SOURCE_RESISTANCE = 2

/**
 * Time-varying inspiratory muscle pressure. `effort` is peak Pmus in cmH2O;
 * positive values represent inspiratory muscle pressure available to the lung.
 */
export function patientMusclePressure(t: number, patient: PatientSettings): number {
  if (patient.spontaneousRate <= 0 || patient.effort <= 0) return 0
  const cycle = 60 / patient.spontaneousRate
  const phase = ((t % cycle) + cycle) % cycle
  const neuralTi = Math.max(patient.neuralInspiratoryTime, 0.1)
  if (phase >= neuralTi) return 0

  let riseTime = neuralTi * clamp(patient.effortRisePercent ?? 30, 1, 95) / 100
  let relaxationTime = neuralTi * clamp(patient.effortRelaxationPercent ?? 35, 1, 95) / 100
  const edgeTime = riseTime + relaxationTime
  if (edgeTime > neuralTi) {
    const scale = neuralTi / edgeTime
    riseTime *= scale
    relaxationTime *= scale
  }
  const relaxationStart = neuralTi - relaxationTime

  if (phase < riseTime) {
    const x = phase / Math.max(riseTime, 0.001)
    const shape = 0.5 - 0.5 * Math.cos(Math.PI * x)
    return patient.effort * shape
  }

  if (phase < relaxationStart) return patient.effort

  const x = (phase - relaxationStart) / Math.max(relaxationTime, 0.001)
  const shape = 0.5 + 0.5 * Math.cos(Math.PI * clamp(x, 0, 1))
  return patient.effort * shape
}

/**
 * Solve a pressure-targeted breath with a finite-impedance demand source.
 * The same controller is used by spontaneous pressure support and mandatory
 * pressure-controlled breaths so patient effort interacts with the pressure
 * source consistently across modes.
 */
export function solvePressureDemand(input: PressureDemandInput): PressureDemandResult {
  const compliance = Math.max(input.complianceLPerCmH2O, 0.001)
  const airwayResistance = Math.max(input.airwayResistanceCmH2OPerLs, 0.5)
  const sourceResistance = Math.max(input.sourceResistanceCmH2OPerLs ?? DEFAULT_PRESSURE_SOURCE_RESISTANCE, 0)
  const elasticPressure = Math.max(input.volumeAbovePeepL, 0) / compliance
  const netDrivingPressure = input.targetAssistPressureCmH2O + input.musclePressureCmH2O - elasticPressure
  const idealInfiniteSourceFlowLs = Math.max(0, netDrivingPressure / airwayResistance)
  const flowLs = Math.max(0, netDrivingPressure / (airwayResistance + sourceResistance))
  const sourcePressureDrop = sourceResistance * flowLs
  const airwayPressure = input.peepCmH2O + input.targetAssistPressureCmH2O - sourcePressureDrop

  return {
    flowLs,
    airwayPressureCmH2O: airwayPressure,
    elasticPressureCmH2O: elasticPressure,
    idealInfiniteSourceFlowLs,
    sourcePressureDropCmH2O: sourcePressureDrop,
  }
}

/**
 * Solve spontaneous breathing around a maintained pressure level (APRV/BIPAP).
 * Inspiratory demand uses the same finite-source controller as PSV/PC. If lung
 * recoil exceeds pressure support + Pmus, flow is allowed to reverse through the
 * expiratory resistance so release flow and spontaneous expiration are retained.
 */
export function solvePressureLevelInteraction(input: PressureLevelInteractionInput): PressureLevelInteractionResult {
  const compliance = Math.max(input.complianceLPerCmH2O, 0.001)
  const inspiratoryResistance = Math.max(input.airwayResistanceCmH2OPerLs, 0.5)
  const expiratoryResistance = Math.max(input.expiratoryResistanceCmH2OPerLs, 0.5)
  const sourceResistance = Math.max(input.sourceResistanceCmH2OPerLs ?? DEFAULT_PRESSURE_SOURCE_RESISTANCE, 0)
  const elasticPressure = Math.max(input.volumeAbovePeepL, 0) / compliance
  const netDrivingPressure = input.targetAssistPressureCmH2O + input.musclePressureCmH2O - elasticPressure
  const inspiratory = netDrivingPressure >= 0

  if (inspiratory) {
    const idealInfiniteSourceFlowLs = netDrivingPressure / inspiratoryResistance
    const flowLs = netDrivingPressure / (inspiratoryResistance + sourceResistance)
    const sourcePressureDrop = sourceResistance * flowLs
    return {
      flowLs,
      airwayPressureCmH2O: input.peepCmH2O + input.targetAssistPressureCmH2O - sourcePressureDrop,
      elasticPressureCmH2O: elasticPressure,
      idealInfiniteSourceFlowLs,
      sourcePressureDropCmH2O: sourcePressureDrop,
      inspiratory: true,
    }
  }

  return {
    flowLs: netDrivingPressure / expiratoryResistance,
    airwayPressureCmH2O: input.peepCmH2O + input.targetAssistPressureCmH2O,
    elasticPressureCmH2O: elasticPressure,
    idealInfiniteSourceFlowLs: 0,
    sourcePressureDropCmH2O: 0,
    inspiratory: false,
  }
}

/**
 * Solve airway pressure for a volume-controlled breath where ventilator flow is
 * authoritative. Patient effort therefore changes Paw, not delivered flow:
 * Paw = PEEP + Pelastic + Presistive - Pmus.
 */
export function solveFlowControlledPressure(input: FlowControlledPressureInput): FlowControlledPressureResult {
  const compliance = Math.max(input.complianceLPerCmH2O, 0.001)
  const airwayResistance = Math.max(input.airwayResistanceCmH2OPerLs, 0.5)
  const flowLs = Math.max(0, input.commandedFlowLs)
  const elasticPressure = Math.max(input.volumeAbovePeepL, 0) / compliance
  const resistivePressure = airwayResistance * flowLs
  const airwayPressure = input.peepCmH2O + elasticPressure + resistivePressure - input.musclePressureCmH2O

  return {
    airwayPressureCmH2O: airwayPressure,
    elasticPressureCmH2O: elasticPressure,
    resistivePressureCmH2O: resistivePressure,
  }
}

/** Patient-generated trigger signal while the ventilator is at baseline PEEP. */
export function spontaneousTriggerSignal(
  peepCmH2O: number,
  musclePressureCmH2O: number,
  volumeAbovePeepL: number,
  complianceLPerCmH2O: number,
  inspiratoryResistanceCmH2OPerLs: number,
): PressureDemandResult {
  return solvePressureDemand({
    peepCmH2O,
    targetAssistPressureCmH2O: 0,
    musclePressureCmH2O,
    volumeAbovePeepL,
    complianceLPerCmH2O,
    airwayResistanceCmH2OPerLs: inspiratoryResistanceCmH2OPerLs,
  })
}
