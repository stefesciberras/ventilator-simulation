import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../../session/supabase'
import type { TeachingRole } from '../types'

export type SessionLogCategory = 'settings' | 'drug' | 'event' | 'alarm' | 'device' | 'session' | 'scenario'
export type SessionLogActorRole = 'instructor' | 'candidate' | 'standalone'

export interface SessionLogEntry {
  id: number
  session_id: string
  product_id: string
  actor_user_id: string
  actor_role: SessionLogActorRole
  actor_name: string
  category: SessionLogCategory
  event_type: string
  label: string
  details: Record<string, unknown>
  simulation_time_seconds: number | null
  client_occurred_at: string
  created_at: string
}

export interface SessionLogStateChange { path: string; from: unknown; to: unknown }
interface SessionLogRuntimeContext { productId: string | null; sessionId: string | null; role: TeachingRole }
interface RecordSessionLogEventInput {
  category: SessionLogCategory
  eventType: string
  label: string
  details?: Record<string, unknown>
  simulationTimeSeconds?: number | null
  sessionId?: string | null
}
interface StandaloneLog { runId: string; nextId: number; entries: SessionLogEntry[] }

const MAX_STANDALONE_LOG_ENTRIES = 2000
const MAX_MODEL_STATE_SIGNATURES = 50
const standaloneMemory = new Map<string, StandaloneLog>()
const standaloneListeners = new Map<string, Set<(entry: SessionLogEntry) => void>>()
const modelStateSignatures = new Set<string>()
let runtimeContext: SessionLogRuntimeContext = { productId: null, sessionId: null, role: 'standalone' }

const storageKey = (productId: string) => `edusim.${productId}.standalone-session-log.v1`
const makeRunId = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
const stateSignature = (state: unknown): string | null => { try { return JSON.stringify(state) } catch { return null } }

export function markSessionLogModelState(state: unknown): void {
  const signature = stateSignature(state)
  if (!signature) return
  modelStateSignatures.add(signature)
  while (modelStateSignatures.size > MAX_MODEL_STATE_SIGNATURES) {
    const oldest = modelStateSignatures.values().next().value
    if (typeof oldest !== 'string') break
    modelStateSignatures.delete(oldest)
  }
}

export function consumeSessionLogModelState(state: unknown): boolean {
  const signature = stateSignature(state)
  if (!signature || !modelStateSignatures.has(signature)) return false
  modelStateSignatures.delete(signature)
  return true
}

function inferProductId(): string | null {
  if (runtimeContext.productId) return runtimeContext.productId
  if (typeof window === 'undefined') return null
  const path = window.location.pathname.toLowerCase()
  if (path.startsWith('/edumon/icu')) return 'edumon-icu'
  if (path.startsWith('/edumon')) return 'edumon-ana'
  return 'eduvent'
}

function standaloneLog(productId: string): StandaloneLog {
  const cached = standaloneMemory.get(productId)
  if (cached) return cached
  let loaded: StandaloneLog | null = null
  if (typeof window !== 'undefined') {
    try {
      const raw = window.sessionStorage.getItem(storageKey(productId))
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StandaloneLog>
        if (typeof parsed.runId === 'string' && Array.isArray(parsed.entries)) {
          loaded = { runId: parsed.runId, nextId: Number(parsed.nextId) || parsed.entries.length + 1, entries: (parsed.entries as SessionLogEntry[]).slice(-MAX_STANDALONE_LOG_ENTRIES) }
        }
      }
    } catch { /* memory-only fallback */ }
  }
  const log = loaded ?? { runId: makeRunId(), nextId: 1, entries: [] }
  standaloneMemory.set(productId, log)
  return log
}

function saveStandaloneLog(productId: string, log: StandaloneLog) {
  standaloneMemory.set(productId, log)
  if (typeof window === 'undefined') return
  try { window.sessionStorage.setItem(storageKey(productId), JSON.stringify(log)) } catch { /* optional persistence */ }
}

function appendStandalone(productId: string, input: RecordSessionLogEventInput) {
  const log = standaloneLog(productId)
  const now = new Date().toISOString()
  const entry: SessionLogEntry = {
    id: log.nextId,
    session_id: `local:${log.runId}`,
    product_id: productId,
    actor_user_id: 'local',
    actor_role: 'standalone',
    actor_name: 'Standalone',
    category: input.category,
    event_type: input.eventType.slice(0, 100),
    label: input.label.slice(0, 240),
    details: input.details ?? {},
    simulation_time_seconds: input.simulationTimeSeconds ?? null,
    client_occurred_at: now,
    created_at: now,
  }
  saveStandaloneLog(productId, { runId: log.runId, nextId: log.nextId + 1, entries: [...log.entries, entry].slice(-MAX_STANDALONE_LOG_ENTRIES) })
  for (const listener of standaloneListeners.get(productId) ?? []) listener(entry)
}

export function configureSessionLogRuntime(context: SessionLogRuntimeContext): void {
  runtimeContext = { ...context }
  if (context.role === 'standalone' && context.productId) standaloneLog(context.productId)
}

export function getSessionLogRuntimeContext(): SessionLogRuntimeContext { return { ...runtimeContext } }
export function getStandaloneSessionLogRunId(productId: string): string { return standaloneLog(productId).runId }
export function fetchStandaloneSessionLogEntries(productId: string): SessionLogEntry[] { return [...standaloneLog(productId).entries] }
export function clearStandaloneSessionLog(productId: string): void {
  saveStandaloneLog(productId, { runId: makeRunId(), nextId: 1, entries: [] })
}
export function subscribeToStandaloneSessionLogEntries(productId: string, onEntry: (entry: SessionLogEntry) => void): () => void {
  const listeners = standaloneListeners.get(productId) ?? new Set<(entry: SessionLogEntry) => void>()
  listeners.add(onEntry)
  standaloneListeners.set(productId, listeners)
  return () => { listeners.delete(onEntry); if (!listeners.size) standaloneListeners.delete(productId) }
}

export async function recordSessionLogEvent(input: RecordSessionLogEventInput): Promise<void> {
  if (input.sessionId == null && runtimeContext.role === 'standalone') {
    const productId = inferProductId()
    if (productId) appendStandalone(productId, input)
    return
  }
  const sessionId = input.sessionId ?? runtimeContext.sessionId
  if (!sessionId) return
  const details = {
    ...(input.details ?? {}),
    _originRole: runtimeContext.role,
  }
  const { error } = await supabase.from('edusim_session_log_entries').insert({
    session_id: sessionId,
    category: input.category,
    event_type: input.eventType.slice(0, 100),
    label: input.label.slice(0, 240),
    details,
    simulation_time_seconds: input.simulationTimeSeconds ?? null,
    client_occurred_at: new Date().toISOString(),
  })
  if (error) console.warn('Unable to append teaching session log entry.', error.message)
}

export async function fetchSessionLogEntries(sessionId: string): Promise<SessionLogEntry[]> {
  const { data, error } = await supabase.from('edusim_session_log_entries').select('*').eq('session_id', sessionId).order('id', { ascending: true }).limit(2000)
  if (error) throw error
  return (data ?? []) as SessionLogEntry[]
}

export function subscribeToSessionLogEntries(sessionId: string, onEntry: (entry: SessionLogEntry) => void): RealtimeChannel {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return supabase.channel(`edusim-session-log-${sessionId}-${suffix}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'edusim_session_log_entries', filter: `session_id=eq.${sessionId}` }, (payload) => onEntry(payload.new as SessionLogEntry)).subscribe()
}

export async function closeSessionLogChannel(channel: RealtimeChannel | null): Promise<void> { if (channel) await supabase.removeChannel(channel) }

function isPlainObject(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) }

export function diffSessionState(before: unknown, after: unknown, prefix = '', output: SessionLogStateChange[] = []): SessionLogStateChange[] {
  if (Object.is(before, after)) return output
  if (isPlainObject(before) || isPlainObject(after)) {
    const beforeObject = isPlainObject(before) ? before : {}
    const afterObject = isPlainObject(after) ? after : {}
    const keys = new Set([...Object.keys(beforeObject), ...Object.keys(afterObject)])
    for (const key of keys) diffSessionState(beforeObject[key], afterObject[key], prefix ? `${prefix}.${key}` : key, output)
    return output
  }
  if (Array.isArray(before) && Array.isArray(after) && JSON.stringify(before) === JSON.stringify(after)) return output
  output.push({ path: prefix || 'state', from: before ?? null, to: after ?? null })
  return output
}

function valueAtPath(value: unknown, segments: string[]): unknown {
  let current = value
  for (const segment of segments) {
    if (!isPlainObject(current)) return undefined
    current = current[segment]
  }
  return current
}

const AUTOMATIC_MODEL_PATHS = new Set([
  'heartRate',
  'systolicPressure',
  'diastolicPressure',
  'respiratory.respiratoryRate',
  'respiratory.spontaneousRespiratoryRate',
  'respiratory.spontaneousTidalVolumeMl',
  'anaestheticPhysiology.depthOfAnaesthesia',
  'patient.heartRate',
  'patient.systolicPressure',
  'patient.diastolicPressure',
  'patient.respiratory.respiratoryRate',
  'patient.respiratory.spontaneousRespiratoryRate',
  'patient.respiratory.spontaneousTidalVolumeMl',
  'patient.anaestheticPhysiology.depthOfAnaesthesia',
])

const RUNTIME_BOOKKEEPING_PREFIXES = [
  'runtimeMode',
  'lastActionId',
  'actionSequence',
  'actionSimulationTime',
  'actionCommand',
  'actionRuntimeSnapshot',
]

/**
 * Keep the human Session Log focused on deliberate actions/settings. Structural
 * model hydration, calculated physiology and action-runtime replication are simulator
 * internals, not candidate/instructor actions, and are omitted from the log.
 */
export function filterSessionStateChanges(before: unknown, after: unknown, changes: SessionLogStateChange[]): SessionLogStateChange[] {
  return changes.filter((change) => {
    if (change.path === 'anaestheticGases.fiSevoPercent' || change.path === 'patient.anaestheticGases.fiSevoPercent') return false
    if (AUTOMATIC_MODEL_PATHS.has(change.path)) return false
    if (change.path.startsWith('anaestheticPhysiology.responseBaseline') || change.path.startsWith('patient.anaestheticPhysiology.responseBaseline')) return false
    if (RUNTIME_BOOKKEEPING_PREFIXES.some((prefix) => change.path === prefix || change.path.startsWith(`${prefix}.`))) return false

    const segments = change.path.split('.')
    for (let depth = 1; depth < segments.length; depth += 1) {
      const prefix = segments.slice(0, depth)
      const beforeValue = valueAtPath(before, prefix)
      const afterValue = valueAtPath(after, prefix)
      if (beforeValue == null && isPlainObject(afterValue)) return false
    }
    return true
  })
}

const FRIENDLY_SETTING_NAMES: Record<string, string> = {
  fio2: 'FiO₂', peep: 'PEEP', rate: 'rate', tidalVolume: 'tidal volume', inspiratoryTime: 'inspiratory time', inspiratoryFlow: 'inspiratory flow', pressureControl: 'pressure control', pressureSupport: 'pressure support', mode: 'mode', heartRate: 'heart rate', systolicPressure: 'systolic pressure', diastolicPressure: 'diastolic pressure', spo2: 'SpO₂', temperatureC: 'temperature', simulationPaused: 'simulation pause', simulationSpeed: 'simulation speed', ventilatorMode: 'ventilator mode', ventilatorSetRate: 'ventilator rate', ventilatorSetTidalVolumeMl: 'tidal volume', peepCmH2O: 'PEEP',
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
  return `${scope}: ${shown.join('; ')}${changes.length > shown.length ? ` +${changes.length - shown.length} more` : ''}`
}