import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { CaseMediaRow } from '../caseMedia'
import { sendTeachingBroadcast, subscribeTeachingBroadcast } from './teachingRealtimeBus'

const STATE_EVENT = 'teaching-media-laser-state'
const REQUEST_EVENT = 'teaching-media-laser-request'

type MediaLaserState = {
  active: boolean
  x: number
  y: number
  sentAt: number
  mediaId: string
}

function isMediaLaserState(value: unknown, mediaId: string): value is MediaLaserState {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<MediaLaserState>
  return candidate.mediaId === mediaId
    && typeof candidate.active === 'boolean'
    && typeof candidate.x === 'number'
    && Number.isFinite(candidate.x)
    && typeof candidate.y === 'number'
    && Number.isFinite(candidate.y)
    && typeof candidate.sentAt === 'number'
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function useMediaLaserCandidate(sessionId: string, mediaId: string) {
  const [state, setState] = useState<MediaLaserState | null>(null)

  useEffect(() => {
    const unsubscribe = subscribeTeachingBroadcast(sessionId, STATE_EVENT, (payload) => {
      if (!isMediaLaserState(payload, mediaId)) return
      setState({ ...payload, x: clamp01(payload.x), y: clamp01(payload.y) })
    })
    void sendTeachingBroadcast(sessionId, REQUEST_EVENT, { mediaId, requestedAt: Date.now() })
    return unsubscribe
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
  const [pointer, setPointer] = useState<MediaLaserState>({ active: false, x: 0.5, y: 0.5, sentAt: Date.now(), mediaId: media.id })
  const pointerRef = useRef(pointer)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const lastSentAt = useRef(0)

  useEffect(() => { pointerRef.current = pointer }, [pointer])

  const send = useCallback((next: MediaLaserState, force = false) => {
    const now = Date.now()
    if (!force && now - lastSentAt.current < 30) return
    lastSentAt.current = now
    void sendTeachingBroadcast(sessionId, STATE_EVENT, next)
  }, [sessionId])

  useEffect(() => {
    const unsubscribe = subscribeTeachingBroadcast(sessionId, REQUEST_EVENT, (payload) => {
      if (!payload || typeof payload !== 'object') return
      const request = payload as { mediaId?: unknown }
      if (request.mediaId !== media.id) return
      send(pointerRef.current, true)
    })
    return () => {
      send({ active: false, x: pointerRef.current.x, y: pointerRef.current.y, sentAt: Date.now(), mediaId: media.id }, true)
      unsubscribe()
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
      mediaId: media.id,
    }
    setPointer(next)
    send(next)
  }

  const hidePointer = () => {
    const next = { ...pointerRef.current, active: false, sentAt: Date.now(), mediaId: media.id }
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
