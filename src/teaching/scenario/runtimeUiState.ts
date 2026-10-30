import { useEffect, useState } from 'react'

export interface ScenarioRuntimeIndicatorState {
  label: string
  manualAvailable: boolean
  open: () => void
}

let current: ScenarioRuntimeIndicatorState | null = null
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

export function setScenarioRuntimeIndicator(next: ScenarioRuntimeIndicatorState | null) {
  current = next
  emit()
}

export function getScenarioRuntimeIndicator() {
  return current
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
