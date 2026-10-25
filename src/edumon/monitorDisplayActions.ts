import { useEffect, useSyncExternalStore } from 'react'
import { isActionToggleRunning, subscribeToActionRuntime } from '../edusim/actions/ActionRuntime'
import './edumon-monitor-actions.css'

export const EDUMON_MONITOR_DISPLAY_ACTION_IDS = {
  invasiveBloodPressure: 'monitor-inv-bp',
  bis: 'monitor-bis',
  temperature: 'monitor-temp',
} as const

export type EdumonMonitorDisplayActionId = typeof EDUMON_MONITOR_DISPLAY_ACTION_IDS[keyof typeof EDUMON_MONITOR_DISPLAY_ACTION_IDS]

export function useMonitorDisplayEnabled(actionId: EdumonMonitorDisplayActionId): boolean {
  return useSyncExternalStore(
    subscribeToActionRuntime,
    () => isActionToggleRunning(actionId),
    () => false,
  )
}

export function useEdumonMonitorDisplayDomBridge(): void {
  const invasiveBloodPressure = useMonitorDisplayEnabled(EDUMON_MONITOR_DISPLAY_ACTION_IDS.invasiveBloodPressure)

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-edumon-monitor-inv-bp', invasiveBloodPressure ? 'true' : 'false')
    return () => root.removeAttribute('data-edumon-monitor-inv-bp')
  }, [invasiveBloodPressure])
}
