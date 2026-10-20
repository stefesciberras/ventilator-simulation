export type CardiacRhythm =
  | 'sinus'
  | 'sinus-bradycardia'
  | 'sinus-tachycardia'
  | 'atrial-fibrillation'
  | 'svt'
  | 'ventricular-tachycardia'
  | 'ventricular-fibrillation'
  | 'asystole'

export interface MonitorPatientState {
  heartRate: number
  rhythm: CardiacRhythm
  systolicPressure: number
  diastolicPressure: number
  spo2: number
  peripheralPerfusion: number
}

export interface MonitorSample {
  time: number
  ecg: number
  arterialPressure: number
  pleth: number
}

export interface MonitorMeasurements {
  heartRate: number | null
  systolicPressure: number | null
  diastolicPressure: number | null
  meanPressure: number | null
  spo2: number | null
}

export const DEFAULT_MONITOR_STATE: MonitorPatientState = {
  heartRate: 78,
  rhythm: 'sinus',
  systolicPressure: 122,
  diastolicPressure: 68,
  spo2: 98,
  peripheralPerfusion: 1,
}
