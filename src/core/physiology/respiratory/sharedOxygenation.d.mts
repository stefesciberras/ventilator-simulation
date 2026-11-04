export interface OxygenationInput {
  alveolarOxygenFraction: number; spo2Percent: number;
  respiratoryRate: number; tidalVolumeMl: number; deadSpaceMl: number;
  fio2: number; frcMl: number; oxygenConsumptionMlMin: number; deltaSeconds: number;
  expiratoryResistanceCmH2OLs: number; shuntFraction: number;
  complianceMlPerCmH2O: number; peepCmH2O: number; maxSpO2: number;
  referenceCardiacOutputLMin?: number
}
export declare function oxygenTensionFromSaturation(saturationPercent: number): number
export declare function saturationFromOxygenTension(po2MmHg: number): number
export declare function oxygenContentForSaturation(saturationPercent: number): number
export declare function targetSpO2FromAlveolarFraction(alveolarFraction: number,
  input: Pick<OxygenationInput, 'expiratoryResistanceCmH2OLs'|'shuntFraction'|'complianceMlPerCmH2O'|'peepCmH2O'|'oxygenConsumptionMlMin'|'referenceCardiacOutputLMin'|'maxSpO2'>): number
export declare function advanceOxygenation(input: OxygenationInput): {
  alveolarOxygenFraction: number; spo2Percent: number; targetSpO2Percent: number
}
