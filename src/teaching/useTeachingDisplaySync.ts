import { useCallback, useEffect, useRef, useState } from 'react'
import type { TeachingRole } from './types'
import { publishLocalSessionControlPatch, subscribeLocalRuntimePayload } from '../session/localRuntimeTransport'
import { sendTeachingBroadcast, subscribeTeachingBroadcast } from './teachingRealtimeBus'
import {
  DEFAULT_SESSION_CONTROL_SNAPSHOT,
  closeSessionControlSubscription,
  fetchSessionControlSnapshot,
  setInstructorGlobalSessionControls,
  subscribeSessionControlSnapshot,
  type SessionControlSnapshot,
} from './session/sessionControls'

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
 * Product-neutral authority for shared display state.
 *
 * Instructor-global waveform freeze is durable session state: local runtime and
 * Realtime broadcast are low-latency paths, while teaching_sessions is the
 * durable recovery source. Laser visibility/position remains ephemeral
 * presentation state and is intentionally not persisted as patient/session state.
 */
export function useTeachingDisplaySync(
  role: TeachingRole,
  sessionId: string | null,
  options: UseTeachingDisplaySyncOptions = {},
) {
  const [state, setState] = useState<SharedTeachingDisplayState>({ frozen: false, laserEnabled: false, sentAt: Date.now() })
  const [controls, setControls] = useState<SessionControlSnapshot>({ ...DEFAULT_SESSION_CONTROL_SNAPSHOT })
  const stateRef = useRef(state)
  const controlsRef = useRef(controls)
  const frozenHandlerRef = useRef(options.onCandidateFrozenChange)
  const laserHandlerRef = useRef(options.onCandidateLaserChange)

  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { controlsRef.current = controls }, [controls])
  useEffect(() => { frozenHandlerRef.current = options.onCandidateFrozenChange }, [options.onCandidateFrozenChange])
  useEffect(() => { laserHandlerRef.current = options.onCandidateLaserChange }, [options.onCandidateLaserChange])

  const applyFrozen = useCallback((frozen: boolean) => {
    const previousFrozen = stateRef.current.frozen
    if (frozen === previousFrozen) return
    const nextState = { ...stateRef.current, frozen, sentAt: Date.now() }
    stateRef.current = nextState
    setState(nextState)
    if (role === 'candidate') frozenHandlerRef.current?.(frozen)
  }, [role])

  const applyPersistentControls = useCallback((nextControls: SessionControlSnapshot) => {
    controlsRef.current = nextControls
    setControls(nextControls)
    applyFrozen(nextControls.waveformsFrozen)
  }, [applyFrozen])

  const publish = useCallback((next: SharedTeachingDisplayState) => {
    if (role !== 'instructor' || !sessionId) return
    void sendTeachingBroadcast(sessionId, STATE_EVENT, next)
  }, [role, sessionId])

  useEffect(() => {
    const resetState = { frozen: false, laserEnabled: false, sentAt: Date.now() }
    stateRef.current = resetState
    setState(resetState)
    controlsRef.current = { ...DEFAULT_SESSION_CONTROL_SNAPSHOT }
    setControls({ ...DEFAULT_SESSION_CONTROL_SNAPSHOT })
    if (!sessionId || role === 'standalone') return

    let active = true
    void fetchSessionControlSnapshot(sessionId)
      .then((snapshot) => { if (active) applyPersistentControls(snapshot) })
      .catch(() => undefined)
    const controlChannel = subscribeSessionControlSnapshot(sessionId, (snapshot) => {
      if (active) applyPersistentControls(snapshot)
    })

    const unsubLocal = subscribeLocalRuntimePayload(sessionId, (payload) => {
      if (role !== 'candidate' || payload.type !== 'session-control') return
      const frozen = payload.update.patch.waveformsFrozen
      if (typeof frozen === 'boolean') applyFrozen(frozen)
    })

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
      active = false
      unsubLocal()
      unsubState()
      unsubRequest()
      void closeSessionControlSubscription(controlChannel)
      if (role === 'candidate') {
        if (stateRef.current.frozen) frozenHandlerRef.current?.(false)
        if (stateRef.current.laserEnabled) laserHandlerRef.current?.(false)
      }
      // A browser refresh/disconnect is not an instruction to clear durable
      // waveform freeze. Only the ephemeral laser is withdrawn on instructor exit.
      if (role === 'instructor' && stateRef.current.laserEnabled) {
        publish({ ...stateRef.current, laserEnabled: false, sentAt: Date.now() })
      }
    }
  }, [applyFrozen, applyPersistentControls, publish, role, sessionId])

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
    publishLocalSessionControlPatch(sessionId, { waveformsFrozen: frozen })
    publish(next)
    void setInstructorGlobalSessionControls(sessionId, { waveformsFrozen: frozen })
      .then(applyPersistentControls)
      .catch(() => {
        void fetchSessionControlSnapshot(sessionId).then(applyPersistentControls).catch(() => undefined)
      })
  }, [applyPersistentControls, publish, role, sessionId])

  const setLaserEnabled = useCallback((laserEnabled: boolean) => {
    if (role !== 'instructor' || !sessionId) return
    const next = { ...stateRef.current, laserEnabled, sentAt: Date.now() }
    stateRef.current = next
    setState(next)
    publish(next)
  }, [publish, role, sessionId])

  return { state, controls, setFrozen, setLaserEnabled }
}
