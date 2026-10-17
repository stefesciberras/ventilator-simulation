import type { InstructorScenarioSnapshot } from './instructorAccount'
import { ensureAnonymousSession, supabase } from './session/supabase'

export interface SelfDirectedAssignmentCreated {
  assignmentId: string
  accessCode: string
  expiresAt: string
}

export interface SelfDirectedRunStart {
  runId: string
  assignmentId: string
  accessCode: string
  title: string
  scenario: InstructorScenarioSnapshot
  expiresAt: string
}

function cleanAccessCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
}

export function selfDirectedAssignmentUrl(accessCode: string) {
  if (typeof window === 'undefined') return `?assignment=${encodeURIComponent(cleanAccessCode(accessCode))}`
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('assignment', cleanAccessCode(accessCode))
  return url.toString()
}

/**
 * Self-directed v0.3 deliberately publishes the simulator/scenario state only.
 * Media, teaching prompts, questions and polling are deferred to a later schema.
 */
export function prepareSelfDirectedScenario(source: InstructorScenarioSnapshot): InstructorScenarioSnapshot {
  const scenario = JSON.parse(JSON.stringify(source)) as InstructorScenarioSnapshot
  scenario.mediaIds = []
  scenario.stages = scenario.stages?.map((stage) => ({
    ...stage,
    snapshot: { ...stage.snapshot, mediaIds: [] },
    apply: stage.apply ? { ...stage.apply, mediaIds: false } : stage.apply,
  }))
  return scenario
}

export async function createSelfDirectedAssignment(
  title: string,
  scenario: InstructorScenarioSnapshot,
  expiryDays: number,
): Promise<SelfDirectedAssignmentCreated> {
  const days = Math.max(1, Math.min(365, Math.round(expiryDays)))
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase.rpc('create_self_directed_assignment', {
    p_title: title.trim(),
    p_scenario: prepareSelfDirectedScenario(scenario),
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
  }
}

export async function startSelfDirectedRun(accessCode: string): Promise<SelfDirectedRunStart> {
  await ensureAnonymousSession()
  const code = cleanAccessCode(accessCode)
  if (code.length !== 8) throw new Error('Enter a valid 8-character self-directed session code.')
  const { data, error } = await supabase.rpc('start_self_directed_run', { p_access_code: code })
  if (error) throw error
  const result = Array.isArray(data) ? data[0] : data
  if (!result?.run_id || !result?.assignment_id || !result?.scenario) {
    throw new Error('Unable to start this self-directed scenario.')
  }
  return {
    runId: String(result.run_id),
    assignmentId: String(result.assignment_id),
    accessCode: code,
    title: String(result.title ?? 'Self-directed scenario'),
    scenario: result.scenario as InstructorScenarioSnapshot,
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
