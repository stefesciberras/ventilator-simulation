import { useCallback, useEffect, useRef, useState } from 'react'
import type { TeachingRole } from './types'
import { sendTeachingBroadcast, subscribeTeachingBroadcast } from './teachingRealtimeBus'

const STATE_EVENT = 'teaching-shared-oxygen-flush'
const REQUEST_EVENT = 'teaching-shared-oxygen-flush-request'

interface SharedOxygenFlushState {
  active: boolean
  sentAt: number
}

function isState(value: unknown): value is SharedOxygenFlushState {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<SharedOxygenFlushState>
  return typeof candidate.active === 'boolean' && typeof candidate.sentAt === 'number'
}

/**
 * Instructor-authoritative oxygen flush state carried over the common teaching bus.
 * It deliberately does not own each client's local oxygen-flush state: shared OFF
 * only releases the instructor-imposed flush and never clears a candidate's local flush.
 */
export function useTeachingSharedOxygenFlush(role: TeachingRole, sessionId: string | null) {
  const [active, setActiveState] = useState(false)
  const stateRef = useRef<SharedOxygenFlushState>({ active: false, sentAt: Date.now() })

  const publish = useCallback((next: SharedOxygenFlushState) => {
    if (role !== 'instructor' || !sessionId) return
    void sendTeachingBroadcast(sessionId, STATE_EVENT, next)
  }, [role, sessionId])

  useEffect(() => {
    const reset = { active: false, sentAt: Date.now() }
    stateRef.current = reset
    setActiveState(false)
    if (!sessionId || role === 'standalone') return

    const unsubState = subscribeTeachingBroadcast(sessionId, STATE_EVENT, (payload) => {
      if (role !== 'candidate' || !isState(payload)) return
      stateRef.current = payload
      setActiveState(payload.active)
    })
    const unsubRequest = subscribeTeachingBroadcast(sessionId, REQUEST_EVENT, () => {
      if (role === 'instructor') publish({ ...stateRef.current, sentAt: Date.now() })
    })

    if (role === 'candidate') void sendTeachingBroadcast(sessionId, REQUEST_EVENT, { requestedAt: Date.now() })

    return () => {
      unsubState()
      unsubRequest()
      if (role === 'candidate') setActiveState(false)
      if (role === 'instructor' && stateRef.current.active) publish({ active: false, sentAt: Date.now() })
    }
  }, [publish, role, sessionId])

  useEffect(() => {
    if (role !== 'instructor' || !sessionId) return
    const timer = window.setInterval(() => {
      if (stateRef.current.active) publish({ ...stateRef.current, sentAt: Date.now() })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [publish, role, sessionId])

  const setActive = useCallback((nextActive: boolean) => {
    if (role !== 'instructor' || !sessionId) return
    const next = { active: nextActive, sentAt: Date.now() }
    stateRef.current = next
    setActiveState(nextActive)
    publish(next)
  }, [publish, role, sessionId])

  return { active, setActive }
}
