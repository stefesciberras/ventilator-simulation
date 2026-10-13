export interface AlarmLimits {
  pressureLimit: number
  apneaTime: number
  peakPressure: number
  co2Min: number
  co2Max: number
  minuteVentilationMin: number
  minuteVentilationMax: number
  tidalVolumeMin: number
  tidalVolumeMax: number
  respiratoryRateMin: number
  respiratoryRateMax: number
}

export type CandidateAlarmLevel = 'yellow' | 'red' | null
