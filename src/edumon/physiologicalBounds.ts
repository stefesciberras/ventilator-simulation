import { DEFAULT_MONITOR_RESPIRATORY_SETTINGS, type MonitorPatientState, type MonitorRespiratorySettings } from './types'

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

export const EDUMON_PHYSIOLOGICAL_BOUNDS = {
  heartRate: { min: 0, max: 240 },
  systolicPressure: { min: 20, max: 300 },
  diastolicPressure: { min: 10, max: 200 },
  spo2: { min: 0, max: 100 },
  peripheralPerfusion: { min: 0, max: 1 },
  respiratoryRate: { min: 0, max: 80 },
  tidalVolumeMl: { min: 0, max: 1000 },
  expiratoryResistanceCmH2OLs: { min: 0.1, max: 200 },
} as const

function boundRespiratory(settings: MonitorRespiratorySettings): MonitorRespiratorySettings {
  const respiratoryRate = clamp(settings.respiratoryRate, EDUMON_PHYSIOLOGICAL_BOUNDS.respiratoryRate.min, EDUMON_PHYSIOLOGICAL_BOUNDS.respiratoryRate.max)
  const spontaneousRespiratoryRate = clamp(settings.spontaneousRespiratoryRate, EDUMON_PHYSIOLOGICAL_BOUNDS.respiratoryRate.min, EDUMON_PHYSIOLOGICAL_BOUNDS.respiratoryRate.max)
  const tidalVolumeMl = clamp(settings.tidalVolumeMl, EDUMON_PHYSIOLOGICAL_BOUNDS.tidalVolumeMl.min, EDUMON_PHYSIOLOGICAL_BOUNDS.tidalVolumeMl.max)
  const spontaneousTidalVolumeMl = clamp(settings.spontaneousTidalVolumeMl, EDUMON_PHYSIOLOGICAL_BOUNDS.tidalVolumeMl.min, EDUMON_PHYSIOLOGICAL_BOUNDS.tidalVolumeMl.max)
  const expiratoryResistanceCmH2OLs = clamp(
    settings.expiratoryResistanceCmH2OLs,
    EDUMON_PHYSIOLOGICAL_BOUNDS.expiratoryResistanceCmH2OLs.min,
    EDUMON_PHYSIOLOGICAL_BOUNDS.expiratoryResistanceCmH2OLs.max,
  )

  return {
    ...settings,
    respiratoryRate,
    spontaneousRespiratoryRate,
    tidalVolumeMl,
    spontaneousTidalVolumeMl,
    expiratoryResistanceCmH2OLs,
    deadSpaceMl: clamp(settings.deadSpaceMl, 0, Math.max(0, tidalVolumeMl)),
    fio2: clamp(settings.fio2, 0.21, 1),
    shuntFraction: clamp(settings.shuntFraction, 0, 1),
    maxSpO2: clamp(settings.maxSpO2, 0, 100),
  }
}

/**
 * Absolute EDUMON sanity bounds applied after physiology/action composition.
 * These are simulator invariants, not normal ranges, alarm limits, or action priorities.
 * Manual instructor controls may supersede actions, but they do not bypass these bounds.
 */
export function applyEdumonPhysiologicalBounds(state: MonitorPatientState): MonitorPatientState {
  const diastolicPressure = clamp(
    state.diastolicPressure,
    EDUMON_PHYSIOLOGICAL_BOUNDS.diastolicPressure.min,
    EDUMON_PHYSIOLOGICAL_BOUNDS.diastolicPressure.max,
  )
  const systolicPressure = Math.max(
    diastolicPressure + 1,
    clamp(
      state.systolicPressure,
      EDUMON_PHYSIOLOGICAL_BOUNDS.systolicPressure.min,
      EDUMON_PHYSIOLOGICAL_BOUNDS.systolicPressure.max,
    ),
  )

  const bounded: MonitorPatientState = {
    ...state,
    heartRate: clamp(state.heartRate, EDUMON_PHYSIOLOGICAL_BOUNDS.heartRate.min, EDUMON_PHYSIOLOGICAL_BOUNDS.heartRate.max),
    systolicPressure: clamp(systolicPressure, EDUMON_PHYSIOLOGICAL_BOUNDS.systolicPressure.min, EDUMON_PHYSIOLOGICAL_BOUNDS.systolicPressure.max),
    diastolicPressure,
    spo2: clamp(state.spo2, EDUMON_PHYSIOLOGICAL_BOUNDS.spo2.min, EDUMON_PHYSIOLOGICAL_BOUNDS.spo2.max),
    peripheralPerfusion: clamp(
      state.peripheralPerfusion,
      EDUMON_PHYSIOLOGICAL_BOUNDS.peripheralPerfusion.min,
      EDUMON_PHYSIOLOGICAL_BOUNDS.peripheralPerfusion.max,
    ),
  }

  if (state.respiratory) {
    bounded.respiratory = boundRespiratory({
      ...DEFAULT_MONITOR_RESPIRATORY_SETTINGS,
      ...state.respiratory,
    })
  }

  return bounded
}
