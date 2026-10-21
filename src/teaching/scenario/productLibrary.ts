import { getInstructorAccount } from '../../instructorAccount'
import { supabase } from '../../session/supabase'
import type { ScenarioProductId } from './products'

export interface ProductScenarioRow<TScenario> {
  id: string
  instructor_id: string
  product: ScenarioProductId
  name: string
  scenario: TScenario
  created_at: string
  updated_at: string
}

async function requireInstructor() {
  const user = await getInstructorAccount()
  if (!user) throw new Error('Sign in to an instructor account first.')
  return user
}

export async function listProductScenarios<TScenario>(product: ScenarioProductId): Promise<Array<ProductScenarioRow<TScenario>>> {
  const user = await requireInstructor()
  const { data, error } = await supabase
    .from('instructor_presets')
    .select('*')
    .eq('instructor_id', user.id)
    .eq('product', product)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Array<ProductScenarioRow<TScenario>>
}

export async function createProductScenario<TScenario>(product: ScenarioProductId, name: string, scenario: TScenario): Promise<ProductScenarioRow<TScenario>> {
  const user = await requireInstructor()
  const cleanName = name.trim()
  if (!cleanName) throw new Error('Enter a scenario name.')
  const { data, error } = await supabase
    .from('instructor_presets')
    .insert({ instructor_id: user.id, product, name: cleanName, scenario, updated_at: new Date().toISOString() })
    .select('*')
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('You already have a scenario with that name for this simulator.')
    throw error
  }
  return data as ProductScenarioRow<TScenario>
}

export async function updateProductScenario<TScenario>(product: ScenarioProductId, id: string, updates: { name?: string; scenario?: TScenario }): Promise<ProductScenarioRow<TScenario>> {
  const user = await requireInstructor()
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (updates.name !== undefined) {
    const cleanName = updates.name.trim()
    if (!cleanName) throw new Error('Enter a scenario name.')
    payload.name = cleanName
  }
  if (updates.scenario !== undefined) payload.scenario = updates.scenario
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
  return data as ProductScenarioRow<TScenario>
}

export async function deleteProductScenario(product: ScenarioProductId, id: string) {
  const user = await requireInstructor()
  const { error } = await supabase
    .from('instructor_presets')
    .delete()
    .eq('id', id)
    .eq('instructor_id', user.id)
    .eq('product', product)
  if (error) throw error
}
