import type { MonitorPatientState } from './types'

export type EdumonPatientProfile = 'Awake' | 'Asleep' | 'Paediatric'

export const EDUMON_PATIENT_PROFILES: Record<EdumonPatientProfile, MonitorPatientState> = {
  Awake: { heartRate: 78, rhythm: 'sinus', ecgMorphology: 'nil', morphologySeverity: 50, systolicPressure: 122, diastolicPressure: 68, spo2: 98, peripheralPerfusion: 1, temperatureC: 37 },
  Asleep: { heartRate: 62, rhythm: 'sinus', ecgMorphology: 'nil', morphologySeverity: 50, systolicPressure: 105, diastolicPressure: 60, spo2: 99, peripheralPerfusion: 0.9, temperatureC: 37 },
  Paediatric: { heartRate: 110, rhythm: 'sinus', ecgMorphology: 'nil', morphologySeverity: 50, systolicPressure: 95, diastolicPressure: 55, spo2: 99, peripheralPerfusion: 1, temperatureC: 37 },
}
