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

export type MonitorVentilationMode = 'MANUAL' | 'VC-AC' | 'PC-AC' | 'PSV' | 'SIMV-VC' | 'SIMV-PC' | 'VG-PC'

export interface MonitorRespiratorySettings {
  /** Effective respiratory rate used by gas exchange/capnography after ventilator + patient interaction. */
  respiratoryRate: number
  /** Effective tidal volume used by gas exchange/capnography. */
  tidalVolumeMl: number
  /** Patient's own spontaneous respiratory rate, independent of the ventilator set rate. */
  spontaneousRespiratoryRate: number
  /** Simplified spontaneous tidal volume used in Manual mode. Not exposed as a routine control. */
  spontaneousTidalVolumeMl: number
  /** Current EDUMON ventilation mode. Older scenarios omit this and are treated as Manual/spontaneous. */
  ventilatorMode?: MonitorVentilationMode
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
  spontaneousRespiratoryRate: 12,
  spontaneousTidalVolumeMl: 500,
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

export type AnaestheticDepth = 1 | 2 | 3 | 4 | 5

export interface AnaestheticResponseBaseline {
  heartRate: number
  systolicPressure: number
  diastolicPressure: number
  spontaneousRespiratoryRate: number
}

export interface MonitorAnaestheticPhysiologySettings {
  /** Relative sensitivity to anaesthesia, -1 (less sensitive) to +1 (more sensitive). */
  anaestheticSensitivity: number
  /** Relative haemodynamic response to a given depth, -1 (blunted) to +1 (exaggerated). */
  anaestheticResponse: number
  /** Discrete depth state: 1 deepest, 5 lightest / awake. */
  depthOfAnaesthesia: AnaestheticDepth
  /** Pre-anaesthetic baseline used to make depth effects reversible and non-compounding. */
  responseBaseline?: AnaestheticResponseBaseline
}

export const DEFAULT_MONITOR_ANAESTHETIC_PHYSIOLOGY_SETTINGS: MonitorAnaestheticPhysiologySettings = {
  anaestheticSensitivity: 0,
  anaestheticResponse: 0,
  depthOfAnaesthesia: 5,
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
  /** Anaesthesia response state used by volatile agents and future IV/BIS/haemodynamic models. */
  anaestheticPhysiology?: Partial<MonitorAnaestheticPhysiologySettings>
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
  anaestheticPhysiology: { ...DEFAULT_MONITOR_ANAESTHETIC_PHYSIOLOGY_SETTINGS },
}
