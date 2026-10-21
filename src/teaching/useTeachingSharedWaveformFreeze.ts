import { useCallback, useEffect, useRef, useState } from 'react'
import type { TeachingRole } from './types'
import { sendTeachingBroadcast, subscribeTeachingBroadcast } from './teachingRealtimeBus'

const STATE_EVENT = 'teaching-waveform-freeze-state'
const REQUEST_EVENT = 'teaching-waveform-freeze-request'

interface FreezeStateMessage {
  active: boolean
  sentAt: number
}

function isFreezeStateMessage(value: unknown): value is FreezeStateMessage {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<FreezeStateMessage>
  return typeof candidate.active === 'boolean' && typeof candidate.sentAt === 'number'
}

export function useTeachingSharedWaveformFreeze(
  role: TeachingRole,
  sessionId: string | null,
  onCandidateState: (active: boolean) => void,
) {
  const [active, setActiveState] = useState(false)
  const activeRef = useRef(false)
  const candidateHandlerRef = useRef(onCandidateState)

  useEffect(() => { activeRef.current = active }, [active])
  useEffect(() => { candidateHandlerRef.current = onCandidateState }, [onCandidateState])

  const broadcastState = useCallback((next: boolean) => {
    if (role !== 'instructor' || !sessionId) return
    void sendTeachingBroadcast(sessionId, STATE_EVENT, {
      active: next,
      sentAt: Date.now(),
    } satisfies FreezeStateMessage)
  }, [role, sessionId])

  useEffect(() => {
    setActiveState(false)
    activeRef.current = false
    if (!sessionId || role === 'standalone') return

    const unsubscribeState = subscribeTeachingBroadcast(sessionId, STATE_EVENT, (payload) => {
      if (role !== 'candidate' || !isFreezeStateMessage(payload)) return
      const wasSharedFrozen = activeRef.current
      activeRef.current = payload.active
      setActiveState(payload.active)
      if (payload.active || wasSharedFrozen) candidateHandlerRef.current(payload.active)
    })

    const unsubscribeRequest = subscribeTeachingBroadcast(sessionId, REQUEST_EVENT, () => {
      if (role !== 'instructor') return
      broadcastState(activeRef.current)
    })

    if (role === 'candidate') {
      void sendTeachingBroadcast(sessionId, REQUEST_EVENT, { requestedAt: Date.now() })
    }

    return () => {
      unsubscribeState()
      unsubscribeRequest()
      if (role === 'instructor') {
        broadcastState(false)
      } else if (role === 'candidate' && activeRef.current) {
        candidateHandlerRef.current(false)
      }
    }
  }, [broadcastState, role, sessionId])

  useEffect(() => {
    if (role !== 'instructor' || !sessionId) return
    const timer = window.setInterval(() => {
      if (activeRef.current) broadcastState(true)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [broadcastState, role, sessionId])

  const setActive = useCallback((next: boolean) => {
    if (role !== 'instructor' || !sessionId) return
    activeRef.current = next
    setActiveState(next)
    broadcastState(next)
    if (!next) {
      window.setTimeout(() => broadcastState(false), 120)
      window.setTimeout(() => broadcastState(false), 400)
    }
  }, [broadcastState, role, sessionId])

  return { active, setActive }
}
