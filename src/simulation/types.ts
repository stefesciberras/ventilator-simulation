export type VentilatorMode = 'VC-AC' | 'PC-AC' | 'PSV'

export interface PatientSettings {
  compliance: number
  resistance: number
  expiratoryResistance: number
  spontaneousRate: number
  effort: number
  inspiratoryTime: number
}

export interface VentilatorSettings {
  mode: VentilatorMode
  fio2: number
  peep: number
  rate: number
  tidalVolume: number
  inspiratoryTime: number
  pressureControl: number
  pressureSupport: number
  triggerSensitivity: number
}

export interface Sample {
  time: number
  pressure: number
  flow: number
  volume: number
  musclePressure: number
  phase: 'inspiration' | 'expiration'
}

export interface Measurements {
  respiratoryRate: number
  tidalVolume: number
  minuteVentilation: number
  peakPressure: number
  meanPressure: number
  peep: number
}
