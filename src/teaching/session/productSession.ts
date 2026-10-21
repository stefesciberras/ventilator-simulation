import type { RealtimeChannel } from '@supabase/supabase-js'
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
  productId: string
  state: TState
}

export interface ProductTeachingMemberTelemetry<TState> {
  state: TState
}

export function createProductTeachingSessionRepository<TState>(productId: string): SharedTeachingSessionRepository<
  ProductTeachingSessionRow<TState>,
  ProductTeachingMemberRow<TState>,
  ProductTeachingCreateInput<TState>,
  ProductTeachingMemberTelemetry<TState>
> {
  const normalizedProductId = productId.trim().toLowerCase()

  return {
    ensureIdentity: ensureAnonymousSession,

    createSession: async (input) => {
      await ensureAnonymousSession()
      const { data, error } = await supabase.rpc('create_edusim_session', {
        p_product_id: normalizedProductId,
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
        p_product_id: normalizedProductId,
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
        .eq('product_id', normalizedProductId)
        .single()
      if (error) throw error
      return data as ProductTeachingSessionRow<TState>
    },

    updateSession: async (sessionId, patch) => {
      const { data, error } = await supabase
        .from('teaching_sessions')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', sessionId)
        .eq('product_id', normalizedProductId)
        .select('*')
        .single()
      if (error) throw error
      return data as ProductTeachingSessionRow<TState>
    },

    findActiveInstructorSession: async () => {
      await ensureAnonymousSession()
      const { data, error } = await supabase.rpc('find_active_instructor_session', {
        p_product_id: normalizedProductId,
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

    subscribeSession: (sessionId, onUpdate, onStatus): RealtimeChannel => supabase
      .channel(`edusim-${normalizedProductId}-session-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'teaching_sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload) => onUpdate(payload.new as ProductTeachingSessionRow<TState>),
      )
      .subscribe((status) => onStatus(status)),

    subscribeMembers: (sessionId, onChange): RealtimeChannel => {
      const instanceId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
      return supabase
        .channel(`edusim-${normalizedProductId}-members-${sessionId}-${instanceId}`)
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
      if (channel) await supabase.removeChannel(channel)
    },
  }
}
