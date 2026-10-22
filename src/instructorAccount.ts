import type { AlarmLimits } from './alarmTypes'
import type { PatientSettings, VentilatorSettings } from './simulation/types'
import { calculatePredictedBodyWeight } from './patientMetrics'
import { createBranchId, createStageId } from './scenario-builder/ids'
import type { ScenarioProductId } from './teaching/scenario/products'
import { createScenarioRepository } from './teaching/scenario/ScenarioRepository'

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
  | { type: 'media-ended' }
  | { type: 'media-acknowledged' }

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

/**
 * Compatibility exports. Instructor identity is owned by EDUSIM teaching core.
 */
export {
  isPermanentInstructor,
  getInstructorAccount,
  subscribeToInstructorAccount,
  signInInstructor,
  createInstructorAccount,
  signOutInstructor,
} from './teaching/account/InstructorAccountService'

function legacyScenarioRepository(product: ScenarioProductId) {
  return createScenarioRepository<InstructorScenarioSnapshot>(product, product === 'eduvent' ? {
    encode: normaliseScenario,
    decode: (scenario) => normaliseScenario(scenario as InstructorScenarioSnapshot),
  } : {})
}

/** @deprecated Use createScenarioRepository/useProductScenarioLibrary. */
export async function listInstructorPresets(product: ScenarioProductId = 'eduvent'): Promise<InstructorPresetRow[]> {
  const rows = await legacyScenarioRepository(product).list()
  return rows as InstructorPresetRow[]
}

/** @deprecated Use createScenarioRepository/useProductScenarioLibrary. */
export async function createInstructorPreset(name: string, scenario: InstructorScenarioSnapshot, product: ScenarioProductId = 'eduvent') {
  return legacyScenarioRepository(product).create(name, scenario) as Promise<InstructorPresetRow>
}

/** @deprecated Use createScenarioRepository/useProductScenarioLibrary. */
export async function updateInstructorPreset(
  id: string,
  updates: { name?: string; scenario?: InstructorScenarioSnapshot },
  product: ScenarioProductId = 'eduvent',
) {
  return legacyScenarioRepository(product).update(id, updates) as Promise<InstructorPresetRow>
}

/** @deprecated Use createScenarioRepository/useProductScenarioLibrary. */
export async function deleteInstructorPreset(id: string, product: ScenarioProductId = 'eduvent') {
  return legacyScenarioRepository(product).remove(id)
}
