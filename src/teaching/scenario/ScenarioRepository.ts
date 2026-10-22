import { supabase } from '../../session/supabase'
import { requireInstructorAccount } from '../account/InstructorAccountService'
import type { ScenarioProductId } from './products'

export interface ScenarioRepositoryRow<TScenario> {
  id: string
  instructor_id: string
  product: ScenarioProductId
  name: string
  scenario: TScenario
  created_at: string
  updated_at: string
}

export interface ScenarioCodec<TScenario> {
  encode?: (scenario: TScenario) => unknown
  decode?: (scenario: unknown) => TScenario
}

export function createScenarioRepository<TScenario>(product: ScenarioProductId, codec: ScenarioCodec<TScenario> = {}) {
  const encode = codec.encode ?? ((scenario: TScenario) => scenario)
  const decode = codec.decode ?? ((scenario: unknown) => scenario as TScenario)
  const decodeRow = (row: Record<string, unknown>) => ({
    ...row,
    product,
    scenario: decode(row.scenario),
  }) as ScenarioRepositoryRow<TScenario>

  return {
    async list(): Promise<Array<ScenarioRepositoryRow<TScenario>>> {
      const user = await requireInstructorAccount()
      const { data, error } = await supabase
        .from('instructor_presets')
        .select('*')
        .eq('instructor_id', user.id)
        .eq('product', product)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return ((data ?? []) as Array<Record<string, unknown>>).map(decodeRow)
    },

    async create(name: string, scenario: TScenario): Promise<ScenarioRepositoryRow<TScenario>> {
      const user = await requireInstructorAccount()
      const cleanName = name.trim()
      if (!cleanName) throw new Error('Enter a scenario name.')
      const { data, error } = await supabase
        .from('instructor_presets')
        .insert({ instructor_id: user.id, product, name: cleanName, scenario: encode(scenario), updated_at: new Date().toISOString() })
        .select('*')
        .single()
      if (error) {
        if (error.code === '23505') throw new Error('You already have a scenario with that name for this simulator.')
        throw error
      }
      return decodeRow(data as Record<string, unknown>)
    },

    async update(id: string, updates: { name?: string; scenario?: TScenario }): Promise<ScenarioRepositoryRow<TScenario>> {
      const user = await requireInstructorAccount()
      const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (updates.name !== undefined) {
        const cleanName = updates.name.trim()
        if (!cleanName) throw new Error('Enter a scenario name.')
        payload.name = cleanName
      }
      if (updates.scenario !== undefined) payload.scenario = encode(updates.scenario)
      const { data, error } = await supabase
        .from('instructor_presets')
        .update(payload)
        .eq('id', id)
        .eq('instructor_id', user.id)
        .eq('product', product)
        .select('*')
        .single()
      if (error) {
        if (error.code === '23505') throw new Error('You already have a scenario with that name for this simulator.')
        throw error
      }
      return decodeRow(data as Record<string, unknown>)
    },

    async remove(id: string) {
      const user = await requireInstructorAccount()
      const { error } = await supabase
        .from('instructor_presets')
        .delete()
        .eq('id', id)
        .eq('instructor_id', user.id)
        .eq('product', product)
      if (error) throw error
    },
  }
}
