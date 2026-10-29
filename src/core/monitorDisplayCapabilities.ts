export const MONITOR_DISPLAY_ACTION_IDS = {
  invasiveBloodPressure: 'monitor-inv-bp',
  bis: 'monitor-bis',
  temperature: 'monitor-temp',
  capnography: 'monitor-capnography',
} as const

export type MonitorDisplayActionId = typeof MONITOR_DISPLAY_ACTION_IDS[keyof typeof MONITOR_DISPLAY_ACTION_IDS]

/**
 * Canonical product-neutral monitor-display capability IDs.
 * Products may expose these capabilities through different UI controls, but the
 * semantic IDs remain stable for actions, sessions and scenario integrations.
 */
export function monitorDisplayCapabilityForWaveform(signal: string): MonitorDisplayActionId | null {
  return signal === 'co2' ? MONITOR_DISPLAY_ACTION_IDS.capnography : null
}
