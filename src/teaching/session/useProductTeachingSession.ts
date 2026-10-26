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
export const PRODUCT_SESSION_RUNTIME_MODE_KEY = 'loppjusim.product-session-runtime-mode'
export const PRODUCT_SESSION_RUNTIME_MODE_EVENT = 'loppjusim-product-runtime-mode-change'

type ReplicatedActionCommand = {
  sequence: number
  type: 'activate' | 'deactivate' | 'intensity'
  actionId: string
  intensity?: number
  simulationTime: number
}

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

function withActionCommand<TState>(state: TState, actionCommand: ReplicatedActionCommand | null): TState {
  if (!state || typeof state !== 'object' || Array.isArray(state) || !actionCommand) return state
  return { ...(state as Record<string, unknown>), actionCommand } as TState
}

function readActionCommand<TState>(state: TState | null | undefined): ReplicatedActionCommand | null {
  if (!state || typeof state !== 'object') return null
  const value = (state as Record<string, unknown>).actionCommand
  if (!value || typeof value !== 'object') return null
  const command = value as Partial<ReplicatedActionCommand>
  if (!Number.isFinite(command.sequence) || !command.actionId || !command.type || !Number.isFinite(command.simulationTime)) return null
  if (command.type !== 'activate' && command.type !== 'deactivate' && command.type !== 'intensity') return null
  return {
    sequence: Number(command.sequence),
    type: command.type,
    actionId: String(command.actionId),
    intensity: Number.isFinite(command.intensity) ? Number(command.intensity) : undefined,
    simulationTime: Number(command.simulationTime),
  }
}

function isEdumonProduct(productId: SimulationProductId) {
  const value = String(productId).toLowerCase()
  return value.includes('ana') || value.includes('icu')
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
  const repository = useMemo(() => createProductTeachingSessionRepository<TState>(productId), [productId])
  const stateRef = useRef(state)
  const suppressInstructorBroadcastRef = useRef(false)
  const candidateStateInitialisedRef = useRef(false)
  const standaloneStateRef = useRef(state)
  const standaloneLogTimerRef = useRef<number | null>(null)
  const candidateFastTelemetryTimerRef = useRef<number | null>(null)
  const candidateActionCommandRef = useRef<ReplicatedActionCommand | null>(null)
  const processedCandidateActionRef = useRef(new Map<string, number>())
  const [preferredRuntimeMode, setPreferredRuntimeModeState] = useState<ProductSessionRuntimeMode>(() => readPreferredRuntimeMode())

  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => {
    if (typeof window === 'undefined') return
    const syncPreference = () => setPreferredRuntimeModeState(readPreferredRuntimeMode())
    window.addEventListener(PRODUCT_SESSION_RUNTIME_MODE_EVENT, syncPreference)
    window.addEventListener('storage', syncPreference)
    return () => {
      window.removeEventListener(PRODUCT_SESSION_RUNTIME_MODE_EVENT, syncPreference)
      window.removeEventListener('storage', syncPreference)
    }
  }, [])

  const core = useSharedTeachingSession<
    ProductTeachingSessionRow<TState>,
    ProductTeachingMemberRow<TState>,
    ProductTeachingCreateInput<TState>,
    ProductTeachingMemberTelemetry<TState>
  >({
    storageNamespace: `edusim.${toLegacyProductId(productId)}`,
    repository,
    getMemberTelemetry: () => ({ state: withActionCommand(stateRef.current, candidateActionCommandRef.current) }),
    host: {
      onSessionRow: (row, nextRole, source, force) => {
        if (nextRole === 'candidate') {
          const nextState = candidateStateInitialisedRef.current && mergeCandidateState ? mergeCandidateState(stateRef.current, row.product_state) : row.product_state
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
        candidateActionCommandRef.current = null
        processedCandidateActionRef.current.clear()
        standaloneStateRef.current = stateRef.current
      },
    },
  })

  const runtimeMode: ProductSessionRuntimeMode = core.role === 'standalone' ? preferredRuntimeMode : stateRuntimeMode(core.session?.product_state) ?? 'teaching'

  const setPreferredRuntimeMode = (next: ProductSessionRuntimeMode) => {
    setPreferredRuntimeModeState(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PRODUCT_SESSION_RUNTIME_MODE_KEY, next)
      window.dispatchEvent(new Event(PRODUCT_SESSION_RUNTIME_MODE_EVENT))
    }
  }

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.dataset.loppjusimSessionRole = core.role
    document.documentElement.dataset.loppjusimRuntimeMode = runtimeMode
    return () => {
      if (document.documentElement.dataset.loppjusimSessionRole === core.role) delete document.documentElement.dataset.loppjusimSessionRole
      if (document.documentElement.dataset.loppjusimRuntimeMode === runtimeMode) delete document.documentElement.dataset.loppjusimRuntimeMode
    }
  }, [core.role, runtimeMode])

  useEffect(() => {
    configureSessionLogRuntime({ productId, sessionId: core.session?.id ?? null, role: core.role })
    if (core.role === 'standalone') standaloneStateRef.current = stateRef.current
  }, [productId, core.role, core.session?.id])

  useEffect(() => {
    if (!isEdumonProduct(productId)) return
    let disposed = false
    let unsubscribe: (() => void) | null = null
    void import('../../edusim/actions/ActionRuntime').then(({ getActionRuntimeLog, subscribeToActionRuntime }) => {
      if (disposed) return
      const sync = () => {
        if (core.role !== 'candidate' || runtimeMode !== 'simulation') return
        const latest = [...getActionRuntimeLog()].reverse().find((entry) => entry.actionId && (entry.type === 'activate' || entry.type === 'deactivate' || entry.type === 'intensity'))
        if (!latest?.actionId) return
        const previous = candidateActionCommandRef.current
        if (previous && previous.sequence >= latest.sequence) return
        candidateActionCommandRef.current = {
          sequence: latest.sequence,
          type: latest.type as ReplicatedActionCommand['type'],
          actionId: latest.actionId,
          intensity: latest.intensity,
          simulationTime: latest.simulationTime,
        }
        void core.touchMemberNow().catch(() => undefined)
      }
      sync()
      unsubscribe = subscribeToActionRuntime(sync)
    })
    return () => { disposed = true; unsubscribe?.() }
  }, [productId, core.role, core.session?.id, runtimeMode])

  const stateSignature = useMemo(() => { try { return JSON.stringify(state) } catch { return '' } }, [state])
  const sessionStateSignature = useMemo(() => { try { return JSON.stringify(core.session?.product_state ?? null) } catch { return '' } }, [core.session?.product_state])
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
    try { currentSignature = JSON.stringify(stateRef.current); mergedSignature = JSON.stringify(merged) } catch { return }
    if (currentSignature === mergedSignature) return
    stateRef.current = merged
    suppressInstructorBroadcastRef.current = false
    setState(merged)
  }, [core.role, runtimeMode, candidateMemberSignature, mergeCandidateState, core.members, setState])

  useEffect(() => {
    if (!isEdumonProduct(productId) || core.role !== 'instructor' || runtimeMode !== 'simulation') return
    const environment = String(productId).toLowerCase().includes('icu') ? 'edumon-icu' : 'edumon-ana'
    for (const member of core.members) {
      if (member.role !== 'candidate') continue
      const command = readActionCommand(member.product_state)
      if (!command) continue
      const seen = processedCandidateActionRef.current.get(member.id) ?? 0
      if (command.sequence <= seen) continue
      processedCandidateActionRef.current.set(member.id, command.sequence)
      void import('../../edumon/simulationActionBridge').then(({ applyReplicatedEdumonAction }) => applyReplicatedEdumonAction(environment, command).catch(() => false))
    }
  }, [productId, core.role, runtimeMode, candidateMemberSignature, core.members])

  useEffect(() => {
    if (core.role !== 'candidate' || runtimeMode !== 'simulation' || !core.session?.id) return
    if (candidateFastTelemetryTimerRef.current != null) window.clearTimeout(candidateFastTelemetryTimerRef.current)
    candidateFastTelemetryTimerRef.current = window.setTimeout(() => { candidateFastTelemetryTimerRef.current = null; void core.touchMemberNow().catch(() => undefined) }, 80)
    return () => { if (candidateFastTelemetryTimerRef.current != null) window.clearTimeout(candidateFastTelemetryTimerRef.current) }
  }, [core.role, core.session?.id, runtimeMode, stateSignature])

  useEffect(() => {
    if (core.role !== 'instructor' || !core.session || suppressInstructorBroadcastRef.current) return
    if (stateSignature === sessionStateSignature) return
    const timer = window.setTimeout(() => {
      if (!core.session) return
      void core.updateSession({ product_state: stateRef.current, product_state_revision: Number(core.session.product_state_revision ?? 0) + 1 })
    }, Math.max(0, instructorBroadcastDebounceMs))
    return () => window.clearTimeout(timer)
  }, [core.role, core.session?.id, core.session?.product_state_revision, stateSignature, sessionStateSignature, instructorBroadcastDebounceMs])

  useEffect(() => {
    if (standaloneLogTimerRef.current != null) window.clearTimeout(standaloneLogTimerRef.current)
    if (core.role !== 'standalone') { standaloneStateRef.current = state; return }
    standaloneLogTimerRef.current = window.setTimeout(() => {
      const before = standaloneStateRef.current
      const after = stateRef.current
      standaloneStateRef.current = after
      if (consumeSessionLogModelState(after)) return
      const changes = filterSessionStateChanges(before, after, diffSessionState(before, after))
      if (!changes.length) return
      void recordSessionLogEvent({ category: 'settings', eventType: 'standalone.settings.changed', label: settingChangesLabel('Settings changed', changes), details: { before, after, changes } }).catch(() => undefined)
    }, 300)
    return () => { if (standaloneLogTimerRef.current != null) window.clearTimeout(standaloneLogTimerRef.current) }
  }, [core.role, state, stateSignature])

  const startInstructor = () => core.startInstructor({ productId, state: withRuntimeMode(stateRef.current, preferredRuntimeMode) })

  return { ...core, startInstructor, runtimeMode, preferredRuntimeMode, setPreferredRuntimeMode }
}
