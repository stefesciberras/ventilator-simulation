import { useEffect, useSyncExternalStore } from 'react'
import { MONITOR_DISPLAY_ACTION_IDS, type MonitorDisplayActionId } from '../core/monitorDisplayCapabilities'
import { isActionToggleRunning, subscribeToActionRuntime } from '../edusim/actions/ActionRuntime'
import './edumon-monitor-actions.css'
import './edumon-monitor-row-alignment.css'

// Keep the established EDUMON aliases explicit for regression/backward compatibility,
// while capnography shares the canonical product-neutral core capability ID.
export const EDUMON_MONITOR_DISPLAY_ACTION_IDS = {
  invasiveBloodPressure: 'monitor-inv-bp',
  bis: 'monitor-bis',
  temperature: 'monitor-temp',
  capnography: MONITOR_DISPLAY_ACTION_IDS.capnography,
} as const satisfies Record<string, MonitorDisplayActionId>

export type EdumonMonitorDisplayActionId = MonitorDisplayActionId

const INSTRUCTOR_ONLY_MONITORS = new Set<EdumonMonitorDisplayActionId>()
const INSTRUCTOR_ONLY_MONITOR_LISTENERS = new Set<() => void>()
const CAPNOGRAPHY_BUTTON_ID = 'edumon-instructor-capnography-monitor-button'

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

function syncInstructorCapnographyButton(): void {
  const host = document.querySelector<HTMLElement>('.edumon-instructor-monitor-class .edumon-action-grid')
  const existing = document.getElementById(CAPNOGRAPHY_BUTTON_ID) as HTMLButtonElement | null

  if (!host) {
    existing?.remove()
    return
  }

  const button = existing ?? document.createElement('button')
  if (!existing) {
    button.id = CAPNOGRAPHY_BUTTON_ID
    button.type = 'button'
    button.className = 'edumon-action-button toggle instructor-monitor'
    button.title = 'Display only on the instructor monitor'
    button.innerHTML = '<span>Capno</span><small class="edumon-action-local-badge">I</small>'
    button.addEventListener('click', () => toggleInstructorMonitorDisplay(EDUMON_MONITOR_DISPLAY_ACTION_IDS.capnography))
    host.appendChild(button)
  } else if (button.parentElement !== host) {
    host.appendChild(button)
  }

  const active = isInstructorMonitorDisplayEnabled(EDUMON_MONITOR_DISPLAY_ACTION_IDS.capnography)
  button.classList.toggle('active', active)
  button.setAttribute('aria-pressed', active ? 'true' : 'false')
}

export function useEdumonMonitorDisplayDomBridge(): void {
  const invasiveBloodPressure = useMonitorDisplayEnabled(EDUMON_MONITOR_DISPLAY_ACTION_IDS.invasiveBloodPressure)
  const capnography = useMonitorDisplayEnabled(EDUMON_MONITOR_DISPLAY_ACTION_IDS.capnography)

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-edumon-monitor-inv-bp', invasiveBloodPressure ? 'true' : 'false')
    return () => root.removeAttribute('data-edumon-monitor-inv-bp')
  }, [invasiveBloodPressure])

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-edumon-monitor-capnography', capnography ? 'true' : 'false')
    return () => root.removeAttribute('data-edumon-monitor-capnography')
  }, [capnography])

  useEffect(() => {
    const sync = () => syncInstructorCapnographyButton()
    sync()
    const unsubscribe = subscribeToInstructorMonitorDisplays(sync)
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      unsubscribe()
      observer.disconnect()
      document.getElementById(CAPNOGRAPHY_BUTTON_ID)?.remove()
    }
  }, [])
}
