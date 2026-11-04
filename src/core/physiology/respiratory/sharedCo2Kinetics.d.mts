export interface BreathingInput { respiratoryRate: number; tidalVolumeMl: number; deadSpaceMl: number }
export declare function alveolarVentilationFromBreathing(input: BreathingInput): {
  respiratoryRate: number; tidalVolumeMl: number; deadSpaceMl: number;
  minuteVentilationLMin: number; alveolarVentilationLMin: number
}
export declare function advanceAlveolarCo2(input: BreathingInput & {
  previousAlveolarCo2MmHg: number; co2ProductionMlMin?: number;
  sex?: 'male' | 'female'; heightCm?: number; deltaSeconds: number;
}): { respiratoryRate: number; tidalVolumeMl: number; deadSpaceMl: number;
  minuteVentilationLMin: number; alveolarVentilationLMin: number;
  alveolarCo2MmHg: number; estimatedEtCo2MmHg: number }
