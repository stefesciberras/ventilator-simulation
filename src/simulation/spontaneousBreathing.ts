import type { PatientSettings } from './types'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * EDUVENT-only spontaneous breathing mechanics.
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

/**
 * Effective source impedance of the ventilator demand valve/circuit during
 * spontaneous pressure assistance. This keeps ordinary flow close to the ideal
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
 * Solve a spontaneous pressure-assisted breath with a finite-impedance demand
 * source. The source impedance produces a transient Paw droop at high demand,
 * then Paw returns toward the requested support/CPAP target as flow falls.
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
