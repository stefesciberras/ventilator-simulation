export type VentilatorMode = 'VC-AC' | 'PC-AC' | 'PSV' | 'SIMV-VC' | 'SIMV-PC' | 'VG-PC' | 'APRV' | 'BIPAP'

export interface PatientSettings {
  sex: 'male' | 'female'
  heightCm: number
  oxygenConsumption: number
  frc: number
  shuntFraction: number
  maxSpO2: number
  compliance: number
  resistance: number
  expiratoryResistance: number
  /** 0 = linear RC emptying; 1 = severe expiratory flow limitation. */
  expiratoryFlowLimitation: number
  spontaneousRate: number
  effort: number
  neuralInspiratoryTime: number
  effortRisePercent: number
  effortRelaxationPercent: number
  endExpiratoryOesophagealPressure: number
  co2Production: number
  vdVt: number
  /** Legacy v0.81.4 value retained only so old saved scenarios can be interpreted. */
  deadSpaceVolume?: number
}

export interface VentilatorSettings {
  mode: VentilatorMode
  fio2: number
  peep: number
  rate: number
  tidalVolume: number
  inspiratoryTime: number
  inspiratoryFlow: number
  plateauPercent: number
  pressureControl: number
  volumeGuaranteePressureLimit: number
  pressureSupport: number
  triggerType: 'pressure' | 'flow'
  triggerSensitivity: number
  flowTriggerSensitivity: number
  terminationSensitivity: number
  simvSyncWindowPercent: number
  showSimvSyncWindow: boolean
  pHigh: number
  pLow: number
  tHigh: number
  tLow: number
}

export interface Sample {
  time: number
  pressure: number
  flow: number
  volume: number
  musclePressure: number
  co2: number
  spo2: number
  oesophagealPressure: number
  phase: 'inspiration' | 'expiration'
  mode: VentilatorMode
  breathTrigger?: 'mandatory' | 'patient'
  ventilatorTriggerDetected?: boolean
  ventilatorTriggerBaseline?: number
  patientEffortStart?: boolean
  expiratoryHold?: boolean
  simvSyncWindow?: boolean
  pressureLimitHit?: boolean
  expiratoryFlowLimited?: boolean
}

export interface Measurements {
  respiratoryRate: number
  tidalVolume: number
  minuteVentilation: number
  peakPressure: number
  meanPressure: number
  peep: number
  totalPeep: number | null
  autoPeep: number | null
}
