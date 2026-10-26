import {
  DEFAULT_MONITOR_ANAESTHETIC_PHYSIOLOGY_SETTINGS,
  DEFAULT_MONITOR_RESPIRATORY_SETTINGS,
  type MonitorPatientState,
} from './types'

export type EdumonPatientProfile = 'Awake' | 'Asleep' | 'Paediatric'

const patientRespiratoryBaseline = {
  spontaneousRespiratoryRate: DEFAULT_MONITOR_RESPIRATORY_SETTINGS.spontaneousRespiratoryRate,
  spontaneousTidalVolumeMl: DEFAULT_MONITOR_RESPIRATORY_SETTINGS.spontaneousTidalVolumeMl,
  deadSpaceMl: DEFAULT_MONITOR_RESPIRATORY_SETTINGS.deadSpaceMl,
  complianceMlPerCmH2O: DEFAULT_MONITOR_RESPIRATORY_SETTINGS.complianceMlPerCmH2O,
  expiratoryResistanceCmH2OLs: DEFAULT_MONITOR_RESPIRATORY_SETTINGS.expiratoryResistanceCmH2OLs,
  frcMl: DEFAULT_MONITOR_RESPIRATORY_SETTINGS.frcMl,
  shuntFraction: DEFAULT_MONITOR_RESPIRATORY_SETTINGS.shuntFraction,
  maxSpO2: DEFAULT_MONITOR_RESPIRATORY_SETTINGS.maxSpO2,
  oxygenConsumptionMlMin: DEFAULT_MONITOR_RESPIRATORY_SETTINGS.oxygenConsumptionMlMin,
  co2ProductionMlMin: DEFAULT_MONITOR_RESPIRATORY_SETTINGS.co2ProductionMlMin,
  sex: DEFAULT_MONITOR_RESPIRATORY_SETTINGS.sex,
  heightCm: DEFAULT_MONITOR_RESPIRATORY_SETTINGS.heightCm,
}

const common = {
  rhythm: 'sinus' as const,
  ecgMorphology: 'nil' as const,
  morphologySeverity: 50,
  peripheralPerfusion: 1,
  temperatureC: 37,
  respiratory: { ...patientRespiratoryBaseline },
  anaestheticPhysiology: { ...DEFAULT_MONITOR_ANAESTHETIC_PHYSIOLOGY_SETTINGS },
}

export const EDUMON_PATIENT_PROFILES: Record<EdumonPatientProfile, MonitorPatientState> = {
  Awake: { ...common, heartRate: 78, systolicPressure: 122, diastolicPressure: 68, spo2: 98 },
  Asleep: { ...common, respiratory: { ...patientRespiratoryBaseline }, anaestheticPhysiology: { ...DEFAULT_MONITOR_ANAESTHETIC_PHYSIOLOGY_SETTINGS }, heartRate: 62, systolicPressure: 105, diastolicPressure: 60, spo2: 99, peripheralPerfusion: 0.9 },
  Paediatric: { ...common, respiratory: { ...patientRespiratoryBaseline, spontaneousRespiratoryRate: 20, spontaneousTidalVolumeMl: 250, deadSpaceMl: 75, frcMl: 1200, oxygenConsumptionMlMin: 180, co2ProductionMlMin: 180, heightCm: 120 }, anaestheticPhysiology: { ...DEFAULT_MONITOR_ANAESTHETIC_PHYSIOLOGY_SETTINGS }, heartRate: 110, systolicPressure: 95, diastolicPressure: 55, spo2: 99 },
}
