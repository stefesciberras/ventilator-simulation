import { supabase } from '../session/supabase'
import { requireInstructorAccount } from '../teaching/account/InstructorAccountService'

export type EdusimActionKind = 'drug' | 'event'
export type EdusimShortPressAction = 'momentary' | 'toggle'
export type EdusimActionEnvironment = 'edumon-ana' | 'edumon-icu'

export interface EdusimActionDefinition {
  id: string
  kind: EdusimActionKind
  name: string
  short_press_action: EdusimShortPressAction
  long_press_action: string | null
  duration_seconds: number
  description: string
  environments: EdusimActionEnvironment[]
  sort_order: number
  created_at: string
  updated_at: string
}

export type EdusimActionDraft = Pick<EdusimActionDefinition,
  'id' | 'kind' | 'name' | 'short_press_action' | 'long_press_action' | 'duration_seconds' | 'description' | 'environments' | 'sort_order'
>

const selectColumns = 'id,kind,name,short_press_action,long_press_action,duration_seconds,description,environments,sort_order,created_at,updated_at'

function normalise(row: Record<string, unknown>): EdusimActionDefinition {
  return {
    id: String(row.id),
    kind: row.kind === 'event' ? 'event' : 'drug',
    name: String(row.name ?? ''),
    short_press_action: row.short_press_action === 'toggle' ? 'toggle' : 'momentary',
    long_press_action: typeof row.long_press_action === 'string' && row.long_press_action.length ? row.long_press_action : null,
    duration_seconds: Number(row.duration_seconds ?? 0),
    description: String(row.description ?? ''),
    environments: Array.isArray(row.environments)
      ? row.environments.filter((value): value is EdusimActionEnvironment => value === 'edumon-ana' || value === 'edumon-icu')
      : ['edumon-ana'],
    sort_order: Number(row.sort_order ?? 0),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

export async function listEdusimActions(environment?: EdusimActionEnvironment): Promise<EdusimActionDefinition[]> {
  await requireInstructorAccount()
  let query = supabase.from('edusim_action_definitions').select(selectColumns).order('kind').order('sort_order').order('name')
  if (environment) query = query.contains('environments', [environment])
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((row) => normalise(row as Record<string, unknown>))
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
    environments: [...new Set(draft.environments)],
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('edusim_action_definitions')
    .upsert(payload, { onConflict: 'id' })
    .select(selectColumns)
    .single()
  if (error) throw error
  return normalise(data as Record<string, unknown>)
}

export async function deleteEdusimAction(id: string): Promise<void> {
  await requireInstructorAccount()
  const { error } = await supabase.from('edusim_action_definitions').delete().eq('id', id)
  if (error) throw error
}
