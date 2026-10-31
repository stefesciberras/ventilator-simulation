import { useEffect, useState } from 'react'

export interface ScenarioRuntimeIndicatorState {
  label: string
  manualAvailable: boolean
  open: () => void
}

export interface ScenarioRuntimeTriggerInfo {
  id: string
  label: string
  detail: string
  kind?: 'informational' | 'time'
  remainingSeconds?: number
  paused?: boolean
  onTogglePause?: () => void
  onForce?: () => void | Promise<void>
}

let current: ScenarioRuntimeIndicatorState | null = null
let currentTriggers: ScenarioRuntimeTriggerInfo[] = []
const listeners = new Set<() => void>()
const triggerListeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

function emitTriggers() {
  triggerListeners.forEach((listener) => listener())
}

export function setScenarioRuntimeIndicator(next: ScenarioRuntimeIndicatorState | null) {
  current = next
  emit()
}

export function getScenarioRuntimeIndicator() {
  return current
}

export function setScenarioRuntimeTriggerInfo(next: ScenarioRuntimeTriggerInfo[]) {
  const unchanged = next.length === currentTriggers.length && next.every((trigger, index) => {
    const currentTrigger = currentTriggers[index]
    return currentTrigger
      && currentTrigger.id === trigger.id
      && currentTrigger.label === trigger.label
      && currentTrigger.detail === trigger.detail
      && currentTrigger.kind === trigger.kind
      && currentTrigger.remainingSeconds === trigger.remainingSeconds
      && currentTrigger.paused === trigger.paused
      && currentTrigger.onTogglePause === trigger.onTogglePause
      && currentTrigger.onForce === trigger.onForce
  })
  if (unchanged) return
  currentTriggers = next
  emitTriggers()
}

export function getScenarioRuntimeTriggerInfo() {
  return currentTriggers
}

export function useScenarioRuntimeIndicator() {
  const [state, setState] = useState<ScenarioRuntimeIndicatorState | null>(() => current)

  useEffect(() => {
    const listener = () => setState(current)
    listeners.add(listener)
    listener()
    return () => { listeners.delete(listener) }
  }, [])

  return state
}

export function useScenarioRuntimeTriggerInfo() {
  const [state, setState] = useState<ScenarioRuntimeTriggerInfo[]>(() => currentTriggers)

  useEffect(() => {
    const listener = () => setState(currentTriggers)
    triggerListeners.add(listener)
    listener()
    return () => { triggerListeners.delete(listener) }
  }, [])

  return state
}
