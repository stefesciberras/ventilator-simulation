import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../session/supabase'
import type { CaseMediaRow } from '../caseMedia'

const STATE_EVENT = 'teaching-media-laser-state'
const REQUEST_EVENT = 'teaching-media-laser-request'

type MediaLaserState = {
  active: boolean
  x: number
  y: number
  sentAt: number
}

function isMediaLaserState(value: unknown): value is MediaLaserState {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<MediaLaserState>
  return typeof candidate.active === 'boolean'
    && typeof candidate.x === 'number'
    && Number.isFinite(candidate.x)
    && typeof candidate.y === 'number'
    && Number.isFinite(candidate.y)
    && typeof candidate.sentAt === 'number'
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function channelName(sessionId: string, mediaId: string) {
  return `teaching-media-laser:${sessionId}:${mediaId}`
}

function useMediaLaserCandidate(sessionId: string, mediaId: string) {
  const [state, setState] = useState<MediaLaserState | null>(null)

  useEffect(() => {
    const channel = supabase.channel(channelName(sessionId, mediaId), { config: { broadcast: { self: false, ack: false } } })
      .on('broadcast', { event: STATE_EVENT }, ({ payload }) => {
        if (!isMediaLaserState(payload)) return
        setState({ ...payload, x: clamp01(payload.x), y: clamp01(payload.y) })
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void channel.send({ type: 'broadcast', event: REQUEST_EVENT, payload: { requestedAt: Date.now() } })
        }
      })
    return () => { void supabase.removeChannel(channel) }
  }, [sessionId, mediaId])

  return state
}

export function TeachingMediaLaserCandidateLayer({
  sessionId,
  mediaId,
  imageUrl,
  title,
}: {
  sessionId: string
  mediaId: string
  imageUrl: string
  title: string
}) {
  const state = useMediaLaserCandidate(sessionId, mediaId)
  return (
    <div className="teaching-media-laser-image-frame candidate">
      <img src={imageUrl} alt={title} />
      {state?.active && (
        <span className="teaching-media-laser-dot" style={{ left: `${state.x * 100}%`, top: `${state.y * 100}%` }} />
      )}
    </div>
  )
}

export function TeachingMediaLaserInstructorModal({
  sessionId,
  media,
  imageUrl,
  onClose,
}: {
  sessionId: string
  media: CaseMediaRow
  imageUrl: string
  onClose: () => void
}) {
  const [pointer, setPointer] = useState<MediaLaserState>({ active: false, x: 0.5, y: 0.5, sentAt: Date.now() })
  const pointerRef = useRef(pointer)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const lastSentAt = useRef(0)

  useEffect(() => { pointerRef.current = pointer }, [pointer])

  const send = useCallback((next: MediaLaserState, force = false, channel = channelRef.current) => {
    if (!channel) return
    const now = Date.now()
    if (!force && now - lastSentAt.current < 30) return
    lastSentAt.current = now
    void channel.send({ type: 'broadcast', event: STATE_EVENT, payload: next })
  }, [])

  useEffect(() => {
    const channel = supabase.channel(channelName(sessionId, media.id), { config: { broadcast: { self: false, ack: false } } })
      .on('broadcast', { event: REQUEST_EVENT }, () => {
        send(pointerRef.current, true, channel)
      })
      .subscribe()
    channelRef.current = channel
    return () => {
      void channel.send({
        type: 'broadcast',
        event: STATE_EVENT,
        payload: { active: false, x: pointerRef.current.x, y: pointerRef.current.y, sentAt: Date.now() } satisfies MediaLaserState,
      })
      channelRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [media.id, send, sessionId])

  const updatePointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const image = imageRef.current
    if (!image) return
    const rect = image.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
    if (!inside) return
    event.preventDefault()
    const next: MediaLaserState = {
      active: true,
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
      sentAt: Date.now(),
    }
    setPointer(next)
    send(next)
  }

  const hidePointer = () => {
    const next = { ...pointerRef.current, active: false, sentAt: Date.now() }
    setPointer(next)
    send(next, true)
  }

  return (
    <div className="teaching-media-laser-overlay" role="presentation">
      <section className="teaching-media-laser-modal" role="dialog" aria-modal="true" aria-label={`Point at ${media.title}`}>
        <header>
          <div><span>Presenting with laser</span><strong>{media.title}</strong></div>
          <button type="button" onClick={onClose}>Close</button>
        </header>
        <div
          className="teaching-media-laser-stage"
          onPointerDown={(event) => { event.currentTarget.setPointerCapture?.(event.pointerId); updatePointer(event) }}
          onPointerMove={updatePointer}
          onPointerUp={hidePointer}
          onPointerCancel={hidePointer}
          onPointerLeave={hidePointer}
        >
          <div className="teaching-media-laser-image-frame instructor">
            <img ref={imageRef} src={imageUrl} alt={media.title} draggable={false} />
            {pointer.active && <span className="teaching-media-laser-dot" style={{ left: `${pointer.x * 100}%`, top: `${pointer.y * 100}%` }} />}
          </div>
        </div>
      </section>
    </div>
  )
}
