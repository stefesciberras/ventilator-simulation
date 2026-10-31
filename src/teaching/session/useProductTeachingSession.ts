import { useEffect, useMemo, useRef, useState } from 'react'
import { toLegacyProductId, type SimulationProductId } from '../../core/SimulationProductAdapter'
import type { ActionRuntimeSnapshot } from '../../edusim/actions/ActionRuntime'
import type { LocalRuntimeConnection } from '../../session/localRuntimeTransport'
import { useSharedTeachingSession } from './useSharedTeachingSession'
import {
  applyProductSimulationPatch,
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
  commandId?: string
  actorId?: string
  actorRole?: 'instructor' | 'candidate'
  sequence: number
  type: 'activate' | 'deactivate' | 'intensity'
  actionId: string
  intensity?: number
  simulationTime: number
}

type JsonObject = Record<string, unknown>

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

function stateSignature(value: unknown): string {
  try { return JSON.stringify(value) } catch { return '' }
}

function isPlainObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function buildPatchValue(base: unknown, current: unknown): unknown | undefined {
  if (Object.is(base, current)) return undefined
  if (isPlainObject(base) && isPlainObject(current)) {
    const patch: JsonObject = {}
    for (const key of Object.keys(current)) {
      const child = buildPatchValue(base[key], current[key])
      if (child !== undefined) patch[key] = child
    }
    return Object.keys(patch).length ? patch : undefined
  }
  if (stateSignature(base) === stateSignature(current)) return undefined
  return current
}

function buildStatePatch<TState>(base: TState, current: TState): JsonObject | null {
  const patch = buildPatchValue(base, current)
  return isPlainObject(patch) && Object.keys(patch).length ? patch : null
}

function mergePatchObjects(base: JsonObject, patch: JsonObject): JsonObject {
  const result: JsonObject = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(result[key]) && isPlainObject(value)) result[key] = mergePatchObjects(result[key] as JsonObject, value)
    else result[key] = value
  }
  return result
}

function readActionCommand<TState>(state: TState | null | undefined): ReplicatedActionCommand | null {
  if (!state || typeof state !== 'object') return null
  const value = (state as Record<string, unknown>).actionCommand
  if (!value || typeof value !== 'object') return null
  const command = value as Partial<ReplicatedActionCommand>
  if (!Number.isFinite(command.sequence) || !command.actionId || !command.type || !Number.isFinite(command.simulationTime)) return null
  if (command.type !== 'activate' && command.type !== 'deactivate' && command.type !== 'intensity') return null
  return {
    commandId: typeof command.commandId === 'string' ? command.commandId : undefined,
    actorId: typeof command.actorId === 'string' ? command.actorId : undefined,
    actorRole: command.actorRole === 'candidate' ? 'candidate' : command.actorRole === 'instructor' ? 'instructor' : undefined,
    sequence: Number(command.sequence),
    type: command.type,
    actionId: String(command.actionId),
    intensity: Number.isFinite(command.intensity) ? Number(command.intensity) : undefined,
    simulationTime: Number(command.simulationTime),
  }
}

function readActionRuntimeSnapshot<TState>(state: TState | null | undefined): ActionRuntimeSnapshot | null {
  if (!state || typeof state !== 'object') return null
  const value = (state as Record<string, unknown>).actionRuntimeSnapshot
  if (!value || typeof value !== 'object') return null
  const snapshot = value as Partial<ActionRuntimeSnapshot>
  if (!Number.isFinite(snapshot.simulationTime) || !Array.isArray(snapshot.activeEffects) || !Array.isArray(snapshot.activeToggleActions)) return null
  return snapshot as ActionRuntimeSnapshot
}

function isEdumonProduct(productId: SimulationProductId) {
  const value = String(productId).toLowerCase()
  return value.includes('ana') || value.includes('icu')
}

interface UseProductTeachingSessionArgs<TState> {
  productId: SimulationProductId
  state: TState
  setState: (state: TState) => void
  /** Teaching-mode candidates preserve these local fields when instructor state arrives. */
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
  const candidateStateInitialisedRef = useRef(false)
  const canonicalStateRef = useRef<TState | null>(null)
  const canonicalStateSignatureRef = useRef('')
  const canonicalRevisionRef = useRef(0)
  const simulationPatchQueueRef = useRef<JsonObject | null>(null)
  const simulationMutationInFlightRef = useRef(false)
  const simulationMutationTimerRef = useRef<number | null>(null)
  const standaloneStateRef = useRef(state)
  const standaloneLogTimerRef = useRef<number | null>(null)
  const processedCanonicalActionsRef = useRef(new Set<string>())
  const applyingCanonicalActionRef = useRef(false)
  const observedLocalActionSequenceRef = useRef(0)
  const localClientIdRef = useRef(crypto.randomUUID())
  const [preferredRuntimeMode, setPreferredRuntimeModeState] = useState<ProductSessionRuntimeMode>(() => readPreferredRuntimeMode())
  const localRuntimeConnection: LocalRuntimeConnection = 'disabled'

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

  const applyCanonicalAction = (nextState: TState) => {
    if (!isEdumonProduct(productId)) return
    const command = readActionCommand(nextState)
    const snapshot = readActionRuntimeSnapshot(nextState)
    if (!command || !snapshot) return
    const key = command.commandId ?? `${command.actorId ?? 'legacy'}:${command.sequence}:${command.actionId}`
    if (processedCanonicalActionsRef.current.has(key)) return
    processedCanonicalActionsRef.current.add(key)
    if (command.actorId && command.actorId === localClientIdRef.current) return
    void import('../../edumon/simulationActionBridge').then(({ applyReplicatedEdumonActionSnapshot }) => {
      applyingCanonicalActionRef.current = true
      try { applyReplicatedEdumonActionSnapshot(snapshot) }
      finally { applyingCanonicalActionRef.current = false }
    })
  }

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
        const rowRuntimeMode = stateRuntimeMode(row.product_state) ?? 'teaching'
        if (rowRuntimeMode === 'simulation') {
          canonicalStateRef.current = row.product_state
          canonicalStateSignatureRef.current = stateSignature(row.product_state)
          canonicalRevisionRef.current = Number(row.product_state_revision ?? 0)
          applyCanonicalAction(row.product_state)
          stateRef.current = row.product_state
          setState(row.product_state)
          candidateStateInitialisedRef.current = true
          return
        }

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
          stateRef.current = row.product_state
          setState(row.product_state)
        }
      },
      onSessionCleared: () => {
        candidateStateInitialisedRef.current = false
        canonicalStateRef.current = null
        canonicalStateSignatureRef.current = ''
        canonicalRevisionRef.current = 0
        simulationPatchQueueRef.current = null
        simulationMutationInFlightRef.current = false
        if (simulationMutationTimerRef.current != null) window.clearTimeout(simulationMutationTimerRef.current)
        simulationMutationTimerRef.current = null
        processedCanonicalActionsRef.current.clear()
        observedLocalActionSequenceRef.current = 0
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

  const flushSimulationPatchRef = useRef<() => Promise<void>>(async () => undefined)

  const scheduleSimulationFlush = (delay = Math.max(40, instructorBroadcastDebounceMs)) => {
    if (simulationMutationTimerRef.current != null) window.clearTimeout(simulationMutationTimerRef.current)
    simulationMutationTimerRef.current = window.setTimeout(() => {
      simulationMutationTimerRef.current = null
      void flushSimulationPatchRef.current()
    }, delay)
  }

  const enqueueSimulationPatch = (patch: JsonObject) => {
    if (!Object.keys(patch).length) return
    simulationPatchQueueRef.current = simulationPatchQueueRef.current
      ? mergePatchObjects(simulationPatchQueueRef.current, patch)
      : patch
    scheduleSimulationFlush()
  }

  flushSimulationPatchRef.current = async () => {
    if (simulationMutationInFlightRef.current) return
    const row = core.session
    const patch = simulationPatchQueueRef.current
    if (!row || core.role === 'standalone' || runtimeMode !== 'simulation' || !patch) return

    simulationPatchQueueRef.current = null
    simulationMutationInFlightRef.current = true
    const mutationId = crypto.randomUUID()
    const expectedRevision = canonicalRevisionRef.current || Number(row.product_state_revision ?? 0)

    try {
      const result = await applyProductSimulationPatch<TState>(productId, row.id, expectedRevision, patch, mutationId)
      if (core.session?.id === result.session.id) core.replaceSession(result.session, 'runtime')
      if (!result.applied) {
        simulationPatchQueueRef.current = simulationPatchQueueRef.current
          ? mergePatchObjects(patch, simulationPatchQueueRef.current)
          : patch
      }
      core.setExternalError(null)
    } catch (cause) {
      simulationPatchQueueRef.current = simulationPatchQueueRef.current
        ? mergePatchObjects(patch, simulationPatchQueueRef.current)
        : patch
      core.setExternalError(cause instanceof Error ? cause.message : 'Unable to update shared Simulation state.')
    } finally {
      simulationMutationInFlightRef.current = false
      if (simulationPatchQueueRef.current) scheduleSimulationFlush(20)
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
    if (!isEdumonProduct(productId) || core.role === 'standalone' || runtimeMode !== 'simulation') return
    let disposed = false
    let unsubscribe: (() => void) | null = null
    void import('../../edusim/actions/ActionRuntime').then(({ getActionRuntimeLog, getActionRuntimeSnapshot, subscribeToActionRuntime }) => {
      if (disposed) return
      const latestAtAttach = [...getActionRuntimeLog()].reverse().find((entry) => entry.actionId && (entry.type === 'activate' || entry.type === 'deactivate' || entry.type === 'intensity'))
      observedLocalActionSequenceRef.current = latestAtAttach?.sequence ?? 0

      const sync = () => {
        if (applyingCanonicalActionRef.current || core.role === 'standalone' || runtimeMode !== 'simulation') return
        const latest = [...getActionRuntimeLog()].reverse().find((entry) => entry.actionId && (entry.type === 'activate' || entry.type === 'deactivate' || entry.type === 'intensity'))
        if (!latest?.actionId || latest.sequence <= observedLocalActionSequenceRef.current) return
        observedLocalActionSequenceRef.current = latest.sequence
        const command: ReplicatedActionCommand = {
          commandId: crypto.randomUUID(),
          actorId: localClientIdRef.current,
          actorRole: core.role,
          sequence: latest.sequence,
          type: latest.type as ReplicatedActionCommand['type'],
          actionId: latest.actionId,
          intensity: latest.intensity,
          simulationTime: latest.simulationTime,
        }
        enqueueSimulationPatch({
          actionCommand: command,
          actionRuntimeSnapshot: getActionRuntimeSnapshot(latest.simulationTime),
        })
      }
      unsubscribe = subscribeToActionRuntime(sync)
    })
    return () => { disposed = true; unsubscribe?.() }
  }, [productId, core.role, core.session?.id, runtimeMode])

  const currentStateSignature = useMemo(() => stateSignature(state), [state])
  const instructorStateSignature = useMemo(() => stateSignature(withRuntimeMode(state, runtimeMode)), [state, runtimeMode])
  const sessionStateSignature = useMemo(() => stateSignature(core.session?.product_state ?? null), [core.session?.product_state])

  useEffect(() => {
    if (core.role === 'standalone' || runtimeMode !== 'simulation' || !core.session?.id) return
    const canonical = canonicalStateRef.current ?? core.session.product_state
    if (!canonical) return
    if (currentStateSignature === canonicalStateSignatureRef.current) return
    const patch = buildStatePatch(canonical, state)
    if (patch) enqueueSimulationPatch(patch)
  }, [core.role, core.session?.id, runtimeMode, currentStateSignature])

  useEffect(() => {
    if (core.role !== 'instructor' || runtimeMode !== 'teaching' || !core.session) return
    if (instructorStateSignature === sessionStateSignature) return
    const timer = window.setTimeout(() => {
      if (!core.session) return
      void core.updateSession({
        product_state: withRuntimeMode(stateRef.current, runtimeMode),
        product_state_revision: Number(core.session.product_state_revision ?? 0) + 1,
      })
    }, Math.max(0, instructorBroadcastDebounceMs))
    return () => window.clearTimeout(timer)
  }, [core.role, core.session?.id, core.session?.product_state_revision, runtimeMode, instructorStateSignature, sessionStateSignature, instructorBroadcastDebounceMs])

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
  }, [core.role, state, currentStateSignature])

  useEffect(() => () => {
    if (simulationMutationTimerRef.current != null) window.clearTimeout(simulationMutationTimerRef.current)
  }, [])

  const startInstructor = (runtimeModeOverride?: ProductSessionRuntimeMode) => {
    const nextMode = runtimeModeOverride ?? preferredRuntimeMode
    if (runtimeModeOverride && runtimeModeOverride !== preferredRuntimeMode) setPreferredRuntimeMode(runtimeModeOverride)
    return core.startInstructor({ productId, state: withRuntimeMode(stateRef.current, nextMode) })
  }

  return { ...core, startInstructor, runtimeMode, preferredRuntimeMode, setPreferredRuntimeMode, localRuntimeConnection }
}
