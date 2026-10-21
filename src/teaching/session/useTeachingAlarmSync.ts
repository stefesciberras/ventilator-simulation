import { useCallback, useEffect, useRef, useState } from 'react'
import type { TeachingRole } from '../types'
import { sendTeachingBroadcast, subscribeTeachingBroadcast } from '../teachingRealtimeBus'

const STATE_EVENT = 'teaching-alarm-session-state'
const REQUEST_EVENT = 'teaching-alarm-session-request'

export interface SharedAlarmSessionState {
  silenceUntil: number | null
  instructorOverride: boolean
  sentAt: number
}

export interface AlarmPermissionPolicy {
  syncAlarms: boolean
  candidateCanEditAlarms: boolean
  alarmsSilent: boolean
}

export function deriveAlarmSessionSemantics(role: TeachingRole, policy: AlarmPermissionPolicy) {
  const candidate = role === 'candidate'
  return {
    candidateLocked: candidate && policy.syncAlarms && !policy.candidateCanEditAlarms,
    forcedSilent: candidate && policy.syncAlarms && policy.alarmsSilent,
    instructorControlsAlarms: candidate && policy.syncAlarms,
  }
}

function isState(value: unknown): value is SharedAlarmSessionState {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<SharedAlarmSessionState>
  return (candidate.silenceUntil == null || typeof candidate.silenceUntil === 'number')
    && typeof candidate.instructorOverride === 'boolean'
    && typeof candidate.sentAt === 'number'
}

export function useTeachingAlarmSync(
  role: TeachingRole,
  sessionId: string | null,
  onCandidateState?: (state: SharedAlarmSessionState) => void,
) {
  const [state, setState] = useState<SharedAlarmSessionState>({ silenceUntil: null, instructorOverride: false, sentAt: Date.now() })
  const stateRef = useRef(state)
  const candidateHandlerRef = useRef(onCandidateState)

  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { candidateHandlerRef.current = onCandidateState }, [onCandidateState])

  const publish = useCallback((next: SharedAlarmSessionState) => {
    if (role !== 'instructor' || !sessionId) return
    void sendTeachingBroadcast(sessionId, STATE_EVENT, next)
  }, [role, sessionId])

  useEffect(() => {
    setState({ silenceUntil: null, instructorOverride: false, sentAt: Date.now() })
    if (!sessionId || role === 'standalone') return

    const unsubState = subscribeTeachingBroadcast(sessionId, STATE_EVENT, (payload) => {
      if (role !== 'candidate' || !isState(payload)) return
      stateRef.current = payload
      setState(payload)
      candidateHandlerRef.current?.(payload)
    })
    const unsubRequest = subscribeTeachingBroadcast(sessionId, REQUEST_EVENT, () => {
      if (role !== 'instructor') return
      publish({ ...stateRef.current, sentAt: Date.now() })
    })
    if (role === 'candidate') void sendTeachingBroadcast(sessionId, REQUEST_EVENT, { requestedAt: Date.now() })

    return () => {
      unsubState()
      unsubRequest()
      if (role === 'candidate') candidateHandlerRef.current?.({ silenceUntil: null, instructorOverride: false, sentAt: Date.now() })
    }
  }, [publish, role, sessionId])

  useEffect(() => {
    if (role !== 'instructor' || !sessionId) return
    const timer = window.setInterval(() => {
      const current = stateRef.current
      if (current.instructorOverride || (current.silenceUntil ?? 0) > Date.now()) publish({ ...current, sentAt: Date.now() })
    }, 3000)
    return () => window.clearInterval(timer)
  }, [publish, role, sessionId])

  useEffect(() => {
    if (role !== 'candidate' || state.silenceUntil == null) return
    const remaining = state.silenceUntil - Date.now()
    if (remaining <= 0) {
      const next = { ...state, silenceUntil: null, sentAt: Date.now() }
      setState(next)
      candidateHandlerRef.current?.(next)
      return
    }
    const timer = window.setTimeout(() => {
      const next = { ...stateRef.current, silenceUntil: null, sentAt: Date.now() }
      stateRef.current = next
      setState(next)
      candidateHandlerRef.current?.(next)
    }, remaining + 20)
    return () => window.clearTimeout(timer)
  }, [role, state])

  const setInstructorState = useCallback((patch: Partial<Omit<SharedAlarmSessionState, 'sentAt'>>) => {
    if (role !== 'instructor' || !sessionId) return
    const next = { ...stateRef.current, ...patch, sentAt: Date.now() }
    stateRef.current = next
    setState(next)
    publish(next)
  }, [publish, role, sessionId])

  const silenceFor = useCallback((durationMs: number) => setInstructorState({ silenceUntil: Date.now() + Math.max(0, durationMs) }), [setInstructorState])
  const clearSilence = useCallback(() => setInstructorState({ silenceUntil: null }), [setInstructorState])
  const setInstructorOverride = useCallback((enabled: boolean) => setInstructorState({ instructorOverride: enabled }), [setInstructorState])

  return { state, silenceFor, clearSilence, setInstructorOverride }
}
