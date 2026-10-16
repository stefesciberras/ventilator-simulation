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

export function TeachingLaserControl({
  role,
  enabled,
  sessionActive,
  onEnabledChange,
}: {
  role: TeachingRole
  enabled: boolean
  sessionActive: boolean
  onEnabledChange: (enabled: boolean) => void
}) {
  if (role === 'candidate') return null
  const shared = role === 'instructor' && sessionActive
  return (
    <section className="teaching-laser-panel" aria-label="Teaching laser pointer">
      <div className="teaching-laser-panel-heading">
        <div><span className="session-kicker">Teaching tool</span><h3>Laser pointer</h3></div>
        <span className={`teaching-laser-mode ${shared ? 'shared' : 'local'}`}>{shared ? 'Shared' : 'Local'}</span>
      </div>
      <div className="teaching-laser-control-row">
        <button
          type="button"
          className={`teaching-laser-toggle ${enabled ? 'active' : ''}`}
          aria-pressed={enabled}
          onClick={() => onEnabledChange(!enabled)}
        ><span className="teaching-laser-button-dot" />{enabled ? 'Laser pointer on' : 'Laser pointer'}</button>
        <small>
          {shared
            ? (enabled ? 'Move over the simulator display to point for all candidates.' : 'Show a live pointer on candidate simulator displays.')
            : (enabled ? 'Move over the simulator display to point locally.' : 'Use the pointer locally even without starting a teaching session.')}
        </small>
      </div>
    </section>
  )
}

export function TeachingLaserPointerSurface({
  role,
  sessionId,
  enabled,
  onEnabledChange,
}: {
  role: TeachingRole
  sessionId: string | null
  enabled: boolean
  onEnabledChange?: (enabled: boolean) => void
}) {
  const [remotePointer, setRemotePointer] = useState<TeachingLaserPointerState | null>(null)
  const [localPointer, setLocalPointer] = useState<TeachingLaserPointerState | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const localPointerRef = useRef<TeachingLaserPointerState | null>(null)
  const lastSentAtRef = useRef(0)
  const lastReceivedAtRef = useRef(0)
  const isController = role !== 'candidate'

  useEffect(() => { localPointerRef.current = localPointer }, [localPointer])

  const sendPointer = (next: TeachingLaserPointerState, force = false) => {
    const channel = channelRef.current
    if (!channel || role !== 'instructor' || !sessionId) return
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
    if (!isController) return
    if (!enabled) {
      setLocalPointer(null)
      sendPointer({ x: 0.5, y: 0.5, active: false, sentAt: Date.now() }, true)
      return
    }
    if (role !== 'instructor' || !sessionId) return
    const heartbeat = window.setInterval(() => {
      const pointer = localPointerRef.current
      if (pointer?.active) sendPointer({ ...pointer, sentAt: Date.now() }, true)
    }, HEARTBEAT_MS)
    return () => window.clearInterval(heartbeat)
  }, [enabled, role, sessionId, isController])

  useEffect(() => {
    if (role !== 'candidate' || !sessionId) return
    const staleTimer = window.setInterval(() => {
      if (remotePointer?.active && Date.now() - lastReceivedAtRef.current > STALE_AFTER_MS) setRemotePointer(null)
    }, 600)
    return () => window.clearInterval(staleTimer)
  }, [remotePointer, role, sessionId])

  const updateFromPointerEvent = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isController || !enabled) return
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
    if (!isController || !enabled) return
    setLocalPointer(null)
    sendPointer({ x: 0.5, y: 0.5, active: false, sentAt: Date.now() }, true)
  }

  const displayed = isController ? localPointer : remotePointer
  const visible = Boolean(displayed?.active) && (role === 'candidate' || enabled)

  return (
    <div
      className={`teaching-laser-layer ${isController && enabled ? 'teaching-laser-layer-active' : ''}`}
      aria-hidden={!isController}
      onPointerDown={(event) => {
        if (!isController || !enabled) return
        event.preventDefault()
        event.currentTarget.setPointerCapture?.(event.pointerId)
        updateFromPointerEvent(event)
      }}
      onPointerMove={updateFromPointerEvent}
      onPointerLeave={hideLocalPointer}
    >
      {isController && enabled && onEnabledChange && (
        <button
          type="button"
          className="teaching-laser-exit"
          onPointerDown={(event) => event.stopPropagation()}
          onPointerMove={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); onEnabledChange(false) }}
        >Laser on · Exit</button>
      )}
      {visible && displayed && (
        <span
          className="teaching-laser-dot"
          style={{ left: `${displayed.x * 100}%`, top: `${displayed.y * 100}%` }}
        />
      )}
    </div>
  )
}
