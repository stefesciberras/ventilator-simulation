import { createClient, type RealtimeChannel } from '@supabase/supabase-js'
import type { PatientSettings, VentilatorSettings } from '../simulation/types'
import type { AlarmLimits, CandidateAlarmLevel } from '../alarmTypes'

const SUPABASE_CONFIG_STORAGE_KEY = 'eduvent.supabase-config'
const DEFAULT_SUPABASE_URL = 'https://meigiiqcrvwxcgapzxxi.supabase.co'
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_8BlWpHJsYzB2V8GQh9kqdQ_QUjg7rN-'

export interface SupabaseLocalConfiguration { project: string; publishableKey: string }
export interface SupabaseConfiguration { url: string; publishableKey: string; source: 'local' | 'environment' | 'default' }

function projectInputToUrl(project: string) {
  const value = project.trim()
  if (!value) throw new Error('Enter a Supabase project URL or project reference.')
  if (/^https?:\/\//i.test(value)) return new URL(value).origin.replace(/\/$/, '')
  if (!/^[a-z0-9-]+$/i.test(value)) throw new Error('Invalid Supabase project reference.')
  return `https://${value}.supabase.co`
}

export function getSupabaseLocalOverride(): SupabaseLocalConfiguration | null {
  if (typeof window === 'undefined') return null
  try {
    const raw=window.localStorage.getItem(SUPABASE_CONFIG_STORAGE_KEY); if(!raw) return null
    const parsed=JSON.parse(raw) as Partial<SupabaseLocalConfiguration>
    if(typeof parsed.project!=='string'||typeof parsed.publishableKey!=='string'||!parsed.project.trim()||!parsed.publishableKey.trim()) return null
    return {project:parsed.project.trim(),publishableKey:parsed.publishableKey.trim()}
  } catch { return null }
}

export function getSupabaseConfiguration(): SupabaseConfiguration {
  const local=getSupabaseLocalOverride()
  if(local) return {url:projectInputToUrl(local.project),publishableKey:local.publishableKey,source:'local'}
  const url=import.meta.env.VITE_SUPABASE_URL?.trim(), key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  if(url&&key) return {url:projectInputToUrl(url),publishableKey:key,source:'environment'}
  return {url:DEFAULT_SUPABASE_URL,publishableKey:DEFAULT_SUPABASE_PUBLISHABLE_KEY,source:'default'}
}

export function saveSupabaseLocalOverride(project:string,publishableKey:string){
  if(typeof window==='undefined') return
  const normalizedProject=project.trim(), normalizedKey=publishableKey.trim(); projectInputToUrl(normalizedProject)
  if(!normalizedKey) throw new Error('Enter the Supabase publishable key.')
  if(!normalizedKey.startsWith('sb_publishable_')&&!normalizedKey.startsWith('eyJ')) throw new Error('This does not look like a Supabase publishable/anon key.')
  window.localStorage.setItem(SUPABASE_CONFIG_STORAGE_KEY,JSON.stringify({project:normalizedProject,publishableKey:normalizedKey}))
}
export function clearSupabaseLocalOverride(){ if(typeof window!=='undefined') window.localStorage.removeItem(SUPABASE_CONFIG_STORAGE_KEY) }

const activeSupabaseConfiguration=getSupabaseConfiguration()
export const supabase = createClient(activeSupabaseConfiguration.url, activeSupabaseConfiguration.publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
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
  candidate_controls_visible: boolean
  patient_settings: PatientSettings
  ventilator_settings: VentilatorSettings
  patient_revision: number
  ventilator_revision: number
  transition_ms: number
  simulation_paused: boolean
  pause_revision: number
  sync_alarms: boolean
  candidate_can_edit_alarms: boolean
  alarm_settings: AlarmLimits
  alarm_revision: number
  alarms_silent: boolean
  candidate_can_edit_waveforms: boolean
  allow_oesophageal_pressure: boolean
  show_patient_effort: boolean
  instructor_client_id: string | null
  instructor_last_seen: string | null
}

export interface SessionMemberRow {
  id: string
  session_id: string
  user_id: string
  role: 'candidate' | 'instructor'
  display_name: string | null
  joined_at: string
  last_seen: string
  patient_settings: PatientSettings | Record<string, never>
  ventilator_settings: VentilatorSettings | Record<string, never>
  state_updated_at: string | null
  alarm_level: CandidateAlarmLevel
  last_scenario_action: string | null
  scenario_action_revision: number
  scenario_action_at: string | null
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

export async function createTeachingSession(patient: PatientSettings, ventilator: VentilatorSettings, alarmSettings: AlarmLimits) {
  await ensureAnonymousSession()
  const { data, error } = await supabase.rpc('create_teaching_session', {
    p_patient_settings: patient,
    p_ventilator_settings: ventilator,
    p_alarm_settings: alarmSettings,
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

export async function fetchSessionMembers(sessionId: string): Promise<SessionMemberRow[]> {
  const { data, error } = await supabase
    .from('session_members')
    .select('*')
    .eq('session_id', sessionId)
    .order('joined_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as SessionMemberRow[]
}

export async function touchSessionMember(
  sessionId: string,
  patient: PatientSettings,
  ventilator: VentilatorSettings,
  alarmLevel: CandidateAlarmLevel = null,
) {
  const { error } = await supabase.rpc('touch_session_member', {
    p_session_id: sessionId,
    p_patient_settings: patient,
    p_ventilator_settings: ventilator,
    p_alarm_level: alarmLevel,
  })
  if (error) throw error
}

export async function recordSessionScenarioAction(sessionId: string, action: string) {
  const { error } = await supabase.rpc('record_scenario_action', { p_session_id: sessionId, p_action: action })
  if (error) throw error
}

export async function findActiveInstructorSession() {
  await ensureAnonymousSession()
  const { data, error } = await supabase.rpc('find_active_instructor_session')
  if (error) throw error
  const result = Array.isArray(data) ? data[0] : data
  if (!result?.session_id) return null
  return { sessionId: String(result.session_id), sessionKey: String(result.session_key) }
}

export async function claimInstructorSession(sessionId: string, clientId: string) {
  const { error } = await supabase.rpc('claim_instructor_session', { p_session_id: sessionId, p_client_id: clientId })
  if (error) throw error
}

export async function touchInstructorSession(sessionId: string, clientId: string) {
  const { error } = await supabase.rpc('touch_instructor_session', { p_session_id: sessionId, p_client_id: clientId })
  if (error) throw error
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

export function subscribeToSessionMembers(
  sessionId: string,
  onChange: () => void,
): RealtimeChannel {
  const instanceId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`

  return supabase
    .channel(`eduvent-session-members-${sessionId}-${instanceId}`)
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
}

export async function closeTeachingSessionChannel(channel: RealtimeChannel | null) {
  if (!channel) return
  await supabase.removeChannel(channel)
}
