import {
  DEFAULT_MONITOR_ANAESTHETIC_PHYSIOLOGY_SETTINGS,
  type AnaestheticDepth,
  type MonitorAnaestheticPhysiologySettings,
  type MonitorPatientState,
} from './types'

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export function resolvedAnaestheticPhysiology(state: MonitorPatientState): MonitorAnaestheticPhysiologySettings {
  return {
    ...DEFAULT_MONITOR_ANAESTHETIC_PHYSIOLOGY_SETTINGS,
    ...(state.anaestheticPhysiology ?? {}),
  }
}

export function effectiveMacForSensitivity(mac: number, sensitivity: number): number {
  const normalizedSensitivity = clamp(sensitivity, -1, 1)
  return Math.max(0, mac) * (1 + 0.5 * normalizedSensitivity)
}

export function depthFromMac(mac: number, sensitivity: number): AnaestheticDepth {
  const effectiveMac = effectiveMacForSensitivity(mac, sensitivity)
  return clamp(Math.round(5 - (2 * effectiveMac)), 1, 5) as AnaestheticDepth
}
