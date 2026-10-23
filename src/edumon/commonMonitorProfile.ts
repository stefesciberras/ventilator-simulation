export type EdumonCommonWaveformId = 'ecg' | 'arterial-pressure' | 'pleth' | 'capnography'
export type EdumonCommonMeasurementId = 'heart-rate' | 'arterial-pressure' | 'spo2' | 'nibp' | 'etco2'

/**
 * Product-neutral monitor capabilities owned once by EDUMON and consumed by
 * both EDUMON-Ana and EDUMON-ICU. Product modules may add specialist monitors,
 * but must not reimplement these common traces/measurements.
 */
export interface EdumonCommonMonitorProfile {
  waveforms: readonly EdumonCommonWaveformId[]
  measurements: readonly EdumonCommonMeasurementId[]
  respiratoryPhysiology: true
  sharedMonitorEngine: true
  sharedAlarmController: true
  sharedNibp: true
}

const COMMON_PROFILE = {
  waveforms: ['ecg', 'arterial-pressure', 'pleth', 'capnography'],
  measurements: ['heart-rate', 'arterial-pressure', 'spo2', 'nibp', 'etco2'],
  respiratoryPhysiology: true,
  sharedMonitorEngine: true,
  sharedAlarmController: true,
  sharedNibp: true,
} as const satisfies EdumonCommonMonitorProfile

export const EDUMON_COMMON_MONITOR_PROFILE: EdumonCommonMonitorProfile = Object.freeze(COMMON_PROFILE)

export type EdumonProductExtensionId =
  | 'anaesthetic-gases'
  | 'bis'
  | 'tof'
  | 'cvp'
  | 'icp-cpp'
  | 'advanced-haemodynamics'

export interface EdumonProductMonitorProfile {
  common: EdumonCommonMonitorProfile
  extensions: readonly EdumonProductExtensionId[]
}

export const EDUMON_PRODUCT_MONITOR_PROFILES = {
  ana: {
    common: EDUMON_COMMON_MONITOR_PROFILE,
    extensions: ['anaesthetic-gases', 'bis', 'tof'],
  },
  icu: {
    common: EDUMON_COMMON_MONITOR_PROFILE,
    extensions: ['cvp', 'icp-cpp', 'advanced-haemodynamics'],
  },
} as const satisfies Record<'ana' | 'icu', EdumonProductMonitorProfile>
