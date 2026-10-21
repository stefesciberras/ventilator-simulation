import type { User } from '@supabase/supabase-js'
import type { AlarmLimits } from './alarmTypes'
import type { PatientSettings, VentilatorSettings } from './simulation/types'
import { calculatePredictedBodyWeight } from './patientMetrics'
import { supabase } from './session/supabase'
import { createBranchId, createStageId } from './scenario-builder/ids'
import type { ScenarioProductId } from './teaching/scenario/products'

export type ScenarioWaveform = 'volume' | 'co2' | 'oesophagealPressure'
export type InstructorScenarioKind = 'static' | 'dynamic'

export type DynamicScenarioMetric =
  | 'peakPressure' | 'plateauPressure' | 'meanPressure' | 'totalPeep' | 'autoPeep'
  | 'expiredTidalVolume' | 'totalRespiratoryRate' | 'actualMinuteVentilation'
  | 'alveolarMinuteVentilation' | 'endTidalCO2' | 'oxygenSaturation' | 'drivingPressure'

export type DynamicScenarioActor = 'candidate' | 'instructor' | 'either'

export type DynamicScenarioActionId =
  | 'freeze-waveform'
  | 'inspiratory-hold'
  | 'expiratory-hold'
  | 'oxygen-flush'
  | 'nebulisation'

export type DynamicScenarioTrigger =
  | { type: 'manual' }
  | { type: 'time'; seconds: number }
  | { type: 'condition'; metric: DynamicScenarioMetric; operator: 'lt' | 'eq' | 'gt'; value: number }
  | { type: 'action'; parameter: keyof VentilatorSettings; actor: DynamicScenarioActor }
  | { type: 'patient-change'; parameter: keyof PatientSettings; actor: DynamicScenarioActor }
  | { type: 'device-action'; action: DynamicScenarioActionId; actor: DynamicScenarioActor }
  | { type: 'question-any' }
  | { type: 'question-correct' }

export type DynamicScenarioStageType = 'controls' | 'media' | 'question'

export type DynamicScenarioTransition =
  | { mode: 'immediate' }
  | { mode: 'linear'; durationSeconds: number }

export interface DynamicScenarioTransitionOverrides {
  ventilator?: Partial<Record<keyof VentilatorSettings, DynamicScenarioTransition>>
  patient?: Partial<Record<keyof PatientSettings, DynamicScenarioTransition>>
}

export interface DynamicScenarioStageMedia {
  mediaId: string
  title: string
  mediaKind: 'image' | 'video'
  storagePath: string
  mimeType: string
}

export interface DynamicScenarioStageQuestionOption { id: string; text: string }

export interface DynamicScenarioStageQuestion {
  libraryItemId?: string
  kind: 'mcq' | 'poll'
  title: string | null
  body: string
  options: DynamicScenarioStageQuestionOption[]
  correctOptionId: string | null
  explanation: string | null
}

export interface DynamicScenarioApplyMask {
  ventilator: Array<keyof VentilatorSettings>
  patient: Array<keyof PatientSettings>
  alarmLimits: Array<keyof AlarmLimits>
  patientTransitionSeconds: boolean
  waveformDisplay: boolean
  mediaIds: boolean
}

export interface DynamicScenarioStage {
  id?: string
  name: string
  /** Instructor-facing explanation of what should happen during this stage. */
  comment?: string
  /** v6 content model. Older stages default to controls. */
  stageType?: DynamicScenarioStageType
  media?: DynamicScenarioStageMedia
  question?: DynamicScenarioStageQuestion
  /** Default transition inherited by numeric controls in this stage. */
  transition?: DynamicScenarioTransition
  /** Optional per-variable overrides. Discrete values always apply immediately. */
  transitionOverrides?: DynamicScenarioTransitionOverrides
  snapshot: InstructorScenarioSnapshot
  /** Missing on v0.82.0 stages; absence means apply the complete snapshot. */
  apply?: DynamicScenarioApplyMask
  sourceName?: string
  /** Legacy single trigger, retained for backwards compatibility. */
  advanceTrigger?: DynamicScenarioTrigger
  /** v4 trigger list. Any configured trigger may advance the stage (OR semantics). */
  advanceTriggers?: DynamicScenarioTrigger[]
}

export type DynamicScenarioTriggerMode = 'any' | 'all'

export interface DynamicScenarioBranch {
  id: string
  fromStageId: string
  toStageId: string
  /** Legacy single trigger retained for schema <= 8 compatibility. */
  trigger: DynamicScenarioTrigger
  /** Schema v9 path conditions. */
  triggers?: DynamicScenarioTrigger[]
  triggerMode?: DynamicScenarioTriggerMode
  priority: number
  label?: string
  enabled?: boolean
}

export function dynamicBranchTriggers(branch: DynamicScenarioBranch): DynamicScenarioTrigger[] {
  if (branch.triggers?.length) return branch.triggers
  return [branch.trigger ?? { type: 'manual' }]
}

export function dynamicBranchTriggerMode(branch: DynamicScenarioBranch): DynamicScenarioTriggerMode {
  return branch.triggerMode === 'all' ? 'all' : 'any'
}


export function dynamicStageTriggers(stage: DynamicScenarioStage): DynamicScenarioTrigger[] {
  const fallback: DynamicScenarioTrigger = (stage.stageType ?? 'controls') === 'question' ? { type: 'question-any' } : { type: 'manual' }
  const configured = stage.advanceTriggers?.length
    ? stage.advanceTriggers
    : [stage.advanceTrigger ?? fallback]
  const seen = new Set<DynamicScenarioTrigger['type']>()
  const deduplicated = configured.filter((trigger) => {
    if (seen.has(trigger.type)) return false
    seen.add(trigger.type)
    return true
  })
  return deduplicated.length ? deduplicated : [fallback]
}

export interface InstructorScenarioSnapshot {
  /** Optional on older presets; missing values are treated as v1 static scenarios. */
  schemaVersion?: number
  kind?: InstructorScenarioKind
  description?: string
  mediaIds?: string[]
  stages?: DynamicScenarioStage[]
  branches?: DynamicScenarioBranch[]
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
  product?: ScenarioProductId
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
  if ((stage.stageType ?? 'controls') !== 'controls') {
    return { ...current, schemaVersion: 2, kind: 'static', description: '', stages: undefined }
  }
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
    schemaVersion: 9,
    kind: 'dynamic',
    description: description.trim(),
    stages: [{ id: createStageId(), name: 'Stage 1', comment: '', stageType: 'controls', transition: { mode: 'immediate' }, transitionOverrides: {}, snapshot: firstStageSnapshot, apply, sourceName, advanceTrigger: { type: 'manual' }, advanceTriggers: [{ type: 'manual' }] }],
    branches: [],
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

function normalisePatientSettings(patient: PatientSettings): PatientSettings {
  const chestWallCompliance = Number.isFinite(patient.chestWallCompliance ?? Number.NaN)
    ? patient.chestWallCompliance
    : Math.round(calculatePredictedBodyWeight(patient.sex ?? 'male', patient.heightCm ?? 170) * 3)
  return { ...patient, chestWallCompliance }
}

function normaliseScenario(scenario: InstructorScenarioSnapshot): InstructorScenarioSnapshot {
  return {
    ...scenario,
    schemaVersion: scenario.schemaVersion ?? 1,
    kind: scenario.kind ?? 'static',
    description: scenario.description ?? '',
    mediaIds: [...new Set((scenario.mediaIds ?? []).filter((id) => typeof id === 'string' && id.length > 0))],
    patient: normalisePatientSettings(scenario.patient),
    stages: scenario.kind === 'dynamic' ? (scenario.stages ?? []).map((stage, index) => {
      const triggers = dynamicStageTriggers(stage)
      return {
        id: stage.id ?? createStageId(),
        name: stage.name || `Stage ${index + 1}`,
        comment: stage.comment ?? '',
        stageType: stage.stageType ?? 'controls',
        media: stage.media,
        question: stage.question,
        transition: stage.transition ?? { mode: 'immediate' },
        transitionOverrides: stage.transitionOverrides ?? {},
        snapshot: { ...stage.snapshot, patient: normalisePatientSettings(stage.snapshot.patient), kind: 'static', stages: undefined },
        apply: stage.apply,
        sourceName: stage.sourceName,
        advanceTrigger: triggers[0],
        advanceTriggers: triggers,
      }
    }) : undefined,
    branches: scenario.kind === 'dynamic' ? (scenario.branches ?? []).map((branch, index) => {
      const triggers = dynamicBranchTriggers(branch)
      return {
        ...branch,
        id: branch.id || createBranchId(),
        trigger: triggers[0],
        triggers,
        triggerMode: dynamicBranchTriggerMode(branch),
        priority: Number.isFinite(branch.priority) ? branch.priority : index,
        enabled: branch.enabled !== false,
      }
    }) : undefined,
  }
}

function normalisePreset(row: InstructorPresetRow): InstructorPresetRow {
  return { ...row, product: row.product ?? 'eduvent', scenario: normaliseScenario(row.scenario) }
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

export async function listInstructorPresets(product: ScenarioProductId = 'eduvent'): Promise<InstructorPresetRow[]> {
  const user = await requirePermanentInstructor()
  const { data, error } = await supabase
    .from('instructor_presets')
    .select('*')
    .eq('instructor_id', user.id)
    .eq('product', product)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as InstructorPresetRow[]).map(normalisePreset)
}

export async function createInstructorPreset(name: string, scenario: InstructorScenarioSnapshot, product: ScenarioProductId = 'eduvent') {
  const user = await requirePermanentInstructor()
  const cleanName = name.trim()
  if (!cleanName) throw new Error('Enter a scenario name.')
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('instructor_presets')
    .insert({
      instructor_id: user.id,
      product,
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
  product: ScenarioProductId = 'eduvent',
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
    .eq('product', product)
    .select('*')
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('You already have a scenario with that name.')
    throw error
  }
  return normalisePreset(data as InstructorPresetRow)
}

export async function deleteInstructorPreset(id: string, product: ScenarioProductId = 'eduvent') {
  const user = await requirePermanentInstructor()
  const { error } = await supabase
    .from('instructor_presets')
    .delete()
    .eq('id', id)
    .eq('instructor_id', user.id)
    .eq('product', product)
  if (error) throw error
}
