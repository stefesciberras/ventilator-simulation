import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../session/supabase'
import type { TeachingRole } from './types'

type TeachingLaserRegion = 'display' | 'waveforms' | 'metrics'

type TeachingLaserRegion = 'display' | 'waveforms' | 'metrics'

interface TeachingLaserPointerState {
  x: number
  y: number
  active: boolean
  sentAt: number
  region?: TeachingLaserRegion
  region?: TeachingLaserRegion
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
    && (candidate.region == null || candidate.region === 'display' || candidate.region === 'waveforms' || candidate.region === 'metrics')
    && (candidate.region == null || candidate.region === 'display' || candidate.region === 'waveforms' || candidate.region === 'metrics')
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
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const [, setLayoutRevision] = useState(0)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const [, setLayoutRevision] = useState(0)
  const localPointerRef = useRef<TeachingLaserPointerState | null>(null)
  const lastSentAtRef = useRef(0)
  const lastReceivedAtRef = useRef(0)
  const isController = role !== 'candidate'

  useEffect(() => { localPointerRef.current = localPointer }, [localPointer])

  useEffect(() => {
    const onResize = () => setLayoutRevision((value) => value + 1)
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])

  useEffect(() => {
    const onResize = () => setLayoutRevision((value) => value + 1)
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])

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
          payload: { x: 0.5, y: 0.5, active: false, sentAt: Date.now(), region: 'display' } satisfies TeachingLaserPointerState,
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
      sendPointer({ x: 0.5, y: 0.5, active: false, sentAt: Date.now(), region: 'display' }, true)
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

  const regionRectFor = (surface: HTMLDivElement, region: TeachingLaserRegion) => {
    if (region === 'display') return surface.getBoundingClientRect()
    const selector = region === 'waveforms' ? '.waveforms' : '.metrics-panel'
    return surface.parentElement?.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ?? surface.getBoundingClientRect()
  }

  const regionAtPoint = (surface: HTMLDivElement, clientX: number, clientY: number): TeachingLaserRegion => {
    for (const region of ['waveforms', 'metrics'] as const) {
      const rect = regionRectFor(surface, region)
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) return region
    }
    return 'display'
  }

  const updateFromPointerEvent = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isController || !enabled) return
    const surface = event.currentTarget
    const region = regionAtPoint(surface, event.clientX, event.clientY)
    const rect = regionRectFor(surface, region)
    if (!rect.width || !rect.height) return
    const next: TeachingLaserPointerState = {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
      active: true,
      sentAt: Date.now(),
      region,
    }
    setLocalPointer(next)
    sendPointer(next)
  }

  const hideLocalPointer = () => {
    if (!isController || !enabled) return
    setLocalPointer(null)
    sendPointer({ x: 0.5, y: 0.5, active: false, sentAt: Date.now(), region: 'display' }, true)
  }

  const displayed = isController ? localPointer : remotePointer
  const displayedPosition = (() => {
    const surface = surfaceRef.current
    if (!surface || !displayed) return { left: `${(displayed?.x ?? 0.5) * 100}%`, top: `${(displayed?.y ?? 0.5) * 100}%` }
    const surfaceRect = surface.getBoundingClientRect()
    const rect = regionRectFor(surface, displayed.region ?? 'display')
    return {
      left: `${rect.left - surfaceRect.left + displayed.x * rect.width}px`,
      top: `${rect.top - surfaceRect.top + displayed.y * rect.height}px`,
    }
  })()
  const visible = Boolean(displayed?.active) && (role === 'candidate' || enabled)

  return (
    <div
      ref={surfaceRef}
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
          style={displayedPosition}
        />
      )}
    </div>
  )
}
