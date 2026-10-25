import { supabase } from '../session/supabase'
import { requireInstructorAccount } from '../teaching/account/InstructorAccountService'
import type { ScenarioProductId } from '../teaching/scenario/products'

export interface ProductProfileRow<TValues extends object = Record<string, unknown>> {
  id: string
  instructor_id: string
  product: ScenarioProductId
  name: string
  base_key: string | null
  values: TValues
  created_at: string
  updated_at: string
}

function decodeRow<TValues extends object>(row: Record<string, unknown>): ProductProfileRow<TValues> {
  return row as unknown as ProductProfileRow<TValues>
}

export async function listProductProfiles<TValues extends object>(product: ScenarioProductId): Promise<Array<ProductProfileRow<TValues>>> {
  const user = await requireInstructorAccount()
  const { data, error } = await supabase
    .from('edusim_profiles')
    .select('*')
    .eq('instructor_id', user.id)
    .eq('product', product)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as Array<Record<string, unknown>>).map(decodeRow<TValues>)
}

export async function listProductProfilesIfSignedIn<TValues extends object>(product: ScenarioProductId): Promise<Array<ProductProfileRow<TValues>>> {
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) return []
  const { data, error } = await supabase
    .from('edusim_profiles')
    .select('*')
    .eq('instructor_id', authData.user.id)
    .eq('product', product)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as Array<Record<string, unknown>>).map(decodeRow<TValues>)
}

export async function createProductProfile<TValues extends object>(product: ScenarioProductId, name: string, values: TValues, baseKey: string | null = null) {
  const user = await requireInstructorAccount()
  const cleanName = name.trim()
  if (!cleanName) throw new Error('Enter a profile name.')
  const { data, error } = await supabase
    .from('edusim_profiles')
    .insert({ instructor_id: user.id, product, name: cleanName, base_key: baseKey, values, updated_at: new Date().toISOString() })
    .select('*')
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('A profile with that name already exists for this simulator.')
    throw error
  }
  return decodeRow<TValues>(data as Record<string, unknown>)
}

export async function updateProductProfile<TValues extends object>(id: string, product: ScenarioProductId, updates: { name?: string; values?: TValues }) {
  const user = await requireInstructorAccount()
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (updates.name !== undefined) {
    const cleanName = updates.name.trim()
    if (!cleanName) throw new Error('Enter a profile name.')
    payload.name = cleanName
  }
  if (updates.values !== undefined) payload.values = updates.values
  const { data, error } = await supabase
    .from('edusim_profiles')
    .update(payload)
    .eq('id', id)
    .eq('instructor_id', user.id)
    .eq('product', product)
    .select('*')
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('A profile with that name already exists for this simulator.')
    throw error
  }
  return decodeRow<TValues>(data as Record<string, unknown>)
}

export async function saveBuiltinProfileOverride<TValues extends object>(product: ScenarioProductId, baseKey: string, name: string, values: TValues) {
  const rows = await listProductProfiles<TValues>(product)
  const existing = rows.find((row) => row.base_key === baseKey)
  return existing
    ? updateProductProfile(existing.id, product, { name, values })
    : createProductProfile(product, name, values, baseKey)
}

export async function deleteProductProfile(id: string, product: ScenarioProductId) {
  const user = await requireInstructorAccount()
  const { error } = await supabase
    .from('edusim_profiles')
    .delete()
    .eq('id', id)
    .eq('instructor_id', user.id)
    .eq('product', product)
  if (error) throw error
}

export async function resetBuiltinProfile(product: ScenarioProductId, baseKey: string) {
  const user = await requireInstructorAccount()
  const { error } = await supabase
    .from('edusim_profiles')
    .delete()
    .eq('instructor_id', user.id)
    .eq('product', product)
    .eq('base_key', baseKey)
  if (error) throw error
}
