import { useCallback, useEffect, useRef, useState } from 'react'
import type { TeachingRole } from './types'
import { sendTeachingBroadcast, subscribeTeachingBroadcast } from './teachingRealtimeBus'
import { recordSessionLogEvent } from './session/sessionLog'

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

export function useTeachingSharedOxygenFlush(role: TeachingRole, sessionId: string | null) {
  const [active, setActiveState] = useState(false)
  const activeRef = useRef(false)

  useEffect(() => { activeRef.current = active }, [active])

  const broadcastState = useCallback((next: boolean) => {
    if (role !== 'instructor' || !sessionId) return
    void sendTeachingBroadcast(sessionId, STATE_EVENT, {
      active: next,
      sentAt: Date.now(),
    } satisfies SharedOxygenFlushState)
  }, [role, sessionId])

  useEffect(() => {
    activeRef.current = false
    setActiveState(false)
    if (!sessionId || role === 'standalone') return

    const unsubscribeState = subscribeTeachingBroadcast(sessionId, STATE_EVENT, (payload) => {
      if (role !== 'candidate' || !isState(payload)) return
      activeRef.current = payload.active
      setActiveState(payload.active)
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
      if (role === 'instructor') broadcastState(false)
      if (role === 'candidate') {
        activeRef.current = false
        setActiveState(false)
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
    const changed = activeRef.current !== next
    activeRef.current = next
    setActiveState(next)
    broadcastState(next)
    // Start is logged once by the EDUVENT scenario-action event, covering both
    // local and shared instructor oxygen flushes. The shared controller owns the
    // explicit stop event, avoiding a duplicate start row on long press.
    if (changed && !next) {
      void recordSessionLogEvent({
        sessionId,
        category: 'device',
        eventType: 'oxygen_flush.stopped',
        label: 'Oxygen flush stopped',
        details: { shared: true },
      }).catch(() => undefined)
    }
    if (!next) {
      window.setTimeout(() => broadcastState(false), 120)
      window.setTimeout(() => broadcastState(false), 400)
    }
  }, [broadcastState, role, sessionId])

  return { active, setActive }
}
