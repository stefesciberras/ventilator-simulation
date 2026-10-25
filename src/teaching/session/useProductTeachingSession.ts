import { useEffect, useMemo, useRef } from 'react'
import { toLegacyProductId, type SimulationProductId } from '../../core/SimulationProductAdapter'
import { useSharedTeachingSession } from './useSharedTeachingSession'
import {
  createProductTeachingSessionRepository,
  type ProductTeachingCreateInput,
  type ProductTeachingMemberRow,
  type ProductTeachingMemberTelemetry,
  type ProductTeachingSessionRow,
} from './productSession'
import { configureSessionLogRuntime, diffSessionState, recordSessionLogEvent, settingChangesLabel } from './sessionLog'

interface UseProductTeachingSessionArgs<TState> {
  productId: SimulationProductId
  state: TState
  setState: (state: TState) => void
  mergeCandidateState?: (localState: TState, instructorState: TState) => TState
  instructorBroadcastDebounceMs?: number
}

export function useProductTeachingSession<TState>({
  productId,
  state,
  setState,
  mergeCandidateState,
  instructorBroadcastDebounceMs = 120,
}: UseProductTeachingSessionArgs<TState>) {
  const repository = useMemo(
    () => createProductTeachingSessionRepository<TState>(productId),
    [productId],
  )
  const stateRef = useRef(state)
  const suppressInstructorBroadcastRef = useRef(false)
  const candidateStateInitialisedRef = useRef(false)
  const standaloneStateRef = useRef(state)
  const standaloneLogTimerRef = useRef<number | null>(null)

  useEffect(() => { stateRef.current = state }, [state])

  const core = useSharedTeachingSession<
    ProductTeachingSessionRow<TState>,
    ProductTeachingMemberRow<TState>,
    ProductTeachingCreateInput<TState>,
    ProductTeachingMemberTelemetry<TState>
  >({
    // Session recovery keys are an external local-storage compatibility boundary.
    // Keep their historical namespace while application/domain IDs remain neutral.
    storageNamespace: `edusim.${toLegacyProductId(productId)}`,
    repository,
    getMemberTelemetry: () => ({ state: stateRef.current }),
    host: {
      onSessionRow: (row, nextRole, source, force) => {
        if (nextRole === 'candidate') {
          const nextState = candidateStateInitialisedRef.current && mergeCandidateState
            ? mergeCandidateState(stateRef.current, row.product_state)
            : row.product_state
          candidateStateInitialisedRef.current = true
          stateRef.current = nextState
          setState(nextState)
          return
        }
        if (nextRole === 'instructor' && force && source === 'resume') {
          suppressInstructorBroadcastRef.current = true
          stateRef.current = row.product_state
          setState(row.product_state)
          window.setTimeout(() => { suppressInstructorBroadcastRef.current = false }, 0)
        }
      },
      onSessionCleared: () => {
        candidateStateInitialisedRef.current = false
        standaloneStateRef.current = stateRef.current
      },
    },
  })

  useEffect(() => {
    configureSessionLogRuntime({
      productId,
      sessionId: core.session?.id ?? null,
      role: core.role,
    })
    if (core.role === 'standalone') standaloneStateRef.current = stateRef.current
  }, [productId, core.role, core.session?.id])

  const stateSignature = useMemo(() => {
    try { return JSON.stringify(state) } catch { return '' }
  }, [state])
  const sessionStateSignature = useMemo(() => {
    try { return JSON.stringify(core.session?.product_state ?? null) } catch { return '' }
  }, [core.session?.product_state])

  useEffect(() => {
    if (core.role !== 'instructor' || !core.session || suppressInstructorBroadcastRef.current) return
    if (stateSignature === sessionStateSignature) return
    const timer = window.setTimeout(() => {
      if (!core.session) return
      void core.updateSession({
        product_state: stateRef.current,
        product_state_revision: Number(core.session.product_state_revision ?? 0) + 1,
      })
    }, Math.max(0, instructorBroadcastDebounceMs))
    return () => window.clearTimeout(timer)
  }, [core.role, core.session?.id, core.session?.product_state_revision, stateSignature, sessionStateSignature, instructorBroadcastDebounceMs])

  useEffect(() => {
    if (standaloneLogTimerRef.current != null) window.clearTimeout(standaloneLogTimerRef.current)
    if (core.role !== 'standalone') {
      standaloneStateRef.current = state
      return
    }
    standaloneLogTimerRef.current = window.setTimeout(() => {
      const before = standaloneStateRef.current
      const after = stateRef.current
      const changes = diffSessionState(before, after)
      standaloneStateRef.current = after
      if (!changes.length) return
      void recordSessionLogEvent({
        category: 'settings',
        eventType: 'standalone.settings.changed',
        label: settingChangesLabel('Settings changed', changes),
        details: { before, after, changes },
      }).catch(() => undefined)
    }, 300)
    return () => {
      if (standaloneLogTimerRef.current != null) window.clearTimeout(standaloneLogTimerRef.current)
    }
  }, [core.role, state, stateSignature])

  const startInstructor = () => core.startInstructor({
    productId,
    state: stateRef.current,
  })

  return {
    ...core,
    startInstructor,
  }
}
