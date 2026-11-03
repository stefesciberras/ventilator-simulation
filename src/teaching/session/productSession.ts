import type { RealtimeChannel } from '@supabase/supabase-js'
import { toLegacyProductId, type SimulationProductId } from '../../core/SimulationProductAdapter'
import { filterCandidateSimulationPatch } from '../../core/simulationCandidatePatchPolicy'
import { readParticipantAccessContextFromDocument } from '../../core/sessionAccessPolicy'
import type { SimulationCommand } from '../../core/runtimeModes'
import type { ActionRuntimeSnapshot } from '../../edusim/actions/ActionRuntime'
import {
  getDefaultLocalRuntimeUrl,
  LocalRuntimeTransport,
  publishLocalProductState,
  publishLocalSimulationCommand,
  type LocalRuntimeConnection,
  type LocalSessionRuntimeMode,
} from '../../session/localRuntimeTransport'
import { ensureAnonymousSession, supabase } from '../../session/supabase'
import type {
  SharedTeachingMemberRow,
  SharedTeachingSessionRepository,
  SharedTeachingSessionRow,
} from './types'

export interface ProductTeachingSessionRow<TState = Record<string, unknown>> extends SharedTeachingSessionRow {
  product_id: string
  product_state: TState
  product_state_revision: number
}

export interface ProductTeachingMemberRow<TState = Record<string, unknown>> extends SharedTeachingMemberRow {
  product_state: TState
  state_updated_at: string | null
}

export interface ProductTeachingCreateInput<TState> {
  productId: SimulationProductId
  state: TState
}

export interface ProductTeachingMemberTelemetry<TState> {
  state: TState
}

export interface ProductSimulationPatchResult<TState> {
  applied: boolean
  session: ProductTeachingSessionRow<TState>
  actorRole: 'instructor' | 'candidate'
  mutationId: string
}

type JsonObject = Record<string, unknown>
type ProductLocalPublisher = (row: ProductTeachingSessionRow<unknown>) => boolean
type ProductLocalInstructorPatchHandler = (
  patch: JsonObject,
  mutationId: string,
) => ProductSimulationPatchResult<unknown> | null

const localProductPublishers = new Map<string, ProductLocalPublisher>()
const localProductRows = new Map<string, ProductTeachingSessionRow<unknown>>()
const localConnectionBySession = new Map<string, LocalRuntimeConnection>()
const localInstructorPatchHandlers = new Map<string, ProductLocalInstructorPatchHandler>()

function currentSimulationActorRole(): 'instructor' | 'candidate' {
  const { role } = readParticipantAccessContextFromDocument()
  return role === 'candidate' ? 'candidate' : 'instructor'
}

function productRuntimeMode(state: unknown): LocalSessionRuntimeMode {
  if (state && typeof state === 'object' && (state as Record<string, unknown>).runtimeMode === 'simulation') return 'simulation'
  return 'teaching'
}

function isPlainObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function deepMerge(base: unknown, patch: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch
  const result: JsonObject = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    result[key] = isPlainObject(result[key]) && isPlainObject(value)
      ? deepMerge(result[key], value)
      : value
  }
  return result
}

function mergePatchObjects(base: JsonObject | null, patch: JsonObject): JsonObject {
  return (deepMerge(base ?? {}, patch) ?? {}) as JsonObject
}

function applyAuthoritativeCandidateActionPatch(patch: JsonObject) {
  const command = isPlainObject(patch.actionCommand) ? patch.actionCommand : null
  const snapshot = patch.actionRuntimeSnapshot
  if (!command || command.actorRole !== 'candidate' || !snapshot || typeof snapshot !== 'object') return
  void import('../../edumon/simulationActionBridge').then(({ applyReplicatedEdumonActionSnapshot }) => {
    applyReplicatedEdumonActionSnapshot(snapshot as ActionRuntimeSnapshot)
  }).catch(() => undefined)
}

function announceLocalConnection(sessionId: string, state: LocalRuntimeConnection) {
  if (sessionId) localConnectionBySession.set(sessionId, state)
  if (typeof document !== 'undefined') document.documentElement.dataset.loppjusimLocalRuntimeConnection = state
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('loppjusim-local-runtime-connection', { detail: { sessionId, state } }))
  }
}

export function getProductLocalRuntimeConnection(sessionId: string | null | undefined): LocalRuntimeConnection {
  if (!sessionId) return 'disabled'
  return localConnectionBySession.get(sessionId) ?? 'disabled'
}

function publishCanonicalProductRow<TState>(row: ProductTeachingSessionRow<TState>) {
  localProductRows.set(row.id, row as ProductTeachingSessionRow<unknown>)
  return publishLocalProductState(row.id, {
    productId: row.product_id,
    sessionId: row.id,
    runtimeMode: productRuntimeMode(row.product_state),
    revision: Number(row.product_state_revision ?? 0),
    state: row.product_state,
  })
}

function localCandidatePatchResult<TState>(
  productId: SimulationProductId,
  sessionId: string,
  patch: JsonObject,
  mutationId: string,
): ProductSimulationPatchResult<TState> | null {
  if (currentSimulationActorRole() !== 'candidate') return null
  if (localConnectionBySession.get(sessionId) !== 'connected') return null
  const row = localProductRows.get(sessionId) as ProductTeachingSessionRow<TState> | undefined
  if (!row || row.product_id !== toLegacyProductId(productId) || productRuntimeMode(row.product_state) !== 'simulation') return null

  const filtered = filterCandidateSimulationPatch(patch)
  if (!Object.keys(filtered).length) {
    return { applied: false, session: row, actorRole: 'candidate', mutationId }
  }
  const command: SimulationCommand<{ patch: JsonObject }> = {
    id: mutationId,
    sessionId,
    actorId: `candidate-${mutationId}`,
    actorRole: 'candidate',
    type: 'product.state.patch',
    product: row.product_id,
    payload: { patch: filtered },
    simulationTime: 0,
    clientTime: Date.now(),
  }
  if (!publishLocalSimulationCommand(sessionId, command)) return null

  const optimistic = {
    ...row,
    product_state: deepMerge(row.product_state, filtered) as TState,
    updated_at: new Date().toISOString(),
  }
  localProductRows.set(sessionId, optimistic as ProductTeachingSessionRow<unknown>)
  return { applied: true, session: optimistic, actorRole: 'candidate', mutationId }
}

async function applyProductSimulationPatchCloud<TState>(
  productId: SimulationProductId,
  sessionId: string,
  expectedRevision: number,
  patch: Record<string, unknown>,
  mutationId: string,
  actorRole: 'instructor' | 'candidate',
): Promise<ProductSimulationPatchResult<TState>> {
  await ensureAnonymousSession()
  const storageProductId = toLegacyProductId(productId)
  const { data, error } = await supabase.rpc('apply_edusim_simulation_patch', {
    p_session_id: sessionId,
    p_expected_revision: expectedRevision,
    p_patch: patch,
    p_mutation_id: mutationId,
    p_actor_role: actorRole,
  })
  if (error) throw error
  const result = Array.isArray(data) ? data[0] : data
  if (!result?.session_row) throw new Error('Simulation mutation returned no canonical session state.')
  const session = result.session_row as ProductTeachingSessionRow<TState>
  if (session.product_id !== storageProductId) throw new Error('Simulation mutation returned the wrong simulator state.')
  localProductRows.set(sessionId, session as ProductTeachingSessionRow<unknown>)
  localProductPublishers.get(sessionId)?.(session as ProductTeachingSessionRow<unknown>)
  return {
    applied: Boolean(result.applied),
    session,
    actorRole: result.actor_role === 'candidate' ? 'candidate' : 'instructor',
    mutationId: String(result.mutation_id ?? mutationId),
  }
}

export async function applyProductSimulationPatch<TState>(
  productId: SimulationProductId,
  sessionId: string,
  expectedRevision: number,
  patch: Record<string, unknown>,
  mutationId: string,
): Promise<ProductSimulationPatchResult<TState>> {
  const actorRole = currentSimulationActorRole()
  if (actorRole === 'candidate') {
    const localResult = localCandidatePatchResult<TState>(productId, sessionId, patch, mutationId)
    if (localResult) return localResult
  } else if (localConnectionBySession.get(sessionId) === 'connected') {
    const localResult = localInstructorPatchHandlers.get(sessionId)?.(patch, mutationId) ?? null
    if (localResult) return localResult as ProductSimulationPatchResult<TState>
  }

  return applyProductSimulationPatchCloud<TState>(
    productId,
    sessionId,
    expectedRevision,
    patch,
    mutationId,
    actorRole,
  )
}

export function createProductTeachingSessionRepository<TState>(productId: SimulationProductId): SharedTeachingSessionRepository<
  ProductTeachingSessionRow<TState>,
  ProductTeachingMemberRow<TState>,
  ProductTeachingCreateInput<TState>,
  ProductTeachingMemberTelemetry<TState>
> {
  const storageProductId = toLegacyProductId(productId)
  const localClientId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `product-${Date.now()}-${Math.random().toString(36).slice(2)}`
  let localTransport: LocalRuntimeTransport | null = null
  let localSessionRow: ProductTeachingSessionRow<TState> | null = null
  let localSessionChannel: RealtimeChannel | null = null
  let localOnUpdate: ((row: ProductTeachingSessionRow<TState>) => void) | null = null
  let pendingLocalSimulationPatch: JsonObject | null = null
  let pendingFlushInFlight = false

  const disconnectLocalTransport = () => {
    localTransport?.disconnect()
    localTransport = null
    if (localSessionRow) {
      localProductPublishers.delete(localSessionRow.id)
      localInstructorPatchHandlers.delete(localSessionRow.id)
      localProductRows.delete(localSessionRow.id)
      localConnectionBySession.delete(localSessionRow.id)
    }
    localSessionRow = null
    announceLocalConnection('', 'disabled')
  }

  const publishLocalRow = (row: ProductTeachingSessionRow<TState>) => {
    localSessionRow = row
    localProductRows.set(row.id, row as ProductTeachingSessionRow<unknown>)
    return publishCanonicalProductRow(row)
  }

  const flushPendingLocalSimulationPatch = async () => {
    if (pendingFlushInFlight || !pendingLocalSimulationPatch || !localSessionRow) return
    if (readParticipantAccessContextFromDocument().role !== 'instructor') return
    if (productRuntimeMode(localSessionRow.product_state) !== 'simulation') return

    const patch = pendingLocalSimulationPatch
    pendingLocalSimulationPatch = null
    pendingFlushInFlight = true
    try {
      const result = await applyProductSimulationPatchCloud<TState>(
        productId,
        localSessionRow.id,
        Number(localSessionRow.product_state_revision ?? 0),
        patch,
        crypto.randomUUID(),
        'instructor',
      )
      if (result.applied) {
        localSessionRow = result.session
        localProductRows.set(result.session.id, result.session as ProductTeachingSessionRow<unknown>)
        localOnUpdate?.(result.session)
        publishLocalRow(result.session)
      } else {
        const rebased: ProductTeachingSessionRow<TState> = {
          ...result.session,
          product_state: deepMerge(result.session.product_state, patch) as TState,
          updated_at: new Date().toISOString(),
        }
        localSessionRow = rebased
        localProductRows.set(rebased.id, rebased as ProductTeachingSessionRow<unknown>)
        pendingLocalSimulationPatch = mergePatchObjects(pendingLocalSimulationPatch, patch)
        localOnUpdate?.(rebased)
        publishLocalRow(rebased)
      }
    } catch {
      pendingLocalSimulationPatch = mergePatchObjects(pendingLocalSimulationPatch, patch)
    } finally {
      pendingFlushInFlight = false
    }
  }

  const acceptLocalInstructorPatch = (patch: JsonObject, mutationId: string): ProductSimulationPatchResult<TState> | null => {
    if (!localSessionRow || productRuntimeMode(localSessionRow.product_state) !== 'simulation') return null
    if (!Object.keys(patch).length) {
      return { applied: false, session: localSessionRow, actorRole: 'instructor', mutationId }
    }
    const next: ProductTeachingSessionRow<TState> = {
      ...localSessionRow,
      product_state: deepMerge(localSessionRow.product_state, patch) as TState,
      updated_at: new Date().toISOString(),
    }
    localSessionRow = next
    localProductRows.set(next.id, next as ProductTeachingSessionRow<unknown>)
    pendingLocalSimulationPatch = mergePatchObjects(pendingLocalSimulationPatch, patch)
    localOnUpdate?.(next)
    publishLocalRow(next)
    void flushPendingLocalSimulationPatch()
    return { applied: true, session: next, actorRole: 'instructor', mutationId }
  }

  const acceptLocalCandidatePatch = (command: SimulationCommand) => {
    if (!localSessionRow || command.actorRole !== 'candidate' || command.type !== 'product.state.patch') return
    if (command.sessionId !== localSessionRow.id || command.product !== storageProductId) return
    if (productRuntimeMode(localSessionRow.product_state) !== 'simulation') return
    const rawPatch = isPlainObject(command.payload) && isPlainObject(command.payload.patch)
      ? command.payload.patch
      : {}
    const patch = filterCandidateSimulationPatch(rawPatch)
    if (!Object.keys(patch).length) return

    applyAuthoritativeCandidateActionPatch(patch)
    const next: ProductTeachingSessionRow<TState> = {
      ...localSessionRow,
      product_state: deepMerge(localSessionRow.product_state, patch) as TState,
      updated_at: new Date().toISOString(),
    }
    localSessionRow = next
    localProductRows.set(next.id, next as ProductTeachingSessionRow<unknown>)
    pendingLocalSimulationPatch = mergePatchObjects(pendingLocalSimulationPatch, patch)
    localOnUpdate?.(next)
    publishLocalRow(next)
    void flushPendingLocalSimulationPatch()
  }

  const ensureLocalTransport = (row: ProductTeachingSessionRow<TState>) => {
    localSessionRow = row
    localProductRows.set(row.id, row as ProductTeachingSessionRow<unknown>)
    const url = getDefaultLocalRuntimeUrl()
    const { role } = readParticipantAccessContextFromDocument()
    if (!url || role === 'standalone') return
    if (role === 'instructor') {
      localInstructorPatchHandlers.set(row.id, (patch, mutationId) => (
        acceptLocalInstructorPatch(patch, mutationId) as ProductSimulationPatchResult<unknown> | null
      ))
    }
    if (localTransport) {
      if (role === 'instructor') publishLocalRow(row)
      return
    }

    localTransport = new LocalRuntimeTransport({
      url,
      role,
      runtimeMode: productRuntimeMode(row.product_state),
      sessionKey: row.session_key,
      sessionId: row.id,
      clientId: localClientId,
      onConnection: (state) => {
        announceLocalConnection(row.id, state)
        if (state === 'connected' && role === 'instructor' && localSessionRow) {
          localInstructorPatchHandlers.set(row.id, (patch, mutationId) => (
            acceptLocalInstructorPatch(patch, mutationId) as ProductSimulationPatchResult<unknown> | null
          ))
          publishLocalRow(localSessionRow)
          void flushPendingLocalSimulationPatch()
        }
      },
      onEnvelope: (envelope) => {
        if (role === 'instructor' && envelope.payload.type === 'command') {
          acceptLocalCandidatePatch(envelope.payload.command)
          return
        }
        if (envelope.payload.type !== 'product-state') return
        const snapshot = envelope.payload.snapshot
        if (snapshot.sessionId !== row.id || snapshot.productId !== storageProductId) return
        if (role !== 'candidate') return
        const current = localSessionRow ?? row
        const next: ProductTeachingSessionRow<TState> = {
          ...current,
          product_state: snapshot.state as TState,
          product_state_revision: Math.max(Number(current.product_state_revision ?? 0), Number(snapshot.revision ?? 0)),
          updated_at: new Date(snapshot.sentAt).toISOString(),
        }
        localSessionRow = next
        localProductRows.set(next.id, next as ProductTeachingSessionRow<unknown>)
        localOnUpdate?.(next)
      },
    })
    localProductPublishers.set(row.id, (nextRow) => publishLocalRow(nextRow as ProductTeachingSessionRow<TState>))
    localTransport.connect()
  }

  return {
    ensureIdentity: ensureAnonymousSession,

    createSession: async (input) => {
      await ensureAnonymousSession()
      const { data, error } = await supabase.rpc('create_edusim_session', {
        p_product_id: storageProductId,
        p_product_state: input.state as unknown as Record<string, unknown>,
      })
      if (error) throw error
      const result = Array.isArray(data) ? data[0] : data
      if (!result?.session_id || !result?.session_key) throw new Error('Session creation returned no session key.')
      return { sessionId: String(result.session_id), sessionKey: String(result.session_key) }
    },

    joinSession: async (sessionKey, displayName) => {
      await ensureAnonymousSession()
      const { data, error } = await supabase.rpc('join_edusim_session', {
        p_session_key: sessionKey.trim().toUpperCase(),
        p_display_name: displayName?.trim() || null,
        p_product_id: storageProductId,
      })
      if (error) throw error
      const result = Array.isArray(data) ? data[0] : data
      if (!result?.session_id) throw new Error('Session join returned no session identifier.')
      return {
        sessionId: String(result.session_id),
        status: String(result.session_status ?? 'active') as ProductTeachingSessionRow<TState>['status'],
      }
    },

    fetchSession: async (sessionId) => {
      const { data, error } = await supabase
        .from('teaching_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('product_id', storageProductId)
        .single()
      if (error) throw error
      const row = data as ProductTeachingSessionRow<TState>
      localSessionRow = row
      localProductRows.set(row.id, row as ProductTeachingSessionRow<unknown>)
      window.setTimeout(() => ensureLocalTransport(row), 0)
      return row
    },

    updateSession: async (sessionId, patch) => {
      if (localSessionRow && patch.product_state !== undefined) {
        const optimistic: ProductTeachingSessionRow<TState> = {
          ...localSessionRow,
          ...patch,
          product_state: patch.product_state as TState,
          updated_at: new Date().toISOString(),
        }
        publishLocalRow(optimistic)
      }
      const { data, error } = await supabase
        .from('teaching_sessions')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', sessionId)
        .eq('product_id', storageProductId)
        .select('*')
        .single()
      if (error) throw error
      const row = data as ProductTeachingSessionRow<TState>
      localSessionRow = row
      localProductRows.set(row.id, row as ProductTeachingSessionRow<unknown>)
      publishLocalRow(row)
      return row
    },

    findActiveInstructorSession: async () => {
      await ensureAnonymousSession()
      const { data, error } = await supabase.rpc('find_active_instructor_session', {
        p_product_id: storageProductId,
      })
      if (error) throw error
      const result = Array.isArray(data) ? data[0] : data
      if (!result?.session_id) return null
      return { sessionId: String(result.session_id), sessionKey: String(result.session_key) }
    },

    claimInstructorSession: async (sessionId, clientId) => {
      const { error } = await supabase.rpc('claim_instructor_session', {
        p_session_id: sessionId,
        p_client_id: clientId,
      })
      if (error) throw error
    },

    touchInstructorSession: async (sessionId, clientId) => {
      const { error } = await supabase.rpc('touch_instructor_session', {
        p_session_id: sessionId,
        p_client_id: clientId,
      })
      if (error) throw error
      void flushPendingLocalSimulationPatch()
    },

    fetchMembers: async (sessionId) => {
      const { data, error } = await supabase
        .from('session_members')
        .select('*')
        .eq('session_id', sessionId)
        .order('joined_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as ProductTeachingMemberRow<TState>[]
    },

    touchMember: async (sessionId, telemetry) => {
      const { error } = await supabase.rpc('touch_edusim_session_member', {
        p_session_id: sessionId,
        p_product_state: telemetry.state as unknown as Record<string, unknown>,
      })
      if (error) throw error
    },

    subscribeSession: (sessionId, onUpdate, onStatus): RealtimeChannel => {
      localOnUpdate = onUpdate
      const channel = supabase
        .channel(`simulation-${productId}-session-${sessionId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'teaching_sessions',
            filter: `id=eq.${sessionId}`,
          },
          (payload) => {
            const row = payload.new as ProductTeachingSessionRow<TState>
            const hasPendingLocalState = Boolean(pendingLocalSimulationPatch) && readParticipantAccessContextFromDocument().role === 'instructor'
            localSessionRow = hasPendingLocalState && localSessionRow
              ? {
                  ...row,
                  product_state: deepMerge(row.product_state, pendingLocalSimulationPatch) as TState,
                  updated_at: localSessionRow.updated_at,
                }
              : row
            localProductRows.set(row.id, localSessionRow as ProductTeachingSessionRow<unknown>)
            if (readParticipantAccessContextFromDocument().role === 'instructor') {
              publishLocalRow(localSessionRow)
              void flushPendingLocalSimulationPatch()
            }
            onUpdate(localSessionRow)
          },
        )
        .subscribe((status) => {
          onStatus(status)
          if (status === 'SUBSCRIBED' && localSessionRow) window.setTimeout(() => ensureLocalTransport(localSessionRow as ProductTeachingSessionRow<TState>), 0)
        })
      localSessionChannel = channel
      return channel
    },

    subscribeMembers: (sessionId, onChange): RealtimeChannel => {
      const instanceId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
      return supabase
        .channel(`simulation-${productId}-members-${sessionId}-${instanceId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'session_members',
            filter: `session_id=eq.${sessionId}`,
          },
          () => onChange(),
        )
        .subscribe()
    },

    closeChannel: async (channel) => {
      if (channel && channel === localSessionChannel) {
        disconnectLocalTransport()
        localSessionChannel = null
        localOnUpdate = null
      }
      if (channel) await supabase.removeChannel(channel)
    },
  }
}
