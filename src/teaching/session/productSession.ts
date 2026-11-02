import type { RealtimeChannel } from '@supabase/supabase-js'
import { toLegacyProductId, type SimulationProductId } from '../../core/SimulationProductAdapter'
import { readParticipantAccessContextFromDocument } from '../../core/sessionAccessPolicy'
import {
  getDefaultLocalRuntimeUrl,
  LocalRuntimeTransport,
  publishLocalProductState,
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

type ProductLocalPublisher = (row: ProductTeachingSessionRow<unknown>) => boolean
const localProductPublishers = new Map<string, ProductLocalPublisher>()

function currentSimulationActorRole(): 'instructor' | 'candidate' {
  const { role } = readParticipantAccessContextFromDocument()
  return role === 'candidate' ? 'candidate' : 'instructor'
}

function productRuntimeMode(state: unknown): LocalSessionRuntimeMode {
  if (state && typeof state === 'object' && (state as Record<string, unknown>).runtimeMode === 'simulation') return 'simulation'
  return 'teaching'
}

function announceLocalConnection(sessionId: string, state: LocalRuntimeConnection) {
  if (typeof document !== 'undefined') document.documentElement.dataset.loppjusimLocalRuntimeConnection = state
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('loppjusim-local-runtime-connection', { detail: { sessionId, state } }))
  }
}

function publishCanonicalProductRow<TState>(row: ProductTeachingSessionRow<TState>) {
  return publishLocalProductState(row.id, {
    productId: row.product_id,
    sessionId: row.id,
    runtimeMode: productRuntimeMode(row.product_state),
    revision: Number(row.product_state_revision ?? 0),
    state: row.product_state,
  })
}

export async function applyProductSimulationPatch<TState>(
  productId: SimulationProductId,
  sessionId: string,
  expectedRevision: number,
  patch: Record<string, unknown>,
  mutationId: string,
): Promise<ProductSimulationPatchResult<TState>> {
  await ensureAnonymousSession()
  const storageProductId = toLegacyProductId(productId)
  const { data, error } = await supabase.rpc('apply_edusim_simulation_patch', {
    p_session_id: sessionId,
    p_expected_revision: expectedRevision,
    p_patch: patch,
    p_mutation_id: mutationId,
    p_actor_role: currentSimulationActorRole(),
  })
  if (error) throw error
  const result = Array.isArray(data) ? data[0] : data
  if (!result?.session_row) throw new Error('Simulation mutation returned no canonical session state.')
  const session = result.session_row as ProductTeachingSessionRow<TState>
  if (session.product_id !== storageProductId) throw new Error('Simulation mutation returned the wrong simulator state.')
  localProductPublishers.get(sessionId)?.(session as ProductTeachingSessionRow<unknown>)
  return {
    applied: Boolean(result.applied),
    session,
    actorRole: result.actor_role === 'candidate' ? 'candidate' : 'instructor',
    mutationId: String(result.mutation_id ?? mutationId),
  }
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

  const disconnectLocalTransport = () => {
    localTransport?.disconnect()
    localTransport = null
    if (localSessionRow) localProductPublishers.delete(localSessionRow.id)
    localSessionRow = null
    announceLocalConnection('', 'disabled')
  }

  const publishLocalRow = (row: ProductTeachingSessionRow<TState>) => {
    localSessionRow = row
    return publishCanonicalProductRow(row)
  }

  const ensureLocalTransport = (row: ProductTeachingSessionRow<TState>) => {
    localSessionRow = row
    const url = getDefaultLocalRuntimeUrl()
    const { role } = readParticipantAccessContextFromDocument()
    if (!url || role === 'standalone') return
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
        if (state === 'connected' && role === 'instructor' && localSessionRow) publishLocalRow(localSessionRow)
      },
      onEnvelope: (envelope) => {
        if (role !== 'candidate' || envelope.payload.type !== 'product-state') return
        const snapshot = envelope.payload.snapshot
        if (snapshot.sessionId !== row.id || snapshot.productId !== storageProductId) return
        const current = localSessionRow ?? row
        const next: ProductTeachingSessionRow<TState> = {
          ...current,
          product_state: snapshot.state as TState,
          product_state_revision: Math.max(Number(current.product_state_revision ?? 0), Number(snapshot.revision ?? 0)),
          updated_at: new Date(snapshot.sentAt).toISOString(),
        }
        localSessionRow = next
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
        // Teaching instructor state uses the LAN as the immediate path. The
        // database update below remains the durable/cloud fallback.
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
            localSessionRow = row
            if (readParticipantAccessContextFromDocument().role === 'instructor') publishLocalRow(row)
            onUpdate(row)
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
