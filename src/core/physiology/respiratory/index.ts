export {
  calculateAlveolarVentilation,
  createRespiratoryPhysiologyState,
  oxygenContentForSaturation,
  oxygenTensionFromSaturation,
  predictedBodyWeightKg,
  saturationFromOxygenTension,
  stepRespiratoryPhysiology,
  targetSpO2FromAlveolarFraction,
} from './RespiratoryPhysiology'

export type {
  RespiratoryPhysiologyInput,
  RespiratoryPhysiologyOutput,
  RespiratoryPhysiologyState,
} from './RespiratoryPhysiology'
