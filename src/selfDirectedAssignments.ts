import type { InstructorScenarioSnapshot } from './instructorAccount'
import { ensureAnonymousSession, supabase } from './session/supabase'
import { isScenarioProductId, SCENARIO_PRODUCTS, type ScenarioProductId } from './teaching/scenario/products'

export interface SelfDirectedScenarioEnvelope<TScenario = unknown> {
  envelopeVersion: 1
  product: ScenarioProductId
  scenario: TScenario
}

export interface SelfDirectedAssignmentCreated {
  assignmentId: string
  accessCode: string
  expiresAt: string
  product: ScenarioProductId
}

export interface SelfDirectedRunStart<TScenario = unknown> {
  runId: string
  assignmentId: string
  accessCode: string
  title: string
  product: ScenarioProductId
  scenario: TScenario
  expiresAt: string
}

function cleanAccessCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
}

function isEnvelope(value: unknown): value is SelfDirectedScenarioEnvelope<unknown> {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return isScenarioProductId(record.product) && 'scenario' in record
}

export function selfDirectedAssignmentUrl(accessCode: string, product: ScenarioProductId = 'eduvent') {
  const code = cleanAccessCode(accessCode)
  const route = SCENARIO_PRODUCTS[product].route
  if (typeof window === 'undefined') return `${route}?assignment=${encodeURIComponent(code)}`
  const url = new URL(route, window.location.origin)
  url.searchParams.set('assignment', code)
  return url.toString()
}

/** Self-directed assignments are immutable product envelopes. */
export function prepareSelfDirectedScenario<TScenario>(product: ScenarioProductId, source: TScenario): SelfDirectedScenarioEnvelope<TScenario> {
  return JSON.parse(JSON.stringify({ envelopeVersion: 1, product, scenario: source })) as SelfDirectedScenarioEnvelope<TScenario>
}

/** Legacy three-argument calls remain EDUVENT assignments. */
export async function createSelfDirectedAssignment<TScenario = InstructorScenarioSnapshot>(
  title: string,
  scenario: TScenario,
  expiryDays: number,
  product: ScenarioProductId = 'eduvent',
): Promise<SelfDirectedAssignmentCreated> {
  const days = Math.max(1, Math.min(365, Math.round(expiryDays)))
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase.rpc('create_self_directed_assignment', {
    p_title: title.trim(),
    p_scenario: prepareSelfDirectedScenario(product, scenario),
    p_expires_at: expiresAt,
  })
  if (error) throw error
  const result = Array.isArray(data) ? data[0] : data
  if (!result?.assignment_id || !result?.access_code || !result?.expires_at) {
    throw new Error('Assignment creation returned incomplete details.')
  }
  return {
    assignmentId: String(result.assignment_id),
    accessCode: cleanAccessCode(String(result.access_code)),
    expiresAt: String(result.expires_at),
    product,
  }
}

export async function resolveSelfDirectedAssignmentProduct(accessCode: string): Promise<ScenarioProductId> {
  const code = cleanAccessCode(accessCode)
  if (code.length !== 8) throw new Error('Enter a valid 8-character self-directed session code.')
  await ensureAnonymousSession()
  const { data, error } = await supabase.rpc('resolve_self_directed_assignment_product', { p_access_code: code })
  if (error) {
    // Backwards compatibility while a deployment is between app and migration versions.
    if (String(error.message ?? '').includes('resolve_self_directed_assignment_product')) return 'eduvent'
    throw error
  }
  return isScenarioProductId(data) ? data : 'eduvent'
}

export async function routeToSelfDirectedAssignment(accessCode: string) {
  const code = cleanAccessCode(accessCode)
  const product = await resolveSelfDirectedAssignmentProduct(code)
  const target = selfDirectedAssignmentUrl(code, product)
  if (typeof window !== 'undefined') window.location.assign(target)
  return { product, target }
}

export async function startSelfDirectedRun<TScenario = InstructorScenarioSnapshot>(accessCode: string): Promise<SelfDirectedRunStart<TScenario>> {
  await ensureAnonymousSession()
  const code = cleanAccessCode(accessCode)
  if (code.length !== 8) throw new Error('Enter a valid 8-character self-directed session code.')
  const { data, error } = await supabase.rpc('start_self_directed_run', { p_access_code: code })
  if (error) throw error
  const result = Array.isArray(data) ? data[0] : data
  if (!result?.run_id || !result?.assignment_id || !result?.scenario) {
    throw new Error('Unable to start this self-directed scenario.')
  }

  const stored = result.scenario as unknown
  const envelope = isEnvelope(stored)
    ? stored
    : ({ envelopeVersion: 1, product: 'eduvent', scenario: stored } as SelfDirectedScenarioEnvelope<unknown>)

  return {
    runId: String(result.run_id),
    assignmentId: String(result.assignment_id),
    accessCode: code,
    title: String(result.title ?? 'Self-directed scenario'),
    product: envelope.product,
    scenario: envelope.scenario as TScenario,
    expiresAt: String(result.expires_at),
  }
}

export async function updateSelfDirectedRun(runId: string, currentStage: number, completed = false) {
  const { error } = await supabase.rpc('update_self_directed_run', {
    p_run_id: runId,
    p_current_stage: Math.max(0, Math.floor(currentStage)),
    p_completed: completed,
  })
  if (error) throw error
}
