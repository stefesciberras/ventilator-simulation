import { ensureAnonymousSession, supabase } from '../session/supabase'
import type { TeachingRole } from '../teaching/types'

export async function listCandidateActionPermissions(productId: string, role: TeachingRole): Promise<Set<string>> {
  if (role !== 'instructor' && role !== 'candidate') return new Set()
  await ensureAnonymousSession()
  const { data, error } = await supabase.rpc('list_edusim_candidate_action_permissions', {
    p_product_id: productId,
    p_actor_role: role,
  })
  if (error) throw error
  return new Set((data ?? []).map((row: { action_id?: string | null }) => String(row.action_id ?? '')).filter(Boolean))
}

export async function setCandidateActionPermission(productId: string, actionId: string, allowed: boolean): Promise<void> {
  await ensureAnonymousSession()
  const { error } = await supabase.rpc('set_edusim_candidate_action_permission', {
    p_product_id: productId,
    p_action_id: actionId,
    p_allowed: allowed,
  })
  if (error) throw error
}
