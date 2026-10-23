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

export interface MonitorRespiratorySettings {
  respiratoryRate: number
  tidalVolumeMl: number
  deadSpaceMl: number
  fio2: number
  peepCmH2O: number
  complianceMlPerCmH2O: number
  expiratoryResistanceCmH2OLs: number
  frcMl: number
  shuntFraction: number
  maxSpO2: number
  oxygenConsumptionMlMin: number
  co2ProductionMlMin: number
  sex: 'male' | 'female'
  heightCm: number
}

export const DEFAULT_MONITOR_RESPIRATORY_SETTINGS: MonitorRespiratorySettings = {
  respiratoryRate: 12,
  tidalVolumeMl: 500,
  deadSpaceMl: 150,
  fio2: 0.21,
  peepCmH2O: 0,
  complianceMlPerCmH2O: 70,
  expiratoryResistanceCmH2OLs: 8,
  frcMl: 2500,
  shuntFraction: 0.03,
  maxSpO2: 100,
  oxygenConsumptionMlMin: 250,
  co2ProductionMlMin: 250,
  sex: 'male',
  heightCm: 170,
}

export interface MonitorAnaestheticGasSettings {
  /** Inspired sevoflurane concentration, volume %. */
  fiSevoPercent: number
}

export const DEFAULT_MONITOR_ANAESTHETIC_GAS_SETTINGS: MonitorAnaestheticGasSettings = {
  fiSevoPercent: 0,
}

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
  /** Product-neutral respiratory/metabolic inputs for the shared EDUSIM gas-exchange engine. */
  respiratory?: Partial<MonitorRespiratorySettings>
  /** Anaesthesia-only volatile-agent controls. Ignored by EDUMON-ICU. */
  anaestheticGases?: Partial<MonitorAnaestheticGasSettings>
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
