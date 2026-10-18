import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../session/supabase'
import type { TeachingRole } from './types'

type TeachingLaserRegion = 'display' | 'waveforms' | 'metrics'

interface TeachingLaserPointerState {
  x: number
  y: number
  active: boolean
  sentAt: number
  region?: TeachingLaserRegion
}

interface TeachingWaveformCardSnapshot {
  label: string
  unit: string
  image: string
}

interface TeachingWaveformSnapshot {
  frameId: string
  capturedAt: number
  clockText: string | null
  cards: TeachingWaveformCardSnapshot[]
}

interface TeachingWaveformSnapshotMessage {
  active: boolean
  snapshot?: TeachingWaveformSnapshot
}

interface TeachingClockState {
  text: string
  sentAt: number
}

const POINTER_EVENT = 'teaching-laser-pointer'
const SNAPSHOT_EVENT = 'teaching-laser-waveform-snapshot'
const SNAPSHOT_REQUEST_EVENT = 'teaching-laser-waveform-request'
const CLOCK_EVENT = 'teaching-session-clock'
const HEARTBEAT_MS = 700
const CLOCK_BROADCAST_MS = 500
const STALE_AFTER_MS = 2400
const CLOCK_STALE_AFTER_MS = 2500
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
}

function isWaveformSnapshot(value: unknown): value is TeachingWaveformSnapshot {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<TeachingWaveformSnapshot>
  return typeof candidate.frameId === 'string'
    && typeof candidate.capturedAt === 'number'
    && Array.isArray(candidate.cards)
    && candidate.cards.length > 0
    && candidate.cards.length <= 4
    && candidate.cards.every((card) => Boolean(card)
      && typeof card === 'object'
      && typeof (card as TeachingWaveformCardSnapshot).label === 'string'
      && typeof (card as TeachingWaveformCardSnapshot).unit === 'string'
      && typeof (card as TeachingWaveformCardSnapshot).image === 'string')
}

function isWaveformSnapshotMessage(value: unknown): value is TeachingWaveformSnapshotMessage {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<TeachingWaveformSnapshotMessage>
  return typeof candidate.active === 'boolean'
    && (!candidate.active || isWaveformSnapshot(candidate.snapshot))
}

function isClockState(value: unknown): value is TeachingClockState {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<TeachingClockState>
  return typeof candidate.text === 'string'
    && candidate.text.length > 0
    && typeof candidate.sentAt === 'number'
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function readVisibleClockText(): string | null {
  const clock = document.querySelector<HTMLElement>('.simulation-clock > strong:not(.teaching-shared-session-clock)')
  const text = clock?.textContent?.trim()
  return text || null
}

function captureCanvasImage(canvas: HTMLCanvasElement): string | null {
  try {
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    const width = Math.max(320, Math.min(720, Math.round(rect.width)))
    const height = Math.max(90, Math.round(rect.height * (width / rect.width)))
    const copy = document.createElement('canvas')
    copy.width = width
    copy.height = height
    const ctx = copy.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#071015'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(canvas, 0, 0, width, height)
    return copy.toDataURL('image/jpeg', 0.84)
  } catch {
    return null
  }
}

function captureWaveformSnapshot(surface: HTMLDivElement): TeachingWaveformSnapshot | null {
  const waveforms = surface.parentElement?.querySelector<HTMLElement>('.waveforms')
  if (!waveforms) return null
  const cards = Array.from(waveforms.querySelectorAll<HTMLElement>('.waveform-card'))
    .slice(0, 4)
    .map((card) => {
      const canvas = card.querySelector<HTMLCanvasElement>('canvas')
      const image = canvas ? captureCanvasImage(canvas) : null
      if (!image) return null
      return {
        label: card.querySelector<HTMLElement>('.waveform-label strong')?.textContent?.trim() || 'Trace',
        unit: card.querySelector<HTMLElement>('.waveform-label span')?.textContent?.trim() || '',
        image,
      } satisfies TeachingWaveformCardSnapshot
    })
    .filter((card): card is TeachingWaveformCardSnapshot => Boolean(card))

  if (!cards.length) return null
  return {
    frameId: crypto.randomUUID(),
    capturedAt: Date.now(),
    clockText: readVisibleClockText(),
    cards,
  }
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
            ? (enabled ? 'The instructor waveform is frozen and shared while you point.' : 'Share a frozen instructor waveform and pointer with all candidates.')
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
  const [localSnapshot, setLocalSnapshot] = useState<TeachingWaveformSnapshot | null>(null)
  const [remoteSnapshot, setRemoteSnapshot] = useState<TeachingWaveformSnapshot | null>(null)
  const [remoteClock, setRemoteClock] = useState<TeachingClockState | null>(null)
  const [clockTarget, setClockTarget] = useState<HTMLElement | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const [, setLayoutRevision] = useState(0)
  const localPointerRef = useRef<TeachingLaserPointerState | null>(null)
  const localSnapshotRef = useRef<TeachingWaveformSnapshot | null>(null)
  const lastSentAtRef = useRef(0)
  const lastReceivedAtRef = useRef(0)
  const lastClockReceivedAtRef = useRef(0)
  const isController = role !== 'candidate'

  useEffect(() => { localPointerRef.current = localPointer }, [localPointer])
  useEffect(() => { localSnapshotRef.current = localSnapshot }, [localSnapshot])

  useEffect(() => {
    const refreshLayout = () => {
      setLayoutRevision((value) => value + 1)
      setClockTarget(document.querySelector<HTMLElement>('.simulation-clock'))
    }
    refreshLayout()
    window.addEventListener('resize', refreshLayout)
    window.addEventListener('orientationchange', refreshLayout)
    return () => {
      window.removeEventListener('resize', refreshLayout)
      window.removeEventListener('orientationchange', refreshLayout)
    }
  }, [])

  useEffect(() => {
    if (!clockTarget) return
    const shouldSync = role === 'candidate' && Boolean(remoteClock)
    clockTarget.classList.toggle('teaching-clock-synced', shouldSync)
    return () => clockTarget.classList.remove('teaching-clock-synced')
  }, [clockTarget, role, remoteClock])

  const sendPointer = (next: TeachingLaserPointerState, force = false) => {
    const channel = channelRef.current
    if (!channel || role !== 'instructor' || !sessionId) return
    const now = Date.now()
    if (!force && now - lastSentAtRef.current < MIN_SEND_INTERVAL_MS) return
    lastSentAtRef.current = now
    void channel.send({ type: 'broadcast', event: POINTER_EVENT, payload: next })
  }

  const sendSnapshot = (snapshot: TeachingWaveformSnapshot | null) => {
    const channel = channelRef.current
    if (!channel || role !== 'instructor' || !sessionId) return
    const payload: TeachingWaveformSnapshotMessage = snapshot
      ? { active: true, snapshot }
      : { active: false }
    void channel.send({ type: 'broadcast', event: SNAPSHOT_EVENT, payload })
  }

  const requestSnapshot = (channel = channelRef.current) => {
    if (!channel || role !== 'candidate' || !sessionId) return
    void channel.send({ type: 'broadcast', event: SNAPSHOT_REQUEST_EVENT, payload: { requestedAt: Date.now() } })
  }

  useEffect(() => {
    const previous = channelRef.current
    channelRef.current = null
    if (previous) void supabase.removeChannel(previous)
    setRemotePointer(null)
    setLocalPointer(null)
    setRemoteSnapshot(null)
    setRemoteClock(null)

    if (!sessionId || role === 'standalone') return

    const channel = supabase.channel(`teaching-pointer:${sessionId}`, {
      config: { broadcast: { self: false, ack: false } },
    })
      .on('broadcast', { event: POINTER_EVENT }, ({ payload }) => {
        if (role !== 'candidate' || !isPointerState(payload)) return
        lastReceivedAtRef.current = Date.now()
        setRemotePointer({ ...payload, x: clamp01(payload.x), y: clamp01(payload.y) })
      })
      .on('broadcast', { event: SNAPSHOT_EVENT }, ({ payload }) => {
        if (role !== 'candidate' || !isWaveformSnapshotMessage(payload)) return
        setRemoteSnapshot(payload.active && payload.snapshot ? payload.snapshot : null)
      })
      .on('broadcast', { event: SNAPSHOT_REQUEST_EVENT }, () => {
        if (role !== 'instructor') return
        const snapshot = localSnapshotRef.current
        if (snapshot) void channel.send({ type: 'broadcast', event: SNAPSHOT_EVENT, payload: { active: true, snapshot } satisfies TeachingWaveformSnapshotMessage })
      })
      .on('broadcast', { event: CLOCK_EVENT }, ({ payload }) => {
        if (role !== 'candidate' || !isClockState(payload)) return
        lastClockReceivedAtRef.current = Date.now()
        setRemoteClock(payload)
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && role === 'candidate') requestSnapshot(channel)
      })

    channelRef.current = channel
    return () => {
      if (role === 'instructor') {
        void channel.send({
          type: 'broadcast',
          event: POINTER_EVENT,
          payload: { x: 0.5, y: 0.5, active: false, sentAt: Date.now(), region: 'display' } satisfies TeachingLaserPointerState,
        })
        void channel.send({ type: 'broadcast', event: SNAPSHOT_EVENT, payload: { active: false } satisfies TeachingWaveformSnapshotMessage })
      }
      channelRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [role, sessionId])

  useEffect(() => {
    if (role !== 'instructor' || !sessionId) return
    const broadcastClock = () => {
      const channel = channelRef.current
      const text = readVisibleClockText()
      if (!channel || !text) return
      void channel.send({ type: 'broadcast', event: CLOCK_EVENT, payload: { text, sentAt: Date.now() } satisfies TeachingClockState })
    }
    broadcastClock()
    const timer = window.setInterval(broadcastClock, CLOCK_BROADCAST_MS)
    return () => window.clearInterval(timer)
  }, [role, sessionId])

  useEffect(() => {
    if (!isController) return
    if (!enabled) {
      setLocalPointer(null)
      localSnapshotRef.current = null
      setLocalSnapshot(null)
      sendPointer({ x: 0.5, y: 0.5, active: false, sentAt: Date.now(), region: 'display' }, true)
      if (role === 'instructor' && sessionId) sendSnapshot(null)
      return
    }

    if (role !== 'instructor' || !sessionId) return
    const capture = () => {
      const surface = surfaceRef.current
      if (!surface) return
      const snapshot = captureWaveformSnapshot(surface)
      if (!snapshot) return
      localSnapshotRef.current = snapshot
      setLocalSnapshot(snapshot)
      sendSnapshot(snapshot)
    }
    const timer = window.setTimeout(capture, 60)
    return () => window.clearTimeout(timer)
  }, [enabled, role, sessionId, isController])

  useEffect(() => {
    if (!isController || !enabled || role !== 'instructor' || !sessionId) return
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
      if (remoteClock && Date.now() - lastClockReceivedAtRef.current > CLOCK_STALE_AFTER_MS) setRemoteClock(null)
    }, 600)
    return () => window.clearInterval(staleTimer)
  }, [remotePointer, remoteClock, role, sessionId])

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
  const sharedSnapshot = role === 'candidate' ? remoteSnapshot : localSnapshot
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
  const sharedFramePosition = (() => {
    const surface = surfaceRef.current
    if (!surface || !sharedSnapshot) return null
    const surfaceRect = surface.getBoundingClientRect()
    const rect = regionRectFor(surface, 'waveforms')
    return {
      left: `${rect.left - surfaceRect.left}px`,
      top: `${rect.top - surfaceRect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      gridTemplateRows: `repeat(${sharedSnapshot.cards.length}, minmax(0, 1fr))`,
    }
  })()
  const visible = Boolean(displayed?.active) && (role === 'candidate' || enabled)

  const clockPortal = role === 'candidate' && remoteClock && clockTarget
    ? createPortal(<strong className="teaching-shared-session-clock">{remoteClock.text}</strong>, clockTarget)
    : null

  return (
    <>
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
        {sharedSnapshot && sharedFramePosition && (
          <div className="teaching-shared-waveform-frame" style={sharedFramePosition}>
            <span className="teaching-shared-waveform-badge">
              Instructor waveform{sharedSnapshot.clockText ? ` · ${sharedSnapshot.clockText}` : ''}
            </span>
            {sharedSnapshot.cards.map((card, index) => (
              <div key={`${sharedSnapshot.frameId}-${index}`} className="teaching-shared-waveform-card">
                <div className="teaching-shared-waveform-label"><strong>{card.label}</strong>{card.unit && <span>{card.unit}</span>}</div>
                <img src={card.image} alt="" draggable={false} />
              </div>
            ))}
          </div>
        )}
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
      {clockPortal}
    </>
  )
}
