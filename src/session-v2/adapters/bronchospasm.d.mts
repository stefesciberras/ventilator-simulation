export declare const BRONCHOSPASM_EVENT_ID: string
export declare const BRONCHOSPASM_EFFECT_ID: string
export declare const BRONCHOSPASM_RESPONSE_SECONDS: number
export declare function setBronchospasmSeverity(state: any, severityPercent: number): any
export declare function advanceBronchospasm(state: any, deltaSeconds: number): any
export declare function projectBronchospasmVentilation(respiratory: any): {
  peakAirwayPressureCmH2O: number; tidalVolumeMl: number;
  airwayResistanceCmH2OLs: number; expiratoryTimeConstantSeconds: number
}
