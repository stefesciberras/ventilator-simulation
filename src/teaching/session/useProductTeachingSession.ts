import { useEffect, useMemo, useRef } from 'react'
import { useSharedTeachingSession } from './useSharedTeachingSession'
import {
  createProductTeachingSessionRepository,
  type ProductTeachingCreateInput,
  type ProductTeachingMemberRow,
  type ProductTeachingMemberTelemetry,
  type ProductTeachingSessionRow,
} from './productSession'
import {
  configureSessionLogRuntime,
  diffSessionState,
  recordSessionLogEvent,
  settingChangesLabel,
} from './sessionLog'

interface UseProductTeachingSessionArgs<TState> {
  productId: string
  state: TState
  setState: (state: TState) => void
  instructorBroadcastDebounceMs?: number
}

/**
 * Generic EDUSIM live-session adapter for products that can represent their
 * synchronized simulator state as one JSON-serialisable object.
 *
 * EDUVENT retains its richer transport adapter for now, but both products use
 * the same useSharedTeachingSession lifecycle underneath. EDUMON uses this
 * adapter directly.
 */
export function useProductTeachingSession<TState>({
  productId,
  state,
  setState,
  instructorBroadcastDebounceMs = 120,
}: UseProductTeachingSessionArgs<TState>) {
  const normalizedProductId = productId.trim().toLowerCase()
  const repository = useMemo(
    () => createProductTeachingSessionRepository<TState>(normalizedProductId),
    [normalizedProductId],
  )
  const stateRef = useRef(state)
  const suppressInstructorBroadcastRef = useRef(false)
  const suppressSessionLogRef = useRef(false)
  const lastLoggedStateRef = useRef(state)
  const sessionLogTimerRef = useRef<number | null>(null)

  useEffect(() => { stateRef.current = state }, [state])

  const core = useSharedTeachingSession<
    ProductTeachingSessionRow<TState>,
    ProductTeachingMemberRow<TState>,
    ProductTeachingCreateInput<TState>,
    ProductTeachingMemberTelemetry<TState>
  >({
    storageNamespace: `edusim.${normalizedProductId}`,
    repository,
    getMemberTelemetry: () => ({ state: stateRef.current }),
    host: {
      onSessionRow: (row, nextRole, source, force) => {
        if (nextRole === 'candidate') {
          suppressSessionLogRef.current = true
          stateRef.current = row.product_state
          lastLoggedStateRef.current = row.product_state
          setState(row.product_state)
          window.setTimeout(() => { suppressSessionLogRef.current = false }, 50)
          return
        }
        if (nextRole === 'instructor' && force && source === 'resume') {
          suppressInstructorBroadcastRef.current = true
          suppressSessionLogRef.current = true
          stateRef.current = row.product_state
          lastLoggedStateRef.current = row.product_state
          setState(row.product_state)
          window.setTimeout(() => {
            suppressInstructorBroadcastRef.current = false
            suppressSessionLogRef.current = false
          }, 50)
        }
      },
    },
  })

  useEffect(() => {
    configureSessionLogRuntime({
      productId: normalizedProductId,
      sessionId: core.session?.id ?? null,
      role: core.role,
    })
    lastLoggedStateRef.current = stateRef.current
  }, [normalizedProductId, core.role, core.session?.id])

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
    if (sessionLogTimerRef.current != null) window.clearTimeout(sessionLogTimerRef.current)
    if (core.role === 'standalone' || !core.session?.id || suppressSessionLogRef.current) {
      lastLoggedStateRef.current = state
      return
    }

    sessionLogTimerRef.current = window.setTimeout(() => {
      if (suppressSessionLogRef.current || !core.session?.id) return
      const before = lastLoggedStateRef.current
      const after = stateRef.current
      const changes = diffSessionState(before, after)
      lastLoggedStateRef.current = after
      if (!changes.length) return
      void recordSessionLogEvent({
        category: 'settings',
        eventType: 'simulator.settings.changed',
        label: settingChangesLabel('Settings changed', changes),
        details: { changes },
      })
    }, 350)

    return () => {
      if (sessionLogTimerRef.current != null) window.clearTimeout(sessionLogTimerRef.current)
    }
  }, [stateSignature, state, core.role, core.session?.id])

  const startInstructor = () => core.startInstructor({
    productId: normalizedProductId,
    state: stateRef.current,
  })

  return {
    ...core,
    startInstructor,
  }
}
