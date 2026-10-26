import { supabase } from '../session/supabase'
import { requireInstructorAccount } from '../teaching/account/InstructorAccountService'

export type OrganisationRole = 'owner' | 'admin' | 'instructor'

export interface OrganisationRow {
  id: string
  name: string
  created_by: string
  created_at: string
  updated_at: string
}

export interface OrganisationMemberRow {
  organisation_id: string
  user_id: string
  email: string
  role: OrganisationRole
  created_at: string
}

export interface OrganisationInvitationRow {
  id: string
  organisation_id: string
  email: string
  role: Exclude<OrganisationRole, 'owner'>
  status: 'pending' | 'accepted' | 'revoked'
  invited_by: string
  accepted_by: string | null
  created_at: string
  updated_at: string
}

export interface OrganisationMembership {
  organisation: OrganisationRow
  membership: OrganisationMemberRow
}

const ACTIVE_ORGANISATION_KEY = 'lopjusim.active-organisation-id'

export function getStoredActiveOrganisationId(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(ACTIVE_ORGANISATION_KEY)
}

export function setStoredActiveOrganisationId(id: string | null) {
  if (typeof window === 'undefined') return
  if (id) window.localStorage.setItem(ACTIVE_ORGANISATION_KEY, id)
  else window.localStorage.removeItem(ACTIVE_ORGANISATION_KEY)
  window.dispatchEvent(new CustomEvent('lopjusim:active-organisation-changed', { detail: id }))
}

export async function listOrganisationMemberships(): Promise<OrganisationMembership[]> {
  const user = await requireInstructorAccount()
  const [{ data: organisations, error: orgError }, { data: members, error: memberError }] = await Promise.all([
    supabase.from('edusim_organisations').select('*').order('name'),
    supabase.from('edusim_organisation_members').select('*').eq('user_id', user.id),
  ])
  if (orgError) throw orgError
  if (memberError) throw memberError
  const memberByOrganisation = new Map(((members ?? []) as OrganisationMemberRow[]).map((row) => [row.organisation_id, row]))
  return ((organisations ?? []) as OrganisationRow[])
    .map((organisation) => ({ organisation, membership: memberByOrganisation.get(organisation.id) ?? null }))
    .filter((row): row is OrganisationMembership => row.membership != null)
}

export async function resolveActiveOrganisation(): Promise<OrganisationMembership | null> {
  const memberships = await listOrganisationMemberships()
  if (!memberships.length) {
    setStoredActiveOrganisationId(null)
    return null
  }
  const stored = getStoredActiveOrganisationId()
  const active = memberships.find((row) => row.organisation.id === stored) ?? memberships[0]
  if (active.organisation.id !== stored) setStoredActiveOrganisationId(active.organisation.id)
  return active
}

export async function createOrganisation(name: string): Promise<OrganisationRow> {
  const user = await requireInstructorAccount()
  const cleanName = name.trim()
  if (!cleanName) throw new Error('Enter an organisation name.')
  const { data, error } = await supabase
    .from('edusim_organisations')
    .insert({ name: cleanName, created_by: user.id, updated_at: new Date().toISOString() })
    .select('*')
    .single()
  if (error) throw error
  const organisation = data as OrganisationRow
  setStoredActiveOrganisationId(organisation.id)
  return organisation
}

export async function renameOrganisation(id: string, name: string) {
  const cleanName = name.trim()
  if (!cleanName) throw new Error('Enter an organisation name.')
  const { data, error } = await supabase
    .from('edusim_organisations')
    .update({ name: cleanName, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as OrganisationRow
}

export async function listOrganisationMembers(organisationId: string): Promise<OrganisationMemberRow[]> {
  const { data, error } = await supabase
    .from('edusim_organisation_members')
    .select('*')
    .eq('organisation_id', organisationId)
    .order('created_at')
  if (error) throw error
  return (data ?? []) as OrganisationMemberRow[]
}

export async function listOrganisationInvitations(organisationId: string): Promise<OrganisationInvitationRow[]> {
  const { data, error } = await supabase
    .from('edusim_organisation_invitations')
    .select('*')
    .eq('organisation_id', organisationId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as OrganisationInvitationRow[]
}

export async function listMyPendingOrganisationInvitations(): Promise<OrganisationInvitationRow[]> {
  const user = await requireInstructorAccount()
  const email = user.email?.trim().toLowerCase()
  if (!email) return []
  const { data, error } = await supabase
    .from('edusim_organisation_invitations')
    .select('*')
    .eq('status', 'pending')
    .ilike('email', email)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as OrganisationInvitationRow[]
}

export async function inviteOrganisationMember(organisationId: string, email: string, role: Exclude<OrganisationRole, 'owner'>) {
  const user = await requireInstructorAccount()
  const cleanEmail = email.trim().toLowerCase()
  if (!cleanEmail) throw new Error('Enter an email address.')
  const { data, error } = await supabase
    .from('edusim_organisation_invitations')
    .insert({ organisation_id: organisationId, email: cleanEmail, role, invited_by: user.id, status: 'pending', updated_at: new Date().toISOString() })
    .select('*')
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('There is already a pending invitation for that email address.')
    throw error
  }
  return data as OrganisationInvitationRow
}

export async function acceptOrganisationInvitation(invitation: OrganisationInvitationRow) {
  const user = await requireInstructorAccount()
  const { error: memberError } = await supabase
    .from('edusim_organisation_members')
    .insert({ organisation_id: invitation.organisation_id, user_id: user.id, email: user.email ?? '', role: invitation.role })
  if (memberError && memberError.code !== '23505') throw memberError
  const { error: inviteError } = await supabase
    .from('edusim_organisation_invitations')
    .update({ status: 'accepted', accepted_by: user.id, updated_at: new Date().toISOString() })
    .eq('id', invitation.id)
  if (inviteError) throw inviteError
  setStoredActiveOrganisationId(invitation.organisation_id)
}

export async function revokeOrganisationInvitation(id: string) {
  const { error } = await supabase
    .from('edusim_organisation_invitations')
    .update({ status: 'revoked', updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function updateOrganisationMemberRole(organisationId: string, userId: string, role: Exclude<OrganisationRole, 'owner'>) {
  const { error } = await supabase
    .from('edusim_organisation_members')
    .update({ role })
    .eq('organisation_id', organisationId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function removeOrganisationMember(organisationId: string, userId: string) {
  const { error } = await supabase
    .from('edusim_organisation_members')
    .delete()
    .eq('organisation_id', organisationId)
    .eq('user_id', userId)
  if (error) throw error
}
