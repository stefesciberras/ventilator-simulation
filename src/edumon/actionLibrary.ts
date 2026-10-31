import { supabase } from '../session/supabase'
import { requireInstructorAccount } from '../teaching/account/InstructorAccountService'
import {
  DEFAULT_EDUSIM_ACTION_PRIORITY,
  normaliseEdusimActionEffects,
  type EdusimActionEffect,
} from '../edusim/actions/ActionEffect'

export type EdusimActionKind = 'drug' | 'event'
export type EdusimShortPressAction = 'momentary' | 'toggle'
export type EdusimActionEnvironment = 'edumon-ana' | 'edumon-icu'
export type EdusimActionSetting = 'ana' | 'itu' | 'all'
export type EdusimCandidateActionAccess = 'allowed' | 'instructor-only' | 'scenario'

export interface EdusimActionDefinition {
  id: string
  kind: EdusimActionKind
  name: string
  short_press_action: EdusimShortPressAction
  long_press_action: string | null
  duration_seconds: number
  description: string
  setting: EdusimActionSetting
  environments: EdusimActionEnvironment[]
  effects: EdusimActionEffect[]
  candidate_access?: EdusimCandidateActionAccess
  priority?: number
  sort_order: number
  created_at: string
  updated_at: string
}

export type EdusimActionDraft = Pick<EdusimActionDefinition,
  'id' | 'kind' | 'name' | 'short_press_action' | 'long_press_action' | 'duration_seconds' | 'description' | 'setting' | 'effects' | 'candidate_access' | 'priority' | 'sort_order'
>

const selectColumns = 'id,kind,name,short_press_action,long_press_action,duration_seconds,description,setting,environments,effects,candidate_access,priority,sort_order,created_at,updated_at'
const ACTION_RUNTIME_CACHE_KEY = 'loppjusim:edusim-action-definitions'
const runtimeActionDefinitions = new Map<string, EdusimActionDefinition>()

function settingToEnvironments(setting: EdusimActionSetting): EdusimActionEnvironment[] {
  if (setting === 'all') return ['edumon-ana', 'edumon-icu']
  return setting === 'itu' ? ['edumon-icu'] : ['edumon-ana']
}

function normalise(row: Record<string, unknown>): EdusimActionDefinition {
  const setting: EdusimActionSetting = row.setting === 'itu' || row.setting === 'all' ? row.setting : 'ana'
  const priority = Number(row.priority)
  const id = String(row.id)
  const candidateAccess: EdusimCandidateActionAccess = row.candidate_access === 'allowed' || row.candidate_access === 'scenario'
    ? row.candidate_access
    : 'instructor-only'
  return {
    id,
    kind: row.kind === 'event' ? 'event' : 'drug',
    name: id === 'diaphragm-return' ? 'Curare Cleft' : String(row.name ?? ''),
    short_press_action: row.short_press_action === 'toggle' ? 'toggle' : 'momentary',
    long_press_action: typeof row.long_press_action === 'string' && row.long_press_action.length ? row.long_press_action : null,
    duration_seconds: Number(row.duration_seconds ?? 0),
    description: String(row.description ?? ''),
    setting,
    environments: settingToEnvironments(setting),
    effects: normaliseEdusimActionEffects(row.effects),
    candidate_access: candidateAccess,
    priority: Number.isFinite(priority) ? priority : DEFAULT_EDUSIM_ACTION_PRIORITY,
    sort_order: Number(row.sort_order ?? 0),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

function actionAppliesToEnvironment(definition: EdusimActionDefinition, environment?: EdusimActionEnvironment) {
  return !environment || definition.environments.includes(environment)
}

function hydrateRuntimeActionCache() {
  if (runtimeActionDefinitions.size || typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(ACTION_RUNTIME_CACHE_KEY)
    const rows = raw ? JSON.parse(raw) as EdusimActionDefinition[] : []
    cacheEdusimActionDefinitions(rows, false)
  } catch {
    // Action cache is best-effort. The live library remains authoritative.
  }
}

export function cacheEdusimActionDefinitions(definitions: readonly EdusimActionDefinition[], persist = true): void {
  for (const definition of definitions) runtimeActionDefinitions.set(definition.id, definition)
  if (!persist || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(ACTION_RUNTIME_CACHE_KEY, JSON.stringify([...runtimeActionDefinitions.values()]))
  } catch {
    // Persistence is optional; an in-memory cache is enough for the active run.
  }
}

export function getCachedEdusimActionDefinition(id: string, environment?: EdusimActionEnvironment): EdusimActionDefinition | null {
  hydrateRuntimeActionCache()
  const definition = runtimeActionDefinitions.get(id) ?? null
  return definition && actionAppliesToEnvironment(definition, environment) ? definition : null
}

/**
 * Resolve an action for the live simulation path. Prefer the already-loaded or
 * locally persisted definition so scenario execution remains local-first; only
 * fall back to the cloud library if this browser has never cached the action.
 */
export async function resolveEdusimActionDefinition(id: string, environment?: EdusimActionEnvironment): Promise<EdusimActionDefinition | null> {
  const cached = getCachedEdusimActionDefinition(id, environment)
  if (cached) return cached
  try {
    const rows = await listEdusimActions(environment)
    return rows.find((definition) => definition.id === id) ?? null
  } catch {
    return null
  }
}

export async function listEdusimActions(environment?: EdusimActionEnvironment): Promise<EdusimActionDefinition[]> {
  let query = supabase.from('edusim_action_definitions').select(selectColumns).order('kind').order('sort_order').order('name')
  if (environment) {
    const setting = environment === 'edumon-icu' ? 'itu' : 'ana'
    query = query.in('setting', [setting, 'all'])
  }
  const { data, error } = await query
  if (error) throw error
  const definitions = (data ?? []).map((row) => normalise(row as Record<string, unknown>))
  cacheEdusimActionDefinitions(definitions)
  return definitions
}

export async function saveEdusimAction(draft: EdusimActionDraft): Promise<EdusimActionDefinition> {
  await requireInstructorAccount()
  const payload = {
    ...draft,
    id: draft.id.trim().toLowerCase(),
    name: draft.name.trim(),
    description: draft.description.trim(),
    long_press_action: draft.long_press_action?.trim() || null,
    duration_seconds: Math.max(0, Number(draft.duration_seconds) || 0),
    candidate_access: draft.candidate_access === 'allowed' || draft.candidate_access === 'scenario' ? draft.candidate_access : 'instructor-only',
    priority: Number.isFinite(Number(draft.priority)) ? Number(draft.priority) : DEFAULT_EDUSIM_ACTION_PRIORITY,
    effects: normaliseEdusimActionEffects(draft.effects),
    environments: settingToEnvironments(draft.setting),
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('edusim_action_definitions')
    .upsert(payload, { onConflict: 'id' })
    .select(selectColumns)
    .single()
  if (error) throw error
  const definition = normalise(data as Record<string, unknown>)
  cacheEdusimActionDefinitions([definition])
  return definition
}

export async function deleteEdusimAction(id: string): Promise<void> {
  await requireInstructorAccount()
  const { error } = await supabase.from('edusim_action_definitions').delete().eq('id', id)
  if (error) throw error
  runtimeActionDefinitions.delete(id)
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(ACTION_RUNTIME_CACHE_KEY, JSON.stringify([...runtimeActionDefinitions.values()])) } catch { /* optional cache */ }
  }
}
