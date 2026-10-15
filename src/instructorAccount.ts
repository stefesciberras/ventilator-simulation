import type { User } from '@supabase/supabase-js'
import type { AlarmLimits } from './alarmTypes'
import type { PatientSettings, VentilatorSettings } from './simulation/types'
import { supabase } from './session/supabase'

export type ScenarioWaveform = 'volume' | 'co2' | 'oesophagealPressure'
export type InstructorScenarioKind = 'static' | 'dynamic'

export type DynamicScenarioMetric =
  | 'peakPressure' | 'plateauPressure' | 'meanPressure' | 'totalPeep' | 'autoPeep'
  | 'expiredTidalVolume' | 'totalRespiratoryRate' | 'actualMinuteVentilation'
  | 'alveolarMinuteVentilation' | 'endTidalCO2' | 'oxygenSaturation' | 'drivingPressure'

export type DynamicScenarioTrigger =
  | { type: 'manual' }
  | { type: 'time'; seconds: number }
  | { type: 'condition'; metric: DynamicScenarioMetric; operator: 'lt' | 'eq' | 'gt'; value: number }
  | { type: 'action'; parameter: keyof VentilatorSettings; actor: 'candidate' | 'instructor' | 'either' }

export interface DynamicScenarioApplyMask {
  ventilator: Array<keyof VentilatorSettings>
  patient: Array<keyof PatientSettings>
  alarmLimits: Array<keyof AlarmLimits>
  patientTransitionSeconds: boolean
  waveformDisplay: boolean
  mediaIds: boolean
}

export interface DynamicScenarioStage {
  name: string
  snapshot: InstructorScenarioSnapshot
  /** Missing on v0.82.0 stages; absence means apply the complete snapshot. */
  apply?: DynamicScenarioApplyMask
  sourceName?: string
  /** Rule used to progress from this stage to the next. Missing means manual. */
  advanceTrigger?: DynamicScenarioTrigger
}

export interface InstructorScenarioSnapshot {
  /** Optional on older presets; missing values are treated as v1 static scenarios. */
  schemaVersion?: number
  kind?: InstructorScenarioKind
  description?: string
  mediaIds?: string[]
  stages?: DynamicScenarioStage[]
  ventilator: VentilatorSettings
  patient: PatientSettings
  alarmLimits: AlarmLimits
  patientTransitionSeconds: number
  waveformDisplay: {
    third: ScenarioWaveform
    fourth: ScenarioWaveform | null
  }
}

export interface InstructorPresetRow {
  id: string
  instructor_id: string
  name: string
  scenario: InstructorScenarioSnapshot
  created_at: string
  updated_at: string
}

export function createFullDynamicStageApplyMask(snapshot: InstructorScenarioSnapshot): DynamicScenarioApplyMask {
  return {
    ventilator: Object.keys(snapshot.ventilator) as Array<keyof VentilatorSettings>,
    patient: Object.keys(snapshot.patient) as Array<keyof PatientSettings>,
    alarmLimits: Object.keys(snapshot.alarmLimits) as Array<keyof AlarmLimits>,
    patientTransitionSeconds: true,
    waveformDisplay: true,
    mediaIds: true,
  }
}

function mergeSelected<T extends object>(current: T, source: T, keys: Array<keyof T> | undefined): T {
  if (keys === undefined) return { ...source }
  const next = { ...current } as Record<string, unknown>
  const sourceRecord = source as Record<string, unknown>
  for (const key of keys) next[String(key)] = sourceRecord[String(key)]
  return next as T
}

export function applyDynamicStage(current: InstructorScenarioSnapshot, stage: DynamicScenarioStage): InstructorScenarioSnapshot {
  const mask = stage.apply
  return {
    ...current,
    schemaVersion: 2,
    kind: 'static',
    description: '',
    stages: undefined,
    ventilator: mergeSelected(current.ventilator, stage.snapshot.ventilator, mask ? mask.ventilator : undefined),
    patient: mergeSelected(current.patient, stage.snapshot.patient, mask ? mask.patient : undefined),
    alarmLimits: mergeSelected(current.alarmLimits, stage.snapshot.alarmLimits, mask ? mask.alarmLimits : undefined),
    patientTransitionSeconds: mask ? (mask.patientTransitionSeconds ? stage.snapshot.patientTransitionSeconds : current.patientTransitionSeconds) : stage.snapshot.patientTransitionSeconds,
    waveformDisplay: mask ? (mask.waveformDisplay ? { ...stage.snapshot.waveformDisplay } : { ...current.waveformDisplay }) : { ...stage.snapshot.waveformDisplay },
    mediaIds: mask ? (mask.mediaIds ? [...(stage.snapshot.mediaIds ?? [])] : [...(current.mediaIds ?? [])]) : [...(stage.snapshot.mediaIds ?? [])],
  }
}

export function asDynamicScenario(
  current: InstructorScenarioSnapshot,
  description = current.description ?? '',
  apply = createFullDynamicStageApplyMask(current),
  sourceName = 'Current simulator state',
): InstructorScenarioSnapshot {
  const firstStageSnapshot = asStaticScenario(current, '')
  return {
    ...firstStageSnapshot,
    schemaVersion: 3,
    kind: 'dynamic',
    description: description.trim(),
    stages: [{ name: 'Stage 1', snapshot: firstStageSnapshot, apply, sourceName, advanceTrigger: { type: 'manual' } }],
  }
}

export function asStaticScenario(
  scenario: InstructorScenarioSnapshot,
  description = scenario.description ?? '',
): InstructorScenarioSnapshot {
  return {
    ...scenario,
    schemaVersion: 2,
    kind: 'static',
    description: description.trim(),
    mediaIds: [...new Set((scenario.mediaIds ?? []).filter((id) => typeof id === 'string' && id.length > 0))],
  }
}

function normaliseScenario(scenario: InstructorScenarioSnapshot): InstructorScenarioSnapshot {
  return {
    ...scenario,
    schemaVersion: scenario.schemaVersion ?? 1,
    kind: scenario.kind ?? 'static',
    description: scenario.description ?? '',
    mediaIds: [...new Set((scenario.mediaIds ?? []).filter((id) => typeof id === 'string' && id.length > 0))],
    stages: scenario.kind === 'dynamic' ? (scenario.stages ?? []).map((stage, index) => ({
      name: stage.name || `Stage ${index + 1}`,
      snapshot: { ...stage.snapshot, kind: 'static', stages: undefined },
      apply: stage.apply,
      sourceName: stage.sourceName,
      advanceTrigger: stage.advanceTrigger ?? { type: 'manual' },
    })) : undefined,
  }
}

function normalisePreset(row: InstructorPresetRow): InstructorPresetRow {
  return { ...row, scenario: normaliseScenario(row.scenario) }
}

export function isPermanentInstructor(user: User | null | undefined): user is User {
  if (!user) return false
  const anonymous = Boolean((user as User & { is_anonymous?: boolean }).is_anonymous)
  return !anonymous && Boolean(user.email)
}

export async function getInstructorAccount(): Promise<User | null> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  if (!sessionData.session) return null
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  return isPermanentInstructor(data.user) ? data.user : null
}

export function subscribeToInstructorAccount(onChange: (user: User | null) => void) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    onChange(isPermanentInstructor(session?.user) ? session!.user : null)
  })
  return () => data.subscription.unsubscribe()
}

export async function signInInstructor(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  })
  if (error) throw error
  if (!isPermanentInstructor(data.user)) throw new Error('A permanent instructor account was not returned.')
  return data.user
}

export async function createInstructorAccount(email: string, password: string) {
  const { data: current } = await supabase.auth.getUser()
  if (current.user && !isPermanentInstructor(current.user)) {
    // EDUVENT creates anonymous identities for teaching rooms. Account creation
    // is a deliberate switch to a permanent instructor identity.
    await supabase.auth.signOut()
  }

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      emailRedirectTo: window.location.origin,
    },
  })
  if (error) throw error
  return {
    user: isPermanentInstructor(data.user) ? data.user : null,
    confirmationRequired: data.session == null,
  }
}

export async function signOutInstructor() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

async function requirePermanentInstructor() {
  const user = await getInstructorAccount()
  if (!user) throw new Error('Sign in to an instructor account first.')
  return user
}

export async function listInstructorPresets(): Promise<InstructorPresetRow[]> {
  const user = await requirePermanentInstructor()
  const { data, error } = await supabase
    .from('instructor_presets')
    .select('*')
    .eq('instructor_id', user.id)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as InstructorPresetRow[]).map(normalisePreset)
}

export async function createInstructorPreset(name: string, scenario: InstructorScenarioSnapshot) {
  const user = await requirePermanentInstructor()
  const cleanName = name.trim()
  if (!cleanName) throw new Error('Enter a scenario name.')
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('instructor_presets')
    .insert({
      instructor_id: user.id,
      name: cleanName,
      scenario: normaliseScenario(scenario),
      updated_at: now,
    })
    .select('*')
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('You already have a scenario with that name.')
    throw error
  }
  return normalisePreset(data as InstructorPresetRow)
}

export async function updateInstructorPreset(
  id: string,
  updates: { name?: string; scenario?: InstructorScenarioSnapshot },
) {
  const user = await requirePermanentInstructor()
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (updates.name !== undefined) {
    const cleanName = updates.name.trim()
    if (!cleanName) throw new Error('Enter a scenario name.')
    payload.name = cleanName
  }
  if (updates.scenario !== undefined) payload.scenario = normaliseScenario(updates.scenario)

  const { data, error } = await supabase
    .from('instructor_presets')
    .update(payload)
    .eq('id', id)
    .eq('instructor_id', user.id)
    .select('*')
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('You already have a scenario with that name.')
    throw error
  }
  return normalisePreset(data as InstructorPresetRow)
}

export async function deleteInstructorPreset(id: string) {
  const user = await requirePermanentInstructor()
  const { error } = await supabase
    .from('instructor_presets')
    .delete()
    .eq('id', id)
    .eq('instructor_id', user.id)
  if (error) throw error
}
