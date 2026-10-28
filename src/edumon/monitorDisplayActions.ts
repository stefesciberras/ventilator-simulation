import { useEffect, useSyncExternalStore } from 'react'
import { isActionToggleRunning, subscribeToActionRuntime } from '../edusim/actions/ActionRuntime'
import './edumon-monitor-actions.css'
import './edumon-monitor-row-alignment.css'

export const EDUMON_MONITOR_DISPLAY_ACTION_IDS = {
  invasiveBloodPressure: 'monitor-inv-bp',
  bis: 'monitor-bis',
  temperature: 'monitor-temp',
} as const

export type EdumonMonitorDisplayActionId = typeof EDUMON_MONITOR_DISPLAY_ACTION_IDS[keyof typeof EDUMON_MONITOR_DISPLAY_ACTION_IDS]

const INSTRUCTOR_ONLY_MONITORS = new Set<EdumonMonitorDisplayActionId>()
const INSTRUCTOR_ONLY_MONITOR_LISTENERS = new Set<() => void>()

function notifyInstructorMonitorListeners() {
  for (const listener of INSTRUCTOR_ONLY_MONITOR_LISTENERS) listener()
}

export function subscribeToInstructorMonitorDisplays(listener: () => void): () => void {
  INSTRUCTOR_ONLY_MONITOR_LISTENERS.add(listener)
  return () => INSTRUCTOR_ONLY_MONITOR_LISTENERS.delete(listener)
}

export function isInstructorMonitorDisplayEnabled(actionId: EdumonMonitorDisplayActionId): boolean {
  return INSTRUCTOR_ONLY_MONITORS.has(actionId)
}

export function setInstructorMonitorDisplay(actionId: EdumonMonitorDisplayActionId, enabled: boolean): void {
  const before = INSTRUCTOR_ONLY_MONITORS.has(actionId)
  if (enabled) INSTRUCTOR_ONLY_MONITORS.add(actionId)
  else INSTRUCTOR_ONLY_MONITORS.delete(actionId)
  if (before !== enabled) notifyInstructorMonitorListeners()
}

export function toggleInstructorMonitorDisplay(actionId: EdumonMonitorDisplayActionId): boolean {
  const next = !INSTRUCTOR_ONLY_MONITORS.has(actionId)
  setInstructorMonitorDisplay(actionId, next)
  return next
}

export function clearInstructorMonitorDisplays(): void {
  if (!INSTRUCTOR_ONLY_MONITORS.size) return
  INSTRUCTOR_ONLY_MONITORS.clear()
  notifyInstructorMonitorListeners()
}

export function useMonitorDisplayEnabled(actionId: EdumonMonitorDisplayActionId): boolean {
  const sharedEnabled = useSyncExternalStore(
    subscribeToActionRuntime,
    () => isActionToggleRunning(actionId),
    () => false,
  )
  const instructorOnlyEnabled = useSyncExternalStore(
    subscribeToInstructorMonitorDisplays,
    () => isInstructorMonitorDisplayEnabled(actionId),
    () => false,
  )
  return sharedEnabled || instructorOnlyEnabled
}

export function useEdumonMonitorDisplayDomBridge(): void {
  const invasiveBloodPressure = useMonitorDisplayEnabled(EDUMON_MONITOR_DISPLAY_ACTION_IDS.invasiveBloodPressure)

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-edumon-monitor-inv-bp', invasiveBloodPressure ? 'true' : 'false')
    return () => root.removeAttribute('data-edumon-monitor-inv-bp')
  }, [invasiveBloodPressure])
}
