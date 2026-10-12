import { createClient, type RealtimeChannel } from '@supabase/supabase-js'
import type { PatientSettings, VentilatorSettings } from '../simulation/types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://meigiiqcrvwxcgapzxxi.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_8BlWpHJsYzB2V8GQh9kqdQ_QUjg7rN-'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

export type TeachingSessionStatus = 'active' | 'paused' | 'ended'

export interface TeachingSessionRow {
  id: string
  session_key: string
  instructor_id: string
  created_at: string
  updated_at: string
  expires_at: string
  status: TeachingSessionStatus
  sync_patient: boolean
  sync_ventilator: boolean
  candidate_can_edit_patient: boolean
  candidate_can_edit_ventilator: boolean
  patient_settings: PatientSettings
  ventilator_settings: VentilatorSettings
  patient_revision: number
  ventilator_revision: number
  transition_ms: number
}

export async function ensureAnonymousSession() {
  const { data: existing, error: existingError } = await supabase.auth.getSession()
  if (existingError) throw existingError
  if (existing.session) return existing.session

  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  if (!data.session) throw new Error('Supabase did not return an anonymous session.')
  return data.session
}

export async function createTeachingSession(patient: PatientSettings, ventilator: VentilatorSettings) {
  await ensureAnonymousSession()
  const { data, error } = await supabase.rpc('create_teaching_session', {
    p_patient_settings: patient,
    p_ventilator_settings: ventilator,
  })
  if (error) throw error
  const result = Array.isArray(data) ? data[0] : data
  if (!result?.session_id || !result?.session_key) throw new Error('Session creation returned no session key.')
  return { sessionId: String(result.session_id), sessionKey: String(result.session_key) }
}

export async function joinTeachingSession(sessionKey: string, displayName?: string) {
  await ensureAnonymousSession()
  const { data, error } = await supabase.rpc('join_teaching_session', {
    p_session_key: sessionKey.trim().toUpperCase(),
    p_display_name: displayName?.trim() || null,
  })
  if (error) throw error
  const result = Array.isArray(data) ? data[0] : data
  if (!result?.session_id) throw new Error('Session join returned no session identifier.')
  return { sessionId: String(result.session_id), status: String(result.session_status ?? 'active') as TeachingSessionStatus }
}

export async function fetchTeachingSession(sessionId: string): Promise<TeachingSessionRow> {
  const { data, error } = await supabase
    .from('teaching_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()
  if (error) throw error
  return data as TeachingSessionRow
}

export async function updateTeachingSession(sessionId: string, patch: Partial<TeachingSessionRow>) {
  const { data, error } = await supabase
    .from('teaching_sessions')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .select('*')
    .single()
  if (error) throw error
  return data as TeachingSessionRow
}

export function subscribeToTeachingSession(
  sessionId: string,
  onUpdate: (session: TeachingSessionRow) => void,
  onStatus: (status: string) => void,
): RealtimeChannel {
  return supabase
    .channel(`eduvent-session-${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'teaching_sessions',
        filter: `id=eq.${sessionId}`,
      },
      (payload) => onUpdate(payload.new as TeachingSessionRow),
    )
    .subscribe((status) => onStatus(status))
}

export async function closeTeachingSessionChannel(channel: RealtimeChannel | null) {
  if (!channel) return
  await supabase.removeChannel(channel)
}
