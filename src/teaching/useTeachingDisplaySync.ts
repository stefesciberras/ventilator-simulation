import { useCallback, useEffect, useRef, useState } from 'react'
import type { TeachingRole } from './types'
import { sendTeachingBroadcast, subscribeTeachingBroadcast } from './teachingRealtimeBus'

const STATE_EVENT = 'teaching-display-state'
const REQUEST_EVENT = 'teaching-display-state-request'

export interface SharedTeachingDisplayState {
  frozen: boolean
  laserEnabled: boolean
  sentAt: number
}

function isState(value: unknown): value is SharedTeachingDisplayState {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<SharedTeachingDisplayState>
  return typeof candidate.frozen === 'boolean'
    && typeof candidate.laserEnabled === 'boolean'
    && typeof candidate.sentAt === 'number'
}

interface UseTeachingDisplaySyncOptions {
  localLaserEnabled?: boolean
  onCandidateFrozenChange?: (frozen: boolean) => void
  onCandidateLaserChange?: (enabled: boolean) => void
}

/**
 * Product-neutral authority for shared teaching display state. Pointer position and
 * captured waveform imagery remain in TeachingLaserPointerSurface; this hook owns
 * the session-level freeze/laser authority that every simulator can consume.
 */
export function useTeachingDisplaySync(
  role: TeachingRole,
  sessionId: string | null,
  options: UseTeachingDisplaySyncOptions = {},
) {
  const [state, setState] = useState<SharedTeachingDisplayState>({ frozen: false, laserEnabled: false, sentAt: Date.now() })
  const stateRef = useRef(state)
  const frozenHandlerRef = useRef(options.onCandidateFrozenChange)
  const laserHandlerRef = useRef(options.onCandidateLaserChange)

  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { frozenHandlerRef.current = options.onCandidateFrozenChange }, [options.onCandidateFrozenChange])
  useEffect(() => { laserHandlerRef.current = options.onCandidateLaserChange }, [options.onCandidateLaserChange])

  const publish = useCallback((next: SharedTeachingDisplayState) => {
    if (role !== 'instructor' || !sessionId) return
    void sendTeachingBroadcast(sessionId, STATE_EVENT, next)
  }, [role, sessionId])

  useEffect(() => {
    const reset = { frozen: false, laserEnabled: false, sentAt: Date.now() }
    stateRef.current = reset
    setState(reset)
    if (!sessionId || role === 'standalone') return

    const unsubState = subscribeTeachingBroadcast(sessionId, STATE_EVENT, (payload) => {
      if (role !== 'candidate' || !isState(payload)) return
      const previous = stateRef.current
      stateRef.current = payload
      setState(payload)
      if (payload.frozen !== previous.frozen) frozenHandlerRef.current?.(payload.frozen)
      if (payload.laserEnabled !== previous.laserEnabled) laserHandlerRef.current?.(payload.laserEnabled)
    })
    const unsubRequest = subscribeTeachingBroadcast(sessionId, REQUEST_EVENT, () => {
      if (role === 'instructor') publish({ ...stateRef.current, sentAt: Date.now() })
    })
    if (role === 'candidate') void sendTeachingBroadcast(sessionId, REQUEST_EVENT, { requestedAt: Date.now() })

    return () => {
      unsubState()
      unsubRequest()
      if (role === 'candidate') {
        if (stateRef.current.frozen) frozenHandlerRef.current?.(false)
        if (stateRef.current.laserEnabled) laserHandlerRef.current?.(false)
      }
      if (role === 'instructor') publish({ frozen: false, laserEnabled: false, sentAt: Date.now() })
    }
  }, [publish, role, sessionId])

  useEffect(() => {
    if (role !== 'instructor' || !sessionId || options.localLaserEnabled == null) return
    if (stateRef.current.laserEnabled === options.localLaserEnabled) return
    const next = { ...stateRef.current, laserEnabled: options.localLaserEnabled, sentAt: Date.now() }
    stateRef.current = next
    setState(next)
    publish(next)
  }, [options.localLaserEnabled, publish, role, sessionId])

  useEffect(() => {
    if (role !== 'instructor' || !sessionId) return
    const timer = window.setInterval(() => {
      if (stateRef.current.frozen || stateRef.current.laserEnabled) publish({ ...stateRef.current, sentAt: Date.now() })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [publish, role, sessionId])

  const setFrozen = useCallback((frozen: boolean) => {
    if (role !== 'instructor' || !sessionId) return
    const next = { ...stateRef.current, frozen, sentAt: Date.now() }
    stateRef.current = next
    setState(next)
    publish(next)
  }, [publish, role, sessionId])

  const setLaserEnabled = useCallback((laserEnabled: boolean) => {
    if (role !== 'instructor' || !sessionId) return
    const next = { ...stateRef.current, laserEnabled, sentAt: Date.now() }
    stateRef.current = next
    setState(next)
    publish(next)
  }, [publish, role, sessionId])

  return { state, setFrozen, setLaserEnabled }
}
