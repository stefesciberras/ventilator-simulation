import { useEffect, useMemo, useRef, useState } from 'react'
import type { SimulationCommand } from '../../core/runtimeModes'
import { toLegacyProductId, type SimulationProductId } from '../../core/SimulationProductAdapter'
import type { ActionRuntimeSnapshot } from '../../edusim/actions/ActionRuntime'
import { getDefaultLocalRuntimeUrl, LocalRuntimeTransport, type LocalRuntimeConnection } from '../../session/localRuntimeTransport'
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
const CANDIDATE_MUTATION_REVISION_KEY = '_candidateMutationRevision'

type ReplicatedActionCommand = {
  sequence: number
  type: 'activate' | 'deactivate' | 'intensity'
  actionId: string
  intensity?: number
  simulationTime: number
}

type CandidateStateCommandPayload<TState> = {
  kind: 'candidate-product-state'
  state: TState
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

function withActionRuntime<TState>(state: TState, actionCommand: ReplicatedActionCommand | null, actionRuntimeSnapshot: ActionRuntimeSnapshot | null): TState {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return state
  const additions: Record<string, unknown> = {}
  if (actionCommand) additions.actionCommand = actionCommand
  if (actionRuntimeSnapshot) additions.actionRuntimeSnapshot = actionRuntimeSnapshot
  if (!Object.keys(additions).length) return state
  return { ...(state as Record<string, unknown>), ...additions } as TState
}

function withCandidateMutationRevision<TState>(state: TState, revision: number): TState {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return state
  return { ...(state as Record<string, unknown>), [CANDIDATE_MUTATION_REVISION_KEY]: revision } as TState
}

function candidateMutationRevision<TState>(state: TState | null | undefined): number {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return 0
  const revision = Number((state as Record<string, unknown>)[CANDIDATE_MUTATION_REVISION_KEY])
  return Number.isFinite(revision) && revision > 0 ? revision : 0
}

function stateSignature(value: unknown): string {
  try { return JSON.stringify(value) } catch { return '' }
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
  /**
   * Defines the candidate-controlled projection that may propagate back to the
   * instructor in Simulation mode. Teaching mode still uses it to preserve local
   * candidate fields, while Simulation candidates always accept canonical instructor state.
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
  const candidateCanonicalSignatureRef = useRef('')
  const candidateMutationStateRef = useRef<TState | null>(null)
  const candidateMutationRevisionRef = useRef(0)
  const processedCandidateMutationRevisionRef = useRef(0)
  const standaloneStateRef = useRef(state)
  const standaloneLogTimerRef = useRef<number | null>(null)
  const candidateFastTelemetryTimerRef = useRef<number | null>(null)
  const candidateLocalPublishTimerRef = useRef<number | null>(null)
  const candidateActionCommandRef = useRef<ReplicatedActionCommand | null>(null)
  const candidateActionRuntimeSnapshotRef = useRef<ActionRuntimeSnapshot | null>(null)
  const processedCandidateActionRef = useRef(new Map<string, number>())
  const localTransportRef = useRef<LocalRuntimeTransport | null>(null)
  const localClientIdRef = useRef(crypto.randomUUID())
  const [localRuntimeConnection, setLocalRuntimeConnection] = useState<LocalRuntimeConnection>('disabled')
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

  const candidateTelemetryState = () => withCandidateMutationRevision(
    withActionRuntime(candidateMutationStateRef.current ?? stateRef.current, candidateActionCommandRef.current, candidateActionRuntimeSnapshotRef.current),
    candidateMutationRevisionRef.current,
  )

  const core = useSharedTeachingSession<
    ProductTeachingSessionRow<TState>,
    ProductTeachingMemberRow<TState>,
    ProductTeachingCreateInput<TState>,
    ProductTeachingMemberTelemetry<TState>
  >({
    storageNamespace: `edusim.${toLegacyProductId(productId)}`,
    repository,
    getMemberTelemetry: () => ({ state: candidateTelemetryState() }),
    host: {
      onSessionRow: (row, nextRole, source, force) => {
        if (nextRole === 'candidate') {
          const rowRuntimeMode = stateRuntimeMode(row.product_state) ?? 'teaching'
          const nextState = rowRuntimeMode === 'simulation'
            ? row.product_state
            : candidateStateInitialisedRef.current && mergeCandidateState
              ? mergeCandidateState(stateRef.current, row.product_state)
              : row.product_state
          candidateStateInitialisedRef.current = true
          if (rowRuntimeMode === 'simulation') candidateCanonicalSignatureRef.current = stateSignature(nextState)
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
        candidateCanonicalSignatureRef.current = ''
        candidateMutationStateRef.current = null
        candidateMutationRevisionRef.current = 0
        processedCandidateMutationRevisionRef.current = 0
        candidateActionCommandRef.current = null
        candidateActionRuntimeSnapshotRef.current = null
        processedCandidateActionRef.current.clear()
        localTransportRef.current?.disconnect()
        localTransportRef.current = null
        setLocalRuntimeConnection('disabled')
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

  const applyReplicatedAction = (sourceId: string, candidateState: TState) => {
    if (!isEdumonProduct(productId)) return
    const command = readActionCommand(candidateState)
    const snapshot = readActionRuntimeSnapshot(candidateState)
    if (!command || !snapshot) return
    const seen = processedCandidateActionRef.current.get(sourceId) ?? 0
    if (command.sequence <= seen) return
    processedCandidateActionRef.current.set(sourceId, command.sequence)
    void import('../../edumon/simulationActionBridge').then(({ applyReplicatedEdumonActionSnapshot }) => {
      applyReplicatedEdumonActionSnapshot(snapshot)
    })
  }

  const applyCandidateState = (sourceId: string, candidateState: TState) => {
    if (core.role !== 'instructor' || runtimeMode !== 'simulation' || !mergeCandidateState) return
    const revision = candidateMutationRevision(candidateState)
    if (revision <= processedCandidateMutationRevisionRef.current) return
    processedCandidateMutationRevisionRef.current = revision
    const merged = mergeCandidateState(candidateState, stateRef.current)
    let currentSignature = ''
    let mergedSignature = ''
    try { currentSignature = JSON.stringify(stateRef.current); mergedSignature = JSON.stringify(merged) } catch { return }
    if (currentSignature !== mergedSignature) {
      stateRef.current = merged
      suppressInstructorBroadcastRef.current = false
      setState(merged)
    }
    applyReplicatedAction(sourceId, candidateState)
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
    localTransportRef.current?.disconnect()
    localTransportRef.current = null
    setLocalRuntimeConnection('disabled')
    const row = core.session
    const url = getDefaultLocalRuntimeUrl()
    if (!row || core.role === 'standalone' || !url || runtimeMode !== 'simulation') return
    const transport = new LocalRuntimeTransport({
      url,
      role: core.role,
      runtimeMode: 'simulation',
      sessionKey: row.session_key,
      sessionId: row.id,
      clientId: localClientIdRef.current,
      onConnection: setLocalRuntimeConnection,
      onEnvelope: (envelope) => {
        if (core.role !== 'instructor' || envelope.payload.type !== 'command') return
        const command = envelope.payload.command
        if (command.product !== String(productId) || command.type !== 'device.parameter.set') return
        const payload = command.payload as Partial<CandidateStateCommandPayload<TState>>
        if (payload.kind !== 'candidate-product-state' || payload.state == null) return
        applyCandidateState(command.actorId, payload.state)
      },
    })
    localTransportRef.current = transport
    transport.connect()
    return () => {
      transport.disconnect()
      if (localTransportRef.current === transport) localTransportRef.current = null
    }
  }, [core.role, core.session?.id, core.session?.session_key, runtimeMode, productId, mergeCandidateState])

  useEffect(() => {
    if (!isEdumonProduct(productId)) return
    let disposed = false
    let unsubscribe: (() => void) | null = null
    void import('../../edusim/actions/ActionRuntime').then(({ getActionRuntimeLog, getActionRuntimeSnapshot, subscribeToActionRuntime }) => {
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
        candidateActionRuntimeSnapshotRef.current = getActionRuntimeSnapshot(latest.simulationTime)
        candidateMutationStateRef.current = stateRef.current
        candidateMutationRevisionRef.current += 1
        void core.touchMemberNow().catch(() => undefined)
        const row = core.session
        if (row && localTransportRef.current) {
          const command: SimulationCommand<CandidateStateCommandPayload<TState>> = {
            id: crypto.randomUUID(),
            sessionId: row.id,
            actorId: localClientIdRef.current,
            actorRole: 'candidate',
            type: 'device.parameter.set',
            product: String(productId),
            payload: { kind: 'candidate-product-state', state: candidateTelemetryState() },
            simulationTime: latest.simulationTime,
            clientTime: Date.now(),
          }
          localTransportRef.current.publishCommand(command)
        }
      }
      sync()
      unsubscribe = subscribeToActionRuntime(sync)
    })
    return () => { disposed = true; unsubscribe?.() }
  }, [productId, core.role, core.session?.id, runtimeMode])

  const currentStateSignature = useMemo(() => stateSignature(state), [state])
  const instructorStateSignature = useMemo(() => stateSignature(withRuntimeMode(state, runtimeMode)), [state, runtimeMode])
  const sessionStateSignature = useMemo(() => stateSignature(core.session?.product_state ?? null), [core.session?.product_state])
  const candidateMemberSignature = useMemo(() => {
    if (core.role !== 'instructor' || runtimeMode !== 'simulation') return ''
    const candidate = core.members.find((member) => member.role === 'candidate')
    return stateSignature(candidate?.product_state ?? null)
  }, [core.role, core.members, runtimeMode])

  useEffect(() => {
    if (core.role !== 'instructor' || runtimeMode !== 'simulation') return
    const candidate = core.members.find((member) => member.role === 'candidate')
    if (candidate?.product_state) applyCandidateState(memberSourceId(candidate), candidate.product_state)
  }, [core.role, runtimeMode, candidateMemberSignature, core.members])

  useEffect(() => {
    if (core.role !== 'candidate' || runtimeMode !== 'simulation' || !core.session?.id) return
    if (currentStateSignature === candidateCanonicalSignatureRef.current) return
    candidateMutationStateRef.current = state
    candidateMutationRevisionRef.current += 1
    if (candidateFastTelemetryTimerRef.current != null) window.clearTimeout(candidateFastTelemetryTimerRef.current)
    candidateFastTelemetryTimerRef.current = window.setTimeout(() => {
      candidateFastTelemetryTimerRef.current = null
      void core.touchMemberNow().catch(() => undefined)
    }, 80)
    return () => { if (candidateFastTelemetryTimerRef.current != null) window.clearTimeout(candidateFastTelemetryTimerRef.current) }
  }, [core.role, core.session?.id, runtimeMode, currentStateSignature])

  useEffect(() => {
    if (core.role !== 'candidate' || runtimeMode !== 'simulation' || !core.session) return
    if (currentStateSignature === candidateCanonicalSignatureRef.current) return
    if (candidateLocalPublishTimerRef.current != null) window.clearTimeout(candidateLocalPublishTimerRef.current)
    candidateLocalPublishTimerRef.current = window.setTimeout(() => {
      candidateLocalPublishTimerRef.current = null
      const transport = localTransportRef.current
      const row = core.session
      if (!transport || !row) return
      const command: SimulationCommand<CandidateStateCommandPayload<TState>> = {
        id: crypto.randomUUID(),
        sessionId: row.id,
        actorId: localClientIdRef.current,
        actorRole: 'candidate',
        type: 'device.parameter.set',
        product: String(productId),
        payload: { kind: 'candidate-product-state', state: candidateTelemetryState() },
        simulationTime: Date.now() / 1000,
        clientTime: Date.now(),
      }
      transport.publishCommand(command)
    }, 40)
    return () => { if (candidateLocalPublishTimerRef.current != null) window.clearTimeout(candidateLocalPublishTimerRef.current) }
  }, [core.role, core.session?.id, runtimeMode, currentStateSignature, productId])

  useEffect(() => {
    if (core.role !== 'instructor' || !core.session || suppressInstructorBroadcastRef.current) return
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

  useEffect(() => () => localTransportRef.current?.disconnect(), [])

  const startInstructor = () => core.startInstructor({ productId, state: withRuntimeMode(stateRef.current, preferredRuntimeMode) })

  return { ...core, startInstructor, runtimeMode, preferredRuntimeMode, setPreferredRuntimeMode, localRuntimeConnection }
}

function memberSourceId<TState>(member: ProductTeachingMemberRow<TState>) {
  return member.id
}