import { useSyncExternalStore } from 'react'

export interface InstructorSessionRecoveryController {
  sessionId: string
  sessionKey: string
  continueSession: () => Promise<boolean>
  startNewSession: () => Promise<boolean>
}

let current: InstructorSessionRecoveryController | null = null
const listeners = new Set<() => void>()

function candidateInvitationActive() {
  if (typeof window === 'undefined') return false
  const searchParams = new URLSearchParams(window.location.search)
  const sessionKey = (searchParams.get('session') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return sessionKey.length === 6
}

export function setInstructorSessionRecovery(controller: InstructorSessionRecoveryController | null) {
  // A direct session invitation is explicit candidate intent. New tabs/windows can inherit
  // the opener's sessionStorage, including instructor recovery IDs, so never let that
  // inherited instructor state obscure or reclaim control in an invited candidate tab.
  current = controller && candidateInvitationActive() ? null : controller
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
