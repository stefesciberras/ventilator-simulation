import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../session/supabase'
import type { TeachingRole } from './types'

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
  const channelRef = useRef<RealtimeChannel | null>(null)
  const activeRef = useRef(false)
  const candidateHandlerRef = useRef(onCandidateState)

  useEffect(() => { activeRef.current = active }, [active])
  useEffect(() => { candidateHandlerRef.current = onCandidateState }, [onCandidateState])

  const broadcastState = useCallback((next: boolean, channel = channelRef.current) => {
    if (!channel || role !== 'instructor' || !sessionId) return
    void channel.send({
      type: 'broadcast',
      event: STATE_EVENT,
      payload: { active: next, sentAt: Date.now() } satisfies FreezeStateMessage,
    })
  }, [role, sessionId])

  useEffect(() => {
    const previous = channelRef.current
    channelRef.current = null
    if (previous) void supabase.removeChannel(previous)
    setActiveState(false)
    activeRef.current = false

    if (!sessionId || role === 'standalone') return

    const channel = supabase.channel(`teaching-waveform-freeze:${sessionId}`, {
      config: { broadcast: { self: false, ack: false } },
    })
      .on('broadcast', { event: STATE_EVENT }, ({ payload }) => {
        if (role !== 'candidate' || !isFreezeStateMessage(payload)) return
        const wasSharedFrozen = activeRef.current
        activeRef.current = payload.active
        setActiveState(payload.active)
        // A remote "false" only resumes a candidate that was actually frozen by the instructor.
        // It must never cancel an independent local candidate freeze.
        if (payload.active || wasSharedFrozen) candidateHandlerRef.current(payload.active)
      })
      .on('broadcast', { event: REQUEST_EVENT }, () => {
        if (role !== 'instructor') return
        void channel.send({
          type: 'broadcast',
          event: STATE_EVENT,
          payload: { active: activeRef.current, sentAt: Date.now() } satisfies FreezeStateMessage,
        })
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && role === 'candidate') {
          void channel.send({ type: 'broadcast', event: REQUEST_EVENT, payload: { requestedAt: Date.now() } })
        }
      })

    channelRef.current = channel
    return () => {
      if (role === 'instructor') {
        void channel.send({
          type: 'broadcast',
          event: STATE_EVENT,
          payload: { active: false, sentAt: Date.now() } satisfies FreezeStateMessage,
        })
      } else if (role === 'candidate' && activeRef.current) {
        candidateHandlerRef.current(false)
      }
      channelRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [role, sessionId])

  useEffect(() => {
    if (role !== 'instructor' || !sessionId) return
    // Only heartbeat an active shared freeze. Repeated false heartbeats would incorrectly
    // override a candidate's independent local freeze.
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
      // Repeat the explicit resume a few times to make release robust without maintaining
      // a continuous false heartbeat.
      window.setTimeout(() => broadcastState(false), 120)
      window.setTimeout(() => broadcastState(false), 400)
    }
  }, [broadcastState, role, sessionId])

  return { active, setActive }
}
