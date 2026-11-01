import { useSyncExternalStore } from 'react'

export interface InstructorSessionRecoveryController {
  sessionId: string
  sessionKey: string
  continueSession: () => Promise<boolean>
  startNewSession: () => Promise<boolean>
}

let current: InstructorSessionRecoveryController | null = null
const listeners = new Set<() => void>()

export function setInstructorSessionRecovery(controller: InstructorSessionRecoveryController | null) {
  current = controller
  for (const listener of listeners) listener()
}

export function getInstructorSessionRecovery(): InstructorSessionRecoveryController | null {
  return current
}

export function useInstructorSessionRecovery(): InstructorSessionRecoveryController | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current,
    () => null,
  )
}
