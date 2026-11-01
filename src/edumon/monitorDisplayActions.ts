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

function syncCapnographyButton(): void {
  const instructorHost = document.querySelector<HTMLElement>('.edumon-instructor-monitor-class .edumon-action-grid')
  const standaloneHost = document.querySelector<HTMLElement>('.edumon-action-section[data-action-section="monitoring"] .edumon-monitor-display-class .edumon-action-grid')
  const host = instructorHost ?? standaloneHost
  const existing = document.getElementById(CAPNOGRAPHY_BUTTON_ID) as HTMLButtonElement | null

  if (!host) {
    existing?.remove()
    return
  }

  const instructorOnly = host === instructorHost
  const button = existing ?? document.createElement('button')
  if (!existing) {
    button.id = CAPNOGRAPHY_BUTTON_ID
    button.type = 'button'
    button.addEventListener('click', () => toggleInstructorMonitorDisplay(EDUMON_MONITOR_DISPLAY_ACTION_IDS.capnography))
  }

  const desiredClassName = `edumon-action-button toggle ${instructorOnly ? 'instructor-monitor' : ''}`.trim()
  const desiredTitle = instructorOnly ? 'Display EtCO₂ only on the instructor monitor' : 'Show or hide EtCO₂/capnography on this monitor'
  const desiredMarkup = instructorOnly
    ? '<span>EtCO₂</span><small class="edumon-action-local-badge">I</small>'
    : '<span>EtCO₂</span>'

  // Keep this bridge idempotent. The Actions panel is watched for structural
  // changes; rewriting innerHTML on every observer callback creates a
  // self-sustaining MutationObserver loop and can hang Chromium.
  if (button.className !== desiredClassName) button.className = desiredClassName
  if (button.title !== desiredTitle) button.title = desiredTitle
  if (button.innerHTML !== desiredMarkup) button.innerHTML = desiredMarkup
  if (button.parentElement !== host) host.appendChild(button)

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
    const sync = () => syncCapnographyButton()
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
