import { useEffect, useMemo, useRef, useState } from 'react'
import { toLegacyProductId, type SimulationProductId } from '../../core/SimulationProductAdapter'
import { useSharedTeachingSession } from './useSharedTeachingSession'
import {
  createProductTeachingSessionRepository,
  type ProductTeachingCreateInput,
  type ProductTeachingMemberRow,
  type ProductTeachingMemberTelemetry,
  type ProductTeachingSessionRow,
} from './productSession'
import { configureSessionLogRuntime, consumeSessionLogModelState, diffSessionState, filterSessionStateChanges, recordSessionLogEvent, settingChangesLabel } from './sessionLog'

export type ProductSessionRuntimeMode = 'simulation' | 'teaching'
const PRODUCT_SESSION_RUNTIME_MODE_KEY = 'loppjusim.product-session-runtime-mode'

function readPreferredRuntimeMode(): ProductSessionRuntimeMode {
  if (typeof window === 'undefined') return 'teaching'
  return window.localStorage.getItem(PRODUCT_SESSION_RUNTIME_MODE_KEY) === 'simulation' ? 'simulation' : 'teaching'
}

function stateRuntimeMode<TState>(state: TState | null | undefined): ProductSessionRuntimeMode | null {
  if (!state || typeof state !== 'object') return null
  return (state as Record<string, unknown>).runtimeMode === 'simulation' ? 'simulation'
    : (state as Record<string, unknown>).runtimeMode === 'teaching' ? 'teaching'
      : null
}

function withRuntimeMode<TState>(state: TState, runtimeMode: ProductSessionRuntimeMode): TState {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return state
  return { ...(state as Record<string, unknown>), runtimeMode } as TState
}

interface UseProductTeachingSessionArgs<TState> {
  productId: SimulationProductId
  state: TState
  setState: (state: TState) => void
  /**
   * Defines which candidate-local fields survive instructor broadcasts. In Simulation
   * mode the same projection is also used in reverse, allowing only those fields to
   * propagate from the candidate back into the authoritative instructor state.
   */
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
  const candidateFastTelemetryTimerRef = useRef<number | null>(null)
  const [preferredRuntimeMode, setPreferredRuntimeModeState] = useState<ProductSessionRuntimeMode>(() => readPreferredRuntimeMode())

  useEffect(() => { stateRef.current = state }, [state])

  const core = useSharedTeachingSession<
    ProductTeachingSessionRow<TState>,
    ProductTeachingMemberRow<TState>,
    ProductTeachingCreateInput<TState>,
    ProductTeachingMemberTelemetry<TState>
  >({
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

  const runtimeMode: ProductSessionRuntimeMode = core.role === 'standalone'
    ? preferredRuntimeMode
    : stateRuntimeMode(core.session?.product_state) ?? 'teaching'

  const setPreferredRuntimeMode = (next: ProductSessionRuntimeMode) => {
    setPreferredRuntimeModeState(next)
    if (typeof window !== 'undefined') window.localStorage.setItem(PRODUCT_SESSION_RUNTIME_MODE_KEY, next)
  }

  useEffect(() => {
    configureSessionLogRuntime({ productId, sessionId: core.session?.id ?? null, role: core.role })
    if (core.role === 'standalone') standaloneStateRef.current = stateRef.current
  }, [productId, core.role, core.session?.id])

  const stateSignature = useMemo(() => {
    try { return JSON.stringify(state) } catch { return '' }
  }, [state])
  const sessionStateSignature = useMemo(() => {
    try { return JSON.stringify(core.session?.product_state ?? null) } catch { return '' }
  }, [core.session?.product_state])
  const candidateMemberSignature = useMemo(() => {
    if (core.role !== 'instructor' || runtimeMode !== 'simulation') return ''
    const candidate = core.members.find((member) => member.role === 'candidate')
    try { return JSON.stringify(candidate?.product_state ?? null) } catch { return '' }
  }, [core.role, core.members, runtimeMode])

  useEffect(() => {
    if (core.role !== 'instructor' || runtimeMode !== 'simulation' || !mergeCandidateState) return
    const candidate = core.members.find((member) => member.role === 'candidate')
    if (!candidate?.product_state) return
    const merged = mergeCandidateState(candidate.product_state, stateRef.current)
    let currentSignature = ''
    let mergedSignature = ''
    try {
      currentSignature = JSON.stringify(stateRef.current)
      mergedSignature = JSON.stringify(merged)
    } catch { return }
    if (currentSignature === mergedSignature) return
    stateRef.current = merged
    suppressInstructorBroadcastRef.current = false
    setState(merged)
  }, [core.role, runtimeMode, candidateMemberSignature, mergeCandidateState, core.members, setState])

  useEffect(() => {
    if (core.role !== 'candidate' || runtimeMode !== 'simulation' || !core.session?.id) return
    if (candidateFastTelemetryTimerRef.current != null) window.clearTimeout(candidateFastTelemetryTimerRef.current)
    candidateFastTelemetryTimerRef.current = window.setTimeout(() => {
      candidateFastTelemetryTimerRef.current = null
      void core.touchMemberNow().catch(() => undefined)
    }, 80)
    return () => {
      if (candidateFastTelemetryTimerRef.current != null) window.clearTimeout(candidateFastTelemetryTimerRef.current)
    }
  }, [core.role, core.session?.id, runtimeMode, stateSignature])

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
      standaloneStateRef.current = after
      if (consumeSessionLogModelState(after)) return
      const changes = filterSessionStateChanges(before, after, diffSessionState(before, after))
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
    state: withRuntimeMode(stateRef.current, preferredRuntimeMode),
  })

  return {
    ...core,
    startInstructor,
    runtimeMode,
    preferredRuntimeMode,
    setPreferredRuntimeMode,
  }
}
