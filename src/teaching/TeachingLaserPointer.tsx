import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../session/supabase'
import type { TeachingRole } from './types'

interface TeachingLaserPointerState {
  x: number
  y: number
  active: boolean
  sentAt: number
}

const POINTER_EVENT = 'teaching-laser-pointer'
const HEARTBEAT_MS = 700
const STALE_AFTER_MS = 2400
const MIN_SEND_INTERVAL_MS = 32

function isPointerState(value: unknown): value is TeachingLaserPointerState {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<TeachingLaserPointerState>
  return typeof candidate.x === 'number'
    && Number.isFinite(candidate.x)
    && typeof candidate.y === 'number'
    && Number.isFinite(candidate.y)
    && typeof candidate.active === 'boolean'
    && typeof candidate.sentAt === 'number'
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

export function TeachingLaserPointerSurface({
  role,
  sessionId,
  enabled,
}: {
  role: TeachingRole
  sessionId: string | null
  enabled: boolean
}) {
  const [remotePointer, setRemotePointer] = useState<TeachingLaserPointerState | null>(null)
  const [localPointer, setLocalPointer] = useState<TeachingLaserPointerState | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const localPointerRef = useRef<TeachingLaserPointerState | null>(null)
  const lastSentAtRef = useRef(0)
  const lastReceivedAtRef = useRef(0)

  useEffect(() => { localPointerRef.current = localPointer }, [localPointer])

  const sendPointer = (next: TeachingLaserPointerState, force = false) => {
    const channel = channelRef.current
    if (!channel || role !== 'instructor') return
    const now = Date.now()
    if (!force && now - lastSentAtRef.current < MIN_SEND_INTERVAL_MS) return
    lastSentAtRef.current = now
    void channel.send({ type: 'broadcast', event: POINTER_EVENT, payload: next })
  }

  useEffect(() => {
    const previous = channelRef.current
    channelRef.current = null
    if (previous) void supabase.removeChannel(previous)
    setRemotePointer(null)
    setLocalPointer(null)

    if (!sessionId || role === 'standalone') return

    const channel = supabase.channel(`teaching-pointer:${sessionId}`, {
      config: { broadcast: { self: false, ack: false } },
    })
      .on('broadcast', { event: POINTER_EVENT }, ({ payload }) => {
        if (role !== 'candidate' || !isPointerState(payload)) return
        lastReceivedAtRef.current = Date.now()
        setRemotePointer({ ...payload, x: clamp01(payload.x), y: clamp01(payload.y) })
      })
      .subscribe()

    channelRef.current = channel
    return () => {
      if (role === 'instructor') {
        void channel.send({
          type: 'broadcast',
          event: POINTER_EVENT,
          payload: { x: 0.5, y: 0.5, active: false, sentAt: Date.now() } satisfies TeachingLaserPointerState,
        })
      }
      channelRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [role, sessionId])

  useEffect(() => {
    if (role !== 'instructor' || !sessionId) return
    if (!enabled) {
      setLocalPointer(null)
      sendPointer({ x: 0.5, y: 0.5, active: false, sentAt: Date.now() }, true)
      return
    }
    const heartbeat = window.setInterval(() => {
      const pointer = localPointerRef.current
      if (pointer?.active) sendPointer({ ...pointer, sentAt: Date.now() }, true)
    }, HEARTBEAT_MS)
    return () => window.clearInterval(heartbeat)
  }, [enabled, role, sessionId])

  useEffect(() => {
    if (role !== 'candidate' || !sessionId) return
    const staleTimer = window.setInterval(() => {
      if (remotePointer?.active && Date.now() - lastReceivedAtRef.current > STALE_AFTER_MS) setRemotePointer(null)
    }, 600)
    return () => window.clearInterval(staleTimer)
  }, [remotePointer, role, sessionId])

  const updateFromPointerEvent = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (role !== 'instructor' || !enabled) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const next: TeachingLaserPointerState = {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
      active: true,
      sentAt: Date.now(),
    }
    setLocalPointer(next)
    sendPointer(next)
  }

  const hideLocalPointer = () => {
    if (role !== 'instructor' || !enabled) return
    setLocalPointer(null)
    sendPointer({ x: 0.5, y: 0.5, active: false, sentAt: Date.now() }, true)
  }

  const displayed = role === 'instructor' ? localPointer : remotePointer
  const visible = Boolean(displayed?.active) && (role === 'candidate' || enabled)

  return (
    <div
      className={`teaching-laser-layer ${role === 'instructor' && enabled ? 'teaching-laser-layer-active' : ''}`}
      aria-hidden="true"
      onPointerDown={(event) => {
        if (role !== 'instructor' || !enabled) return
        event.preventDefault()
        event.currentTarget.setPointerCapture?.(event.pointerId)
        updateFromPointerEvent(event)
      }}
      onPointerMove={updateFromPointerEvent}
      onPointerLeave={hideLocalPointer}
    >
      {visible && displayed && (
        <span
          className="teaching-laser-dot"
          style={{ left: `${displayed.x * 100}%`, top: `${displayed.y * 100}%` }}
        />
      )}
    </div>
  )
}
