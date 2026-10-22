export type CardiacRhythm =
  | 'sinus'
  | 'sinus-bradycardia'
  | 'sinus-tachycardia'
  | 'atrial-flutter'
  | 'atrial-fibrillation'
  | 'svt'
  | 'ventricular-tachycardia'
  | 'ventricular-fibrillation'
  | 'asystole'

export type EcgMorphology =
  | 'nil'
  | 'ischaemia'
  | 'infarction'
  | 'hyperkalaemia'

export interface MonitorPatientState {
  heartRate: number
  rhythm: CardiacRhythm
  /** Optional for backwards compatibility with pre-v1.1.0.3 scenarios/session payloads. */
  ecgMorphology?: EcgMorphology
  /** Morphology intensity from 0 to 100. Defaults to 50 when omitted. */
  morphologySeverity?: number
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
  ecgMorphology: 'nil',
  morphologySeverity: 50,
  systolicPressure: 122,
  diastolicPressure: 68,
  spo2: 98,
  peripheralPerfusion: 1,
}
