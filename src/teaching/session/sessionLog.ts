import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../../session/supabase'
import type { TeachingRole } from '../types'

export type SessionLogCategory = 'settings' | 'drug' | 'event' | 'alarm' | 'device' | 'session' | 'scenario'

export interface SessionLogEntry {
  id: number
  session_id: string
  product_id: string
  actor_user_id: string
  actor_role: 'instructor' | 'candidate'
  actor_name: string
  category: SessionLogCategory
  event_type: string
  label: string
  details: Record<string, unknown>
  simulation_time_seconds: number | null
  client_occurred_at: string
  created_at: string
}

export interface SessionLogStateChange {
  path: string
  from: unknown
  to: unknown
}

interface SessionLogRuntimeContext {
  productId: string | null
  sessionId: string | null
  role: TeachingRole
}

interface RecordSessionLogEventInput {
  category: SessionLogCategory
  eventType: string
  label: string
  details?: Record<string, unknown>
  simulationTimeSeconds?: number | null
  sessionId?: string | null
}

let runtimeContext: SessionLogRuntimeContext = {
  productId: null,
  sessionId: null,
  role: 'standalone',
}

export function configureSessionLogRuntime(context: SessionLogRuntimeContext): void {
  runtimeContext = { ...context }
}

export function getSessionLogRuntimeContext(): SessionLogRuntimeContext {
  return { ...runtimeContext }
}

export async function recordSessionLogEvent(input: RecordSessionLogEventInput): Promise<void> {
  const sessionId = input.sessionId ?? runtimeContext.sessionId
  if (!sessionId || runtimeContext.role === 'standalone') return

  const { error } = await supabase.from('edusim_session_log_entries').insert({
    session_id: sessionId,
    category: input.category,
    event_type: input.eventType.slice(0, 100),
    label: input.label.slice(0, 240),
    details: input.details ?? {},
    simulation_time_seconds: input.simulationTimeSeconds ?? null,
    client_occurred_at: new Date().toISOString(),
  })
  if (error) console.warn('Unable to append teaching session log entry.', error.message)
}

export async function fetchSessionLogEntries(sessionId: string): Promise<SessionLogEntry[]> {
  const { data, error } = await supabase
    .from('edusim_session_log_entries')
    .select('*')
    .eq('session_id', sessionId)
    .order('id', { ascending: true })
    .limit(2000)
  if (error) throw error
  return (data ?? []) as SessionLogEntry[]
}

export function subscribeToSessionLogEntries(
  sessionId: string,
  onEntry: (entry: SessionLogEntry) => void,
): RealtimeChannel {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return supabase
    .channel(`edusim-session-log-${sessionId}-${suffix}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'edusim_session_log_entries',
        filter: `session_id=eq.${sessionId}`,
      },
      (payload) => onEntry(payload.new as SessionLogEntry),
    )
    .subscribe()
}

export async function closeSessionLogChannel(channel: RealtimeChannel | null): Promise<void> {
  if (channel) await supabase.removeChannel(channel)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function diffSessionState(
  before: unknown,
  after: unknown,
  prefix = '',
  output: SessionLogStateChange[] = [],
): SessionLogStateChange[] {
  if (Object.is(before, after)) return output
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)])
    for (const key of keys) {
      diffSessionState(before[key], after[key], prefix ? `${prefix}.${key}` : key, output)
    }
    return output
  }
  if (Array.isArray(before) && Array.isArray(after) && JSON.stringify(before) === JSON.stringify(after)) return output
  output.push({ path: prefix || 'state', from: before ?? null, to: after ?? null })
  return output
}

const FRIENDLY_SETTING_NAMES: Record<string, string> = {
  fio2: 'FiO₂',
  peep: 'PEEP',
  rate: 'rate',
  tidalVolume: 'tidal volume',
  inspiratoryTime: 'inspiratory time',
  inspiratoryFlow: 'inspiratory flow',
  pressureControl: 'pressure control',
  pressureSupport: 'pressure support',
  mode: 'mode',
  heartRate: 'heart rate',
  systolicPressure: 'systolic pressure',
  diastolicPressure: 'diastolic pressure',
  spo2: 'SpO₂',
  temperatureC: 'temperature',
  simulationPaused: 'simulation pause',
  simulationSpeed: 'simulation speed',
}

function shortValue(value: unknown): string {
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100)
  if (typeof value === 'boolean') return value ? 'on' : 'off'
  if (value == null) return '—'
  if (typeof value === 'string') return value
  try { return JSON.stringify(value) } catch { return String(value) }
}

export function settingChangesLabel(scope: string, changes: SessionLogStateChange[]): string {
  const shown = changes.slice(0, 3).map((change) => {
    const leaf = change.path.split('.').pop() ?? change.path
    const name = FRIENDLY_SETTING_NAMES[leaf] ?? leaf.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
    return `${name} ${shortValue(change.from)} → ${shortValue(change.to)}`
  })
  const suffix = changes.length > shown.length ? ` +${changes.length - shown.length} more` : ''
  return `${scope}: ${shown.join('; ')}${suffix}`
}
