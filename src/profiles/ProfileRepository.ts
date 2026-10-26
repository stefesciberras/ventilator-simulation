import { supabase } from '../session/supabase'
import { requireInstructorAccount } from '../teaching/account/InstructorAccountService'
import type { ScenarioProductId } from '../teaching/scenario/products'
import {
  resolveActiveOrganisation,
  type OrganisationMembership,
} from '../organisations/OrganisationService'

export type ProductProfileOwnerType = 'user' | 'organisation'
export type ProductProfileScope =
  | { type: 'user' }
  | { type: 'organisation'; organisationId: string }

export interface ProductProfileRow<TValues extends object = Record<string, unknown>> {
  id: string
  instructor_id: string | null
  owner_type: ProductProfileOwnerType
  organisation_id: string | null
  owner_user_id: string | null
  created_by: string | null
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

function scopeMatches<TValues extends object>(row: ProductProfileRow<TValues>, scope: ProductProfileScope, userId: string) {
  return scope.type === 'user'
    ? row.owner_type === 'user' && row.owner_user_id === userId
    : row.owner_type === 'organisation' && row.organisation_id === scope.organisationId
}

function sortEffectiveRows<TValues extends object>(rows: Array<ProductProfileRow<TValues>>) {
  return [...rows].sort((a, b) => {
    if (a.owner_type !== b.owner_type) return a.owner_type === 'user' ? -1 : 1
    return Date.parse(b.updated_at) - Date.parse(a.updated_at)
  })
}

async function activeOrganisationIfAvailable(): Promise<OrganisationMembership | null> {
  try {
    return await resolveActiveOrganisation()
  } catch {
    return null
  }
}

export async function listProductProfiles<TValues extends object>(product: ScenarioProductId): Promise<Array<ProductProfileRow<TValues>>> {
  const user = await requireInstructorAccount()
  const activeOrganisation = await activeOrganisationIfAvailable()
  const { data, error } = await supabase
    .from('edusim_profiles')
    .select('*')
    .eq('product', product)
    .order('updated_at', { ascending: false })
  if (error) throw error
  const rows = ((data ?? []) as Array<Record<string, unknown>>).map(decodeRow<TValues>)
  return sortEffectiveRows(rows.filter((row) =>
    (row.owner_type === 'user' && row.owner_user_id === user.id)
    || (activeOrganisation != null && row.owner_type === 'organisation' && row.organisation_id === activeOrganisation.organisation.id),
  ))
}

export async function listProductProfilesIfSignedIn<TValues extends object>(product: ScenarioProductId): Promise<Array<ProductProfileRow<TValues>>> {
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user || Boolean((authData.user as typeof authData.user & { is_anonymous?: boolean }).is_anonymous)) return []
  const activeOrganisation = await activeOrganisationIfAvailable()
  const { data, error } = await supabase
    .from('edusim_profiles')
    .select('*')
    .eq('product', product)
    .order('updated_at', { ascending: false })
  if (error) throw error
  const rows = ((data ?? []) as Array<Record<string, unknown>>).map(decodeRow<TValues>)
  return sortEffectiveRows(rows.filter((row) =>
    (row.owner_type === 'user' && row.owner_user_id === authData.user!.id)
    || (activeOrganisation != null && row.owner_type === 'organisation' && row.organisation_id === activeOrganisation.organisation.id),
  ))
}

export async function resolveDefaultProfileWriteScope(): Promise<ProductProfileScope> {
  const active = await activeOrganisationIfAvailable()
  if (active && (active.membership.role === 'owner' || active.membership.role === 'admin')) {
    return { type: 'organisation', organisationId: active.organisation.id }
  }
  return { type: 'user' }
}

function insertOwnership(userId: string, scope: ProductProfileScope) {
  if (scope.type === 'organisation') {
    return {
      instructor_id: null,
      owner_type: 'organisation' as const,
      organisation_id: scope.organisationId,
      owner_user_id: null,
      created_by: userId,
    }
  }
  return {
    instructor_id: userId,
    owner_type: 'user' as const,
    organisation_id: null,
    owner_user_id: userId,
    created_by: userId,
  }
}

export async function createProductProfile<TValues extends object>(
  product: ScenarioProductId,
  name: string,
  values: TValues,
  baseKey: string | null = null,
  requestedScope?: ProductProfileScope,
) {
  const user = await requireInstructorAccount()
  const scope = requestedScope ?? await resolveDefaultProfileWriteScope()
  const cleanName = name.trim()
  if (!cleanName) throw new Error('Enter a profile name.')
  const { data, error } = await supabase
    .from('edusim_profiles')
    .insert({
      ...insertOwnership(user.id, scope),
      product,
      name: cleanName,
      base_key: baseKey,
      values,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('A profile with that name already exists in this library for this simulator.')
    throw error
  }
  return decodeRow<TValues>(data as Record<string, unknown>)
}

export async function updateProductProfile<TValues extends object>(id: string, product: ScenarioProductId, updates: { name?: string; values?: TValues }) {
  await requireInstructorAccount()
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
    .eq('product', product)
    .select('*')
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('A profile with that name already exists in this library for this simulator.')
    throw error
  }
  return decodeRow<TValues>(data as Record<string, unknown>)
}

export async function saveBuiltinProfileOverride<TValues extends object>(
  product: ScenarioProductId,
  baseKey: string,
  name: string,
  values: TValues,
  requestedScope?: ProductProfileScope,
) {
  const user = await requireInstructorAccount()
  const scope = requestedScope ?? await resolveDefaultProfileWriteScope()
  const rows = await listProductProfiles<TValues>(product)
  const existing = rows.find((row) => row.base_key === baseKey && scopeMatches(row, scope, user.id))
  return existing
    ? updateProductProfile(existing.id, product, { name, values })
    : createProductProfile(product, name, values, baseKey, scope)
}

export async function deleteProductProfile(id: string, product: ScenarioProductId) {
  await requireInstructorAccount()
  const { error } = await supabase
    .from('edusim_profiles')
    .delete()
    .eq('id', id)
    .eq('product', product)
  if (error) throw error
}

export async function resetBuiltinProfile(product: ScenarioProductId, baseKey: string, requestedScope?: ProductProfileScope) {
  const user = await requireInstructorAccount()
  const scope = requestedScope ?? await resolveDefaultProfileWriteScope()
  const rows = await listProductProfiles(product)
  const row = rows.find((candidate) => candidate.base_key === baseKey && scopeMatches(candidate, scope, user.id))
  if (!row) return
  await deleteProductProfile(row.id, product)
}
