import { useEffect, useMemo, useRef, useState } from 'react'
import type { PatientSettings, VentilatorMode, VentilatorSettings } from '../simulation/types'
import { calculatePredictedBodyWeight } from '../patientMetrics'
import { ARDS_PROFILES, ARDS_SEVERITIES, PATIENT_PROFILES, PATIENT_PROFILE_NAMES, patientMatchesProfile, type ArdsSeverity, type PatientProfileName } from '../patientProfiles'
import {
  asStaticScenario,
  createInstructorPreset,
  deleteInstructorPreset,
  dynamicBranchTriggers,
  dynamicBranchTriggerMode,
  dynamicStageTriggers,
  updateInstructorPreset,
  type DynamicScenarioApplyMask,
  type DynamicScenarioBranch,
  type DynamicScenarioMetric,
  type DynamicScenarioStage,
  type DynamicScenarioStageType,
  type DynamicScenarioTransition,
  type DynamicScenarioTrigger,
  type InstructorPresetRow,
  type InstructorScenarioSnapshot,
} from '../instructorAccount'
import { SCENARIO_BUILDER_VERSION } from '../scenario-builder/version'
import { createBranchId, createStageId } from '../scenario-builder/ids'
import { createSelfDirectedAssignment, selfDirectedAssignmentUrl, type SelfDirectedAssignmentCreated } from '../selfDirectedAssignments'
import { listInstructorCaseMedia, type CaseMediaRow } from '../caseMedia'
import { listTeachingLibraryItems } from '../teaching/repository'
import type { TeachingLibraryItem } from '../teaching/types'
import './DynamicScenarioBuilder.css'

interface DynamicScenarioBuilderProps {
  currentScenario: InstructorScenarioSnapshot
  dynamicPresets: InstructorPresetRow[]
  staticPresets: InstructorPresetRow[]
  simulationPaused: boolean
  onSimulationPausedChange: (paused: boolean) => void
  onRefresh: () => Promise<void>
  onStartScenario: (preset: InstructorPresetRow) => void
  onClose: () => void
}

type StageDraft = DynamicScenarioStage & { sourcePresetId?: string; patientProfile?: PatientProfileName; ardsSeverity?: ArdsSeverity }
interface ScenarioDraft { id: string | null; name: string; description: string; stages: StageDraft[]; branches: DynamicScenarioBranch[] }
interface FieldSpec {
  key: string
  label: string
  type?: 'number' | 'boolean' | 'select'
  step?: number
  min?: number
  max?: number
  unit?: string
  options?: Array<{ value: string; label: string }>
  format?: (value: unknown) => string
  defaultValue?: unknown
}

const MODES: VentilatorMode[] = ['VC-AC', 'SIMV-VC', 'PC-AC', 'SIMV-PC', 'BIPAP', 'VG-PC', 'APRV', 'PSV']

const CONDITION_METRICS: Array<{ value: DynamicScenarioMetric; label: string; unit: string }> = [
  { value: 'peakPressure', label: 'Peak pressure', unit: 'cmH₂O' },
  { value: 'plateauPressure', label: 'Plateau pressure', unit: 'cmH₂O' },
  { value: 'meanPressure', label: 'Mean airway pressure', unit: 'cmH₂O' },
  { value: 'totalPeep', label: 'Total PEEP', unit: 'cmH₂O' },
  { value: 'autoPeep', label: 'AutoPEEP', unit: 'cmH₂O' },
  { value: 'drivingPressure', label: 'Driving pressure', unit: 'cmH₂O' },
  { value: 'expiredTidalVolume', label: 'Expired tidal volume', unit: 'mL' },
  { value: 'totalRespiratoryRate', label: 'Respiratory rate', unit: '/min' },
  { value: 'actualMinuteVentilation', label: 'Minute ventilation', unit: 'L/min' },
  { value: 'alveolarMinuteVentilation', label: 'Alveolar minute ventilation', unit: 'L/min' },
  { value: 'endTidalCO2', label: 'EtCO₂', unit: 'mmHg' },
  { value: 'oxygenSaturation', label: 'SpO₂', unit: '%' },
]

const defaultAdvanceTrigger = (): DynamicScenarioTrigger => ({ type: 'manual' })
const immediateTransition = (): DynamicScenarioTransition => ({ mode: 'immediate' })
const linearTransition = (durationSeconds = 60): DynamicScenarioTransition => ({ mode: 'linear', durationSeconds })
const SCENARIO_FILE_SCHEMA = 'eduvent-scenario-file-v1'

interface PortableScenarioFile {
  fileSchema: typeof SCENARIO_FILE_SCHEMA
  exportedAt: string
  scenarioBuilderVersion: string
  name: string
  scenario: InstructorScenarioSnapshot
}

function defaultTriggerForType(type: DynamicScenarioTrigger['type']): DynamicScenarioTrigger {
  if (type === 'manual') return { type: 'manual' }
  if (type === 'time') return { type: 'time', seconds: 30 }
  if (type === 'condition') return { type: 'condition', metric: 'oxygenSaturation', operator: 'lt', value: 90 }
  if (type === 'question-any') return { type: 'question-any' }
  if (type === 'question-correct') return { type: 'question-correct' }
  if (type === 'media-ended') return { type: 'media-ended' }
  if (type === 'media-acknowledged') return { type: 'media-acknowledged' }
  if (type === 'patient-change') return { type: 'patient-change', parameter: 'compliance', actor: 'either' }
  if (type === 'device-action') return { type: 'device-action', action: 'freeze-waveform', actor: 'either' }
  return { type: 'action', parameter: 'fio2', actor: 'either' }
}

function singleTriggerSummary(value: DynamicScenarioTrigger) {
  if (value.type === 'manual') return 'Manual'
  if (value.type === 'time') return `After ${value.seconds}s in stage`
  if (value.type === 'question-any') return 'Any answer submitted'
  if (value.type === 'question-correct') return 'Correct answer submitted'
  if (value.type === 'media-ended') return 'Video finished'
  if (value.type === 'media-acknowledged') return 'Media acknowledged'
  if (value.type === 'condition') {
    const metric = CONDITION_METRICS.find((item) => item.value === value.metric)
    const operator = value.operator === 'lt' ? '<' : value.operator === 'gt' ? '>' : '='
    return `${metric?.label ?? value.metric} ${operator} ${value.value}${metric?.unit ? ` ${metric.unit}` : ''}`
  }
  const actor = value.actor === 'either' ? 'candidate or instructor' : value.actor
  if (value.type === 'action') {
    const field = VENT_FIELDS.find((item) => item.key === value.parameter)
    return `${field?.label ?? String(value.parameter)} changed by ${actor}`
  }
  if (value.type === 'patient-change') {
    const field = [...PATIENT_FIELDS, ...PHYSIO_FIELDS].find((item) => item.key === value.parameter)
    return `${field?.label ?? String(value.parameter)} changed by ${actor}`
  }
  const labels: Record<string, string> = { 'freeze-waveform': 'Freeze waveform', 'inspiratory-hold': 'Inspiratory hold', 'expiratory-hold': 'Expiratory hold', 'oxygen-flush': 'Oxygen flush', nebulisation: 'Nebulisation' }
  return `${labels[value.action] ?? value.action} by ${actor}`
}

function ImportScenarioIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h10m0 0-3.5-3.5M14 12l-3.5 3.5M17 5h3v14h-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
function DownloadScenarioIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 20h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
function safeScenarioFilename(name: string) {
  const safe = name.trim().replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'scenario'
  return `${safe}.eduvent-scenario.json`
}
function uniqueImportedName(name: string, presets: InstructorPresetRow[]) {
  const base = name.trim() || 'Imported scenario'
  const names = new Set(presets.map((preset) => preset.name.toLocaleLowerCase()))
  if (!names.has(base.toLocaleLowerCase())) return base
  let suffix = 1
  let candidate = `${base} (imported)`
  while (names.has(candidate.toLocaleLowerCase())) { suffix += 1; candidate = `${base} (imported ${suffix})` }
  return candidate
}

const VENT_FIELDS: FieldSpec[] = [
  { key: 'mode', label: 'Mode', type: 'select', options: MODES.map((value) => ({ value, label: value })) },
  { key: 'fio2', label: 'FiO₂', step: .01, min: .21, max: 1, format: (v) => `${Math.round(Number(v) * 100)}%` },
  { key: 'peep', label: 'PEEP', min: 0, max: 20, unit: ' cmH₂O' },
  { key: 'rate', label: 'Set RR', min: 5, max: 40, unit: '/min' },
  { key: 'tidalVolume', label: 'Tidal volume', step: 10, min: 250, max: 800, unit: ' mL' },
  { key: 'inspiratoryTime', label: 'Tinsp', step: .05, min: .2, max: 5, unit: ' s' },
  { key: 'inspiratoryFlow', label: 'Inspiratory flow', min: 10, max: 140, unit: ' L/min' },
  { key: 'plateauPercent', label: 'Plateau time', min: 0, max: 20, unit: '% Ti' },
  { key: 'pressureControl', label: 'Pressure control', min: 5, max: 30, unit: ' cmH₂O' },
  { key: 'volumeGuaranteePressureLimit', label: 'AutoFlow Pmax', min: 20, max: 60, unit: ' cmH₂O' },
  { key: 'pressureSupport', label: 'Pressure support', min: 0, max: 25, unit: ' cmH₂O' },
  { key: 'triggerType', label: 'Trigger type', type: 'select', options: [{ value: 'pressure', label: 'Pressure' }, { value: 'flow', label: 'Flow' }] },
  { key: 'triggerSensitivity', label: 'Pressure trigger', step: .5, min: .5, max: 8, unit: ' cmH₂O below PEEP' },
  { key: 'flowTriggerSensitivity', label: 'Flow trigger', step: .5, min: .5, max: 10, unit: ' L/min' },
  { key: 'terminationSensitivity', label: 'Expiratory trigger (ETS)', step: 5, min: 5, max: 80, unit: '% peak flow' },
  { key: 'simvSyncWindowPercent', label: 'Threshold window', step: 5, min: 5, max: 75, unit: '% cycle' },
  { key: 'showSimvSyncWindow', label: 'Show SIMV sync window', type: 'boolean' },
  { key: 'pHigh', label: 'Phigh', min: 10, max: 40, unit: ' cmH₂O' },
  { key: 'pLow', label: 'Plow', min: 0, max: 15, unit: ' cmH₂O' },
  { key: 'tHigh', label: 'Thigh', step: .1, min: .5, max: 10, unit: ' s' },
  { key: 'tLow', label: 'Tlow', step: .05, min: .2, max: 2, unit: ' s' },
]

const PATIENT_FIELDS: FieldSpec[] = [
  { key: 'spontaneousRate', label: 'Spontaneous RR', min: 0, max: 35, unit: '/min' },
  { key: 'compliance', label: 'Compliance', min: 15, max: 100, unit: ' mL/cmH₂O' },
  { key: 'chestWallCompliance', label: 'Chest wall compliance', step: 5, min: 40, max: 400, unit: ' mL/cmH₂O' },
  { key: 'resistance', label: 'Airway resistance', min: 3, max: 40, unit: ' cmH₂O/L/s' },
  { key: 'expiratoryResistance', label: 'Expiratory resistance', min: 3, max: 50, unit: ' cmH₂O/L/s' },
  { key: 'expiratoryFlowLimitation', label: 'Expiratory flow limitation', step: .05, min: 0, max: 1, format: (v) => `${Math.round(Number(v) * 100)}%` },
  { key: 'effort', label: 'Inspiratory effort', min: 0, max: 20, unit: ' cmH₂O' },
  { key: 'neuralInspiratoryTime', label: 'Neural inspiratory time', step: .1, min: .3, max: 3, unit: ' s' },
  { key: 'effortRisePercent', label: 'Effort rise', step: 5, min: 5, max: 95, unit: '%' },
  { key: 'effortRelaxationPercent', label: 'Effort relaxation', step: 5, min: 5, max: 95, unit: '%' },
  { key: 'endExpiratoryOesophagealPressure', label: 'End-expiratory Pes', step: .5, min: -15, max: 15, unit: ' cmH₂O' },
]

const PHYSIO_FIELDS: FieldSpec[] = [
  { key: 'sex', label: 'Sex', type: 'select', options: [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }] },
  { key: 'heightCm', label: 'Height', min: 90, max: 210, unit: ' cm' },
  { key: 'oxygenConsumption', label: 'Oxygen consumption (VO₂)', step: 10, min: 100, max: 600, unit: ' mL/min' },
  { key: 'frc', label: 'FRC', step: 10, min: 500, max: 5000, unit: ' mL' },
  { key: 'shuntFraction', label: 'Shunt', step: .01, min: 0, max: .5, format: (v) => `${Math.round(Number(v) * 100)}%` },
  { key: 'maxSpO2', label: 'Maximum SpO₂', min: 80, max: 100, unit: '%', defaultValue: 100 },
  { key: 'co2Production', label: 'VCO₂ production', step: 10, min: 100, max: 500, unit: ' mL/min' },
  { key: 'vdVt', label: 'Vd/Vt', step: .05, min: .1, max: .9, format: (v) => Number(v).toFixed(2), defaultValue: .4 },
]

const FIELD_BY_KEY = new Map(VENT_FIELDS.map((field) => [field.key, field]))
const PATIENT_KEYS = [...PATIENT_FIELDS, ...PHYSIO_FIELDS].map((field) => field.key as keyof PatientSettings)

const isSimv = (mode: VentilatorMode) => mode === 'SIMV-VC' || mode === 'SIMV-PC'
const isVolumeMandatory = (mode: VentilatorMode) => mode === 'VC-AC' || mode === 'SIMV-VC'
const isPressureMandatory = (mode: VentilatorMode) => mode === 'PC-AC' || mode === 'SIMV-PC'

function ventKeysFor(settings: VentilatorSettings): Array<keyof VentilatorSettings> {
  const mode = settings.mode
  const triggerKey: keyof VentilatorSettings = settings.triggerType === 'flow' ? 'flowTriggerSensitivity' : 'triggerSensitivity'
  const common: Array<keyof VentilatorSettings> = ['mode', 'fio2']

  if (mode === 'APRV') return [...common, 'pHigh', 'pLow', 'tHigh', 'tLow']
  if (mode === 'BIPAP') return [...common, 'pressureControl', 'peep', 'rate', 'inspiratoryTime', 'triggerType', triggerKey]
  if (mode === 'PSV') return [...common, 'peep', 'pressureSupport', 'terminationSensitivity', 'triggerType', triggerKey]

  const keys: Array<keyof VentilatorSettings> = [...common, 'peep', 'rate']
  if (isVolumeMandatory(mode) || mode === 'VG-PC') keys.push('tidalVolume')
  keys.push('inspiratoryTime')
  if (isVolumeMandatory(mode)) keys.push('inspiratoryFlow', 'plateauPercent')
  if (isPressureMandatory(mode)) keys.push('pressureControl')
  if (mode === 'VG-PC') keys.push('volumeGuaranteePressureLimit')
  if (isSimv(mode)) keys.push('simvSyncWindowPercent', 'showSimvSyncWindow', 'pressureSupport', 'terminationSensitivity')
  keys.push('triggerType', triggerKey)
  return keys
}

function cloneScenario<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function normalisePhysiologyDefaults(snapshot: InstructorScenarioSnapshot): InstructorScenarioSnapshot {
  const patient = { ...snapshot.patient }
  if (!Number.isFinite(patient.maxSpO2 ?? Number.NaN)) patient.maxSpO2 = 100
  if (!Number.isFinite(patient.vdVt ?? Number.NaN)) patient.vdVt = 0.4
  if (!Number.isFinite(patient.chestWallCompliance ?? Number.NaN)) {
    patient.chestWallCompliance = Math.round(calculatePredictedBodyWeight(patient.sex ?? 'male', patient.heightCm ?? 170) * 3)
  }
  return { ...snapshot, patient }
}

function resolvedFieldValue(field: FieldSpec, value: unknown): unknown {
  if (field.type === 'select' || field.type === 'boolean') return value ?? field.defaultValue
  const numeric = Number(value)
  if (Number.isFinite(numeric)) return numeric
  return field.defaultValue ?? field.min ?? 0
}

function inferPatientTemplate(patient: PatientSettings): { profile: PatientProfileName; ardsSeverity?: ArdsSeverity } | null {
  for (const severity of ARDS_SEVERITIES) {
    if (patientMatchesProfile(patient, ARDS_PROFILES[severity])) return { profile: 'ARDS', ardsSeverity: severity }
  }
  for (const profile of PATIENT_PROFILE_NAMES) {
    if (profile === 'ARDS') continue
    if (patientMatchesProfile(patient, PATIENT_PROFILES[profile])) return { profile }
  }
  return null
}

function selectedPatientTemplate(stage: StageDraft): { profile: PatientProfileName; ardsSeverity?: ArdsSeverity } | null {
  if (stage.patientProfile) return { profile: stage.patientProfile, ardsSeverity: stage.ardsSeverity }
  return inferPatientTemplate(stage.snapshot.patient)
}

function defaultMask(snapshot: InstructorScenarioSnapshot): DynamicScenarioApplyMask {
  return {
    ventilator: ventKeysFor(snapshot.ventilator),
    patient: [...PATIENT_KEYS],
    alarmLimits: [],
    patientTransitionSeconds: false,
    waveformDisplay: false,
    mediaIds: false,
  }
}

function normaliseStage(stage: DynamicScenarioStage, index: number): StageDraft {
  const snapshot = normalisePhysiologyDefaults(cloneScenario(stage.snapshot))
  const relevant = new Set(ventKeysFor(snapshot.ventilator).map(String))
  const supplied = stage.apply?.ventilator?.map(String)
  const ventilator = supplied
    ? supplied.filter((key) => relevant.has(key)) as Array<keyof VentilatorSettings>
    : ventKeysFor(snapshot.ventilator)

  const cloned = cloneScenario(stage) as StageDraft
  const inferredTemplate = selectedPatientTemplate({ ...cloned, snapshot })
  return {
    ...cloned,
    id: stage.id ?? createStageId(),
    name: stage.name || `Stage ${index + 1}`,
    stageType: stage.stageType ?? 'controls',
    patientProfile: cloned.patientProfile ?? inferredTemplate?.profile,
    ardsSeverity: cloned.ardsSeverity ?? inferredTemplate?.ardsSeverity,
    advanceTrigger: dynamicStageTriggers(stage)[0],
    advanceTriggers: dynamicStageTriggers(stage),
    apply: {
      ...(stage.apply ?? defaultMask(snapshot)),
      ventilator,
      patient: stage.apply?.patient ?? [...PATIENT_KEYS],
    },
  }
}

function newStage(base: InstructorScenarioSnapshot, index: number): StageDraft {
  const snapshot = normalisePhysiologyDefaults(asStaticScenario(cloneScenario(base), ''))
  const inferredTemplate = inferPatientTemplate(snapshot.patient)
  return {
    id: createStageId(),
    name: `Stage ${index + 1}`,
    comment: '',
    stageType: 'controls',
    snapshot,
    patientProfile: inferredTemplate?.profile,
    ardsSeverity: inferredTemplate?.ardsSeverity,
    apply: defaultMask(snapshot),
    sourceName: 'Manual settings',
    advanceTrigger: defaultAdvanceTrigger(),
    advanceTriggers: [defaultAdvanceTrigger()],
  }
}

function newDraft(base: InstructorScenarioSnapshot): ScenarioDraft {
  return { id: null, name: 'New dynamic scenario', description: '', stages: [newStage(base, 0)], branches: [] }
}

function fromPreset(preset: InstructorPresetRow): ScenarioDraft {
  const stages = (preset.scenario.stages ?? []).map(normaliseStage)
  const branches: DynamicScenarioBranch[] = (preset.scenario.branches ?? []).map((branch, index) => {
    const triggers = dynamicBranchTriggers(branch)
    return { ...branch, id: branch.id || createBranchId(), trigger: triggers[0], triggers, triggerMode: dynamicBranchTriggerMode(branch), priority: Number.isFinite(branch.priority) ? branch.priority : index, enabled: branch.enabled !== false }
  })

  // Schema <= 8 stored ordinary next-stage progression separately from branches.
  // Convert it into an explicit path so editing immediately uses the unified graph model.
  if ((preset.scenario.schemaVersion ?? 0) < 9) {
    stages.slice(0, -1).forEach((stage, index) => {
      const next = stages[index + 1]
      if (!stage.id || !next?.id) return
      const triggers = dynamicStageTriggers(stage)
      branches.push({
        id: createBranchId(),
        fromStageId: stage.id,
        toStageId: next.id,
        trigger: triggers[0],
        triggers,
        triggerMode: 'any',
        priority: 1000 + index,
        label: 'Continue',
        enabled: true,
      })
    })
  }

  return { id: preset.id, name: preset.name, description: preset.scenario.description ?? '', stages, branches }
}

function serialise(draft: ScenarioDraft) {
  return JSON.stringify(draft)
}

function displayValue(field: FieldSpec, value: unknown) {
  const resolved = resolvedFieldValue(field, value)
  if (field.format) return field.format(resolved)
  if (field.type === 'boolean') return Boolean(resolved) ? 'On' : 'Off'
  return `${Number(resolved)}${field.unit ?? ''}`
}

function useWideScreen(minWidth = 1000) {
  const [wide, setWide] = useState(() => typeof window === 'undefined' ? true : window.matchMedia(`(min-width: ${minWidth}px)`).matches)
  useEffect(() => {
    const media = window.matchMedia(`(min-width: ${minWidth}px)`)
    const update = () => setWide(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [minWidth])
  return wide
}

export function DynamicScenarioBuilder(props: DynamicScenarioBuilderProps) {
  const {
    currentScenario,
    dynamicPresets,
    staticPresets,
    simulationPaused,
    onSimulationPausedChange,
    onRefresh,
    onStartScenario,
    onClose,
  } = props

  const wideScreen = useWideScreen()
  const previousPausedRef = useRef(simulationPaused)
  const initial = dynamicPresets[0] ? fromPreset(dynamicPresets[0]) : newDraft(currentScenario)
  const [draft, setDraft] = useState<ScenarioDraft>(initial)
  const baselineRef = useRef(serialise(initial))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [collapsedStages, setCollapsedStages] = useState<Set<number>>(() => new Set())
  const [draggedStageIndex, setDraggedStageIndex] = useState<number | null>(null)
  const [dragOverStageIndex, setDragOverStageIndex] = useState<number | null>(null)
  const scenarioImportInputRef = useRef<HTMLInputElement | null>(null)
  const [assignmentOpen, setAssignmentOpen] = useState(false)
  const [assignmentExpiryValue, setAssignmentExpiryValue] = useState(7)
  const [assignmentExpiryUnit, setAssignmentExpiryUnit] = useState<'days' | 'weeks'>('days')
  const [assignmentBusy, setAssignmentBusy] = useState(false)
  const [assignmentError, setAssignmentError] = useState<string | null>(null)
  const [assignmentResult, setAssignmentResult] = useState<SelfDirectedAssignmentCreated | null>(null)
  const [mediaLibrary, setMediaLibrary] = useState<CaseMediaRow[]>([])
  const [questionLibrary, setQuestionLibrary] = useState<TeachingLibraryItem[]>([])
  const [libraryError, setLibraryError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void Promise.all([listInstructorCaseMedia(), listTeachingLibraryItems()]).then(([media, questions]) => {
      if (cancelled) return
      setMediaLibrary(media)
      setQuestionLibrary(questions.filter((item) => item.kind === 'mcq' || item.kind === 'poll'))
      setLibraryError(null)
    }).catch((cause) => { if (!cancelled) setLibraryError(cause instanceof Error ? cause.message : 'Unable to load scenario libraries.') })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!wideScreen) return
    onSimulationPausedChange(true)
    return () => onSimulationPausedChange(previousPausedRef.current)
  }, [wideScreen, onSimulationPausedChange])

  const dirty = serialise(draft) !== baselineRef.current
  const selectedPreset = useMemo(
    () => dynamicPresets.find((preset) => preset.id === draft.id) ?? null,
    [dynamicPresets, draft.id],
  )

  const replaceDraft = (next: ScenarioDraft) => {
    setDraft(next)
    setCollapsedStages(new Set())
    baselineRef.current = serialise(next)
    setMessage(null)
  }

  const canDiscard = () => !dirty || window.confirm('Discard unsaved changes to this dynamic scenario?')

  const updateStage = (index: number, updater: (stage: StageDraft) => StageDraft) => {
    setDraft((current) => ({
      ...current,
      stages: current.stages.map((stage, i) => i === index ? updater(stage) : stage),
    }))
  }

  const selectScenario = (preset: InstructorPresetRow) => {
    if (canDiscard()) replaceDraft(fromPreset(preset))
  }

  const addScenario = () => {
    if (canDiscard()) replaceDraft(newDraft(currentScenario))
  }

  const insertStage = (index: number) => {
    setCollapsedStages(new Set())
    setDraft((current) => {
      const stages = [...current.stages]
      const from = stages[index]
      const oldNext = stages[index + 1]
      const base = from?.snapshot ?? currentScenario
      const inserted = newStage(base, index + 1)
      stages.splice(index + 1, 0, inserted)
      if (!from?.id || !inserted.id) return { ...current, stages }

      let branches = [...current.branches]
      const outgoing = branches.filter((branch) => branch.fromStageId === from.id && branch.enabled !== false)
      if (oldNext?.id && outgoing.length === 1 && outgoing[0].toStageId === oldNext.id) {
        branches = branches.map((branch) => branch.id === outgoing[0].id ? { ...branch, toStageId: inserted.id! } : branch)
        branches.push({ id: createBranchId(), fromStageId: inserted.id, toStageId: oldNext.id, trigger: { type: 'manual' }, triggers: [{ type: 'manual' }], triggerMode: 'any', priority: 0, label: 'Continue', enabled: true })
      } else {
        branches.push({ id: createBranchId(), fromStageId: from.id, toStageId: inserted.id, trigger: { type: 'manual' }, triggers: [{ type: 'manual' }], triggerMode: 'any', priority: outgoing.length, label: 'Continue', enabled: true })
        if (oldNext?.id) branches.push({ id: createBranchId(), fromStageId: inserted.id, toStageId: oldNext.id, trigger: { type: 'manual' }, triggers: [{ type: 'manual' }], triggerMode: 'any', priority: 0, label: 'Continue', enabled: true })
      }
      return { ...current, stages, branches }
    })
  }

  const moveStage = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= draft.stages.length || toIndex >= draft.stages.length) return
    setCollapsedStages(new Set())
    setDraft((current) => {
      const stages = [...current.stages]
      const [moved] = stages.splice(fromIndex, 1)
      stages.splice(toIndex, 0, moved)
      if (stages[0]) stages[0] = { ...stages[0], transition: immediateTransition() }
      return { ...current, stages }
    })
  }

  const beginStageDrag = (index: number, event: React.DragEvent<HTMLElement>) => {
    setDraggedStageIndex(index)
    setDragOverStageIndex(index)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }

  const finishStageDrag = () => {
    setDraggedStageIndex(null)
    setDragOverStageIndex(null)
  }

  const addBranch = (stageIndex: number) => {
    const from = draft.stages[stageIndex]
    if (!from?.id || draft.stages.length < 2) return
    const fallback = draft.stages[Math.min(stageIndex + 1, draft.stages.length - 1)]
    const target = fallback?.id === from.id ? draft.stages.find((stage) => stage.id !== from.id) : fallback
    if (!target?.id) return
    const trigger: DynamicScenarioTrigger = { type: 'manual' }
    setDraft((current) => ({ ...current, branches: [...current.branches, { id: createBranchId(), fromStageId: from.id!, toStageId: target.id!, trigger, triggers: [trigger], triggerMode: 'any', priority: current.branches.filter((branch) => branch.fromStageId === from.id).length, label: 'Continue', enabled: true }] }))
  }
  const updateBranch = (branchId: string, updates: Partial<DynamicScenarioBranch>) => setDraft((current) => ({ ...current, branches: current.branches.map((branch) => branch.id === branchId ? { ...branch, ...updates } : branch) }))
  const removeBranch = (branchId: string) => setDraft((current) => ({ ...current, branches: current.branches.filter((branch) => branch.id !== branchId) }))
  const setBranchTriggers = (branchId: string, triggers: DynamicScenarioTrigger[]) => {
    const next = triggers.length ? triggers : [{ type: 'manual' } as DynamicScenarioTrigger]
    updateBranch(branchId, { trigger: next[0], triggers: next })
  }
  const addBranchTrigger = (branchId: string, stageType: DynamicScenarioStage['stageType']) => {
    const branch = draft.branches.find((item) => item.id === branchId)
    if (!branch) return
    const next = (stageType ?? 'controls') === 'question' ? defaultTriggerForType('question-any') : defaultTriggerForType('condition')
    setBranchTriggers(branchId, [...dynamicBranchTriggers(branch), next])
  }
  const updateBranchTrigger = (branchId: string, triggerIndex: number, trigger: DynamicScenarioTrigger) => {
    const branch = draft.branches.find((item) => item.id === branchId)
    if (!branch) return
    setBranchTriggers(branchId, dynamicBranchTriggers(branch).map((item, index) => index === triggerIndex ? trigger : item))
  }
  const removeBranchTrigger = (branchId: string, triggerIndex: number) => {
    const branch = draft.branches.find((item) => item.id === branchId)
    if (!branch) return
    const triggers = dynamicBranchTriggers(branch)
    if (triggers.length <= 1) return
    setBranchTriggers(branchId, triggers.filter((_, index) => index !== triggerIndex))
  }

  const removeStage = (index: number) => {
    if (draft.stages.length <= 1) return
    setCollapsedStages(new Set())
    setDraft((current) => ({
      ...current,
      stages: current.stages.filter((_, i) => i !== index),
      branches: current.branches.filter((branch) => branch.fromStageId !== current.stages[index]?.id && branch.toStageId !== current.stages[index]?.id),
    }))
  }

  const toggleStageCollapsed = (index: number) => {
    setCollapsedStages((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const setStageType = (index: number, stageType: 'controls' | 'media' | 'question') => {
    updateStage(index, (stage) => stageType === 'controls'
      ? { ...stage, stageType, media: undefined, question: undefined }
      : stageType === 'media'
        ? { ...stage, stageType, question: undefined }
        : { ...stage, stageType, media: undefined })
  }

  const selectStageMedia = (index: number, mediaId: string) => {
    const media = mediaLibrary.find((item) => item.id === mediaId)
    if (!media) return
    updateStage(index, (stage) => ({ ...stage, stageType: 'media', media: { mediaId: media.id, title: media.title, mediaKind: media.media_kind, storagePath: media.storage_path, mimeType: media.mime_type } }))
  }

  const selectStageQuestion = (index: number, questionId: string) => {
    const item = questionLibrary.find((entry) => entry.id === questionId)
    if (!item || (item.kind !== 'mcq' && item.kind !== 'poll')) return
    updateStage(index, (stage) => ({
      ...stage, stageType: 'question', media: undefined,
      question: { libraryItemId: item.id, kind: item.kind as 'mcq' | 'poll', title: item.title, body: item.body, options: item.options, correctOptionId: item.correct_option_id, explanation: item.explanation },
    }))
  }

  const selectStageSource = (index: number, presetId: string) => {
    if (!presetId) {
      updateStage(index, (stage) => ({ ...stage, sourcePresetId: undefined, sourceName: 'Manual settings' }))
      return
    }
    const preset = staticPresets.find((item) => item.id === presetId)
    if (!preset) return
    const snapshot = normalisePhysiologyDefaults(asStaticScenario(cloneScenario(preset.scenario), ''))
    const inferredTemplate = inferPatientTemplate(snapshot.patient)
    updateStage(index, (stage) => ({
      ...stage,
      snapshot,
      apply: defaultMask(snapshot),
      sourcePresetId: preset.id,
      sourceName: preset.name,
      patientProfile: inferredTemplate?.profile,
      ardsSeverity: inferredTemplate?.ardsSeverity,
    }))
  }

  const applyStagePatientProfile = (index: number, profile: PatientProfileName) => {
    updateStage(index, (stage) => {
      let patient: PatientSettings
      let ardsSeverity: ArdsSeverity | undefined

      if (profile === 'ARDS') {
        const selected = selectedPatientTemplate(stage)
        if (selected?.profile === 'ARDS' && selected.ardsSeverity) {
          const currentIndex = ARDS_SEVERITIES.indexOf(selected.ardsSeverity)
          ardsSeverity = ARDS_SEVERITIES[(currentIndex + 1) % ARDS_SEVERITIES.length]
        } else {
          ardsSeverity = 'mild'
        }
        patient = { ...ARDS_PROFILES[ardsSeverity] }
      } else {
        patient = { ...PATIENT_PROFILES[profile] }
      }

      const apply = stage.apply ?? defaultMask(stage.snapshot)
      return {
        ...stage,
        sourcePresetId: undefined,
        sourceName: `Patient profile: ${profile}${ardsSeverity ? ` · ${ardsSeverity}` : ''}`,
        patientProfile: profile,
        ardsSeverity,
        snapshot: { ...stage.snapshot, patient },
        apply: { ...apply, patient: [...PATIENT_KEYS] },
      }
    })
  }

  const toggleField = (
    index: number,
    group: 'ventilator' | 'patient',
    key: string,
    checked: boolean,
  ) => {
    updateStage(index, (stage) => {
      const apply = stage.apply ?? defaultMask(stage.snapshot)
      const selected = new Set((apply[group] as string[]).map(String))
      if (checked) selected.add(key)
      else selected.delete(key)
      return {
        ...stage,
        apply: { ...apply, [group]: [...selected] } as DynamicScenarioApplyMask,
      }
    })
  }

  const setVent = (index: number, key: string, value: unknown) => {
    updateStage(index, (stage) => {
      const nextVentilator = { ...stage.snapshot.ventilator, [key]: value } as VentilatorSettings
      const apply = stage.apply ?? defaultMask(stage.snapshot)
      let nextVentKeys = apply.ventilator

      if (key === 'mode' || key === 'triggerType') {
        nextVentKeys = ventKeysFor(nextVentilator)
      }

      return {
        ...stage,
        sourcePresetId: undefined,
        sourceName: 'Manual settings',
        snapshot: { ...stage.snapshot, ventilator: nextVentilator },
        apply: { ...apply, ventilator: nextVentKeys },
      }
    })
  }

  const setPatient = (index: number, key: string, value: unknown) => {
    updateStage(index, (stage) => ({
      ...stage,
      sourcePresetId: undefined,
      sourceName: 'Manual settings',
      snapshot: {
        ...stage.snapshot,
        patient: { ...stage.snapshot.patient, [key]: value },
      },
    }))
  }

  const renderEditor = (
    index: number,
    field: FieldSpec,
    value: unknown,
    enabled: boolean,
    group: 'ventilator' | 'patient',
  ) => {
    const setValue = (next: unknown) => {
      if (group === 'ventilator') setVent(index, field.key, next)
      else setPatient(index, field.key, next)
    }

    if (field.type === 'boolean') {
      return (
        <button
          type="button"
          className={`dynamic-toggle-button ${Boolean(value) ? 'on' : 'off'}`}
          disabled={!enabled}
          onClick={() => setValue(!Boolean(value))}
        >
          {Boolean(value) ? 'On' : 'Off'}
        </button>
      )
    }

    if (field.type === 'select') {
      return (
        <select
          className="dynamic-control-select"
          value={String(value ?? '')}
          disabled={!enabled}
          onChange={(event) => setValue(
            field.key === 'mode'
              ? event.target.value as VentilatorMode
              : event.target.value,
          )}
        >
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      )
    }

    return (
      <>
        <div className="control-heading dynamic-control-heading">
          <span>{field.label}</span>
          <strong>{displayValue(field, value)}</strong>
        </div>
        <input
          className="dynamic-control-slider"
          type="range"
          value={Number(resolvedFieldValue(field, value))}
          disabled={!enabled}
          step={field.step ?? 1}
          min={field.min}
          max={field.max}
          onChange={(event) => setValue(Number(event.target.value))}
        />
      </>
    )
  }

  const renderRow = (
    index: number,
    field: FieldSpec,
    group: 'ventilator' | 'patient',
    values: Record<string, unknown>,
    selected: string[],
  ) => {
    const enabled = selected.includes(field.key)
    return (
      <div className={`control-row dynamic-control-row ${enabled ? 'enabled' : 'disabled'}`} key={field.key}>
        <label className="dynamic-control-apply" title={enabled ? 'This value will be pushed at this stage' : 'Leave this value unchanged at this stage'}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => toggleField(index, group, field.key, event.target.checked)}
          />
          <span>Apply</span>
        </label>
        <div className="dynamic-control-body">
          {field.type === 'select' || field.type === 'boolean'
            ? <div className="control-heading dynamic-control-heading"><span>{field.label}</span><strong>{displayValue(field, values[field.key])}</strong></div>
            : null}
          {renderEditor(index, field, values[field.key], enabled, group)}
        </div>
      </div>
    )
  }

  const renderPathTrigger = (branch: DynamicScenarioBranch, trigger: DynamicScenarioTrigger, triggerIndex: number, stageType: DynamicScenarioStageType) => {
    const triggerTypes: DynamicScenarioTrigger['type'][] = stageType === 'question'
      ? ['manual', 'question-any', 'question-correct', 'time', 'condition', 'action', 'patient-change', 'device-action']
      : ['manual', 'time', 'condition', 'action', 'patient-change', 'device-action']
    return <div className="dynamic-path-condition" key={`${branch.id}-${triggerIndex}`}>
      <select className="dynamic-path-condition-type" value={trigger.type} onChange={(event) => updateBranchTrigger(branch.id, triggerIndex, defaultTriggerForType(event.target.value as DynamicScenarioTrigger['type']))}>
        {triggerTypes.map((type) => <option key={type} value={type} disabled={type === 'question-correct' && !draft.stages.find((stage) => stage.id === branch.fromStageId)?.question?.correctOptionId}>{type === 'manual' ? 'Instructor choice' : type === 'time' ? 'Time passed' : type === 'condition' ? 'Measured value' : type === 'action' ? 'Ventilator change' : type === 'patient-change' ? 'Patient change' : type === 'device-action' ? 'Action' : type === 'question-correct' ? 'Correct answer' : 'Any answer'}</option>)}
      </select>
      {trigger.type === 'time' && <label><span>Seconds</span><input type="number" min={1} max={3600} value={trigger.seconds} onChange={(event) => updateBranchTrigger(branch.id, triggerIndex, { ...trigger, seconds: Math.max(1, Number(event.target.value) || 1) })} /></label>}
      {trigger.type === 'condition' && <><label><span>Measured value</span><select value={trigger.metric} onChange={(event) => updateBranchTrigger(branch.id, triggerIndex, { ...trigger, metric: event.target.value as DynamicScenarioMetric })}>{CONDITION_METRICS.map((metric) => <option key={metric.value} value={metric.value}>{metric.label}</option>)}</select></label><label><span>Comparison</span><select value={trigger.operator} onChange={(event) => updateBranchTrigger(branch.id, triggerIndex, { ...trigger, operator: event.target.value as 'lt' | 'eq' | 'gt' })}><option value="lt">Less than (&lt;)</option><option value="eq">Equal to (=)</option><option value="gt">Greater than (&gt;)</option></select></label><label><span>Value</span><input type="number" step="0.1" value={trigger.value} onChange={(event) => updateBranchTrigger(branch.id, triggerIndex, { ...trigger, value: Number(event.target.value) || 0 })} /></label></>}
      {trigger.type === 'action' && <><label><span>Ventilator</span><select value={String(trigger.parameter)} onChange={(event) => updateBranchTrigger(branch.id, triggerIndex, { ...trigger, parameter: event.target.value as keyof VentilatorSettings })}>{VENT_FIELDS.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}</select></label><label><span>Changed by</span><select value={trigger.actor} onChange={(event) => updateBranchTrigger(branch.id, triggerIndex, { ...trigger, actor: event.target.value as 'candidate' | 'instructor' | 'either' })}><option value="either">Either</option><option value="candidate">Candidate</option><option value="instructor">Instructor</option></select></label></>}
      {trigger.type === 'patient-change' && <><label><span>Patient / physiology</span><select value={String(trigger.parameter)} onChange={(event) => updateBranchTrigger(branch.id, triggerIndex, { ...trigger, parameter: event.target.value as keyof PatientSettings })}>{[...PATIENT_FIELDS, ...PHYSIO_FIELDS].map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}</select></label><label><span>Changed by</span><select value={trigger.actor} onChange={(event) => updateBranchTrigger(branch.id, triggerIndex, { ...trigger, actor: event.target.value as 'candidate' | 'instructor' | 'either' })}><option value="either">Either</option><option value="candidate">Candidate</option><option value="instructor">Instructor</option></select></label></>}
      {trigger.type === 'device-action' && <><label><span>Action</span><select value={trigger.action} onChange={(event) => updateBranchTrigger(branch.id, triggerIndex, { ...trigger, action: event.target.value as typeof trigger.action })}><option value="freeze-waveform">Freeze waveform</option><option value="inspiratory-hold">Inspiratory hold</option><option value="expiratory-hold">Expiratory hold</option><option value="oxygen-flush">Oxygen flush</option><option value="nebulisation">Nebulisation</option></select></label><label><span>Performed by</span><select value={trigger.actor} onChange={(event) => updateBranchTrigger(branch.id, triggerIndex, { ...trigger, actor: event.target.value as 'candidate' | 'instructor' | 'either' })}><option value="either">Either</option><option value="candidate">Candidate</option><option value="instructor">Instructor</option></select></label></>}
      {(trigger.type === 'manual' || trigger.type === 'question-any' || trigger.type === 'question-correct') && <span className="dynamic-path-condition-summary">{singleTriggerSummary(trigger)}</span>}
      <button type="button" className="dynamic-path-condition-remove" disabled={dynamicBranchTriggers(branch).length <= 1} onClick={() => removeBranchTrigger(branch.id, triggerIndex)} aria-label="Remove condition">×</button>
    </div>
  }

  const reset = () => {
    if (selectedPreset) replaceDraft(fromPreset(selectedPreset))
    else replaceDraft(newDraft(currentScenario))
  }

  const save = async () => {
    if (!draft.name.trim()) {
      setMessage('Enter a scenario name.')
      return
    }

    setBusy(true)
    setMessage(null)

    try {
      const base = asStaticScenario(cloneScenario(draft.stages[0]?.snapshot ?? currentScenario), '')
      const scenario: InstructorScenarioSnapshot = {
        ...base,
        schemaVersion: 9,
        kind: 'dynamic',
        description: draft.description.trim(),
        branches: draft.branches.map((branch, index) => { const triggers = dynamicBranchTriggers(branch); return { ...branch, trigger: triggers[0], triggers, triggerMode: dynamicBranchTriggerMode(branch), priority: Number.isFinite(branch.priority) ? branch.priority : index, enabled: branch.enabled !== false } }),
        stages: draft.stages.map((stage) => {
          const snapshot = asStaticScenario(cloneScenario(stage.snapshot), '')
          const relevant = new Set(ventKeysFor(snapshot.ventilator).map(String))
          const legacyTrigger: DynamicScenarioTrigger = { type: 'manual' }
          return {
            ...stage,
            sourcePresetId: undefined,
            advanceTrigger: legacyTrigger,
            advanceTriggers: [legacyTrigger],
            snapshot,
            apply: {
              ...(stage.apply ?? defaultMask(snapshot)),
              ventilator: (stage.apply?.ventilator ?? ventKeysFor(snapshot.ventilator))
                .filter((key) => relevant.has(String(key))),
            },
          }
        }),
      }

      const saved = draft.id
        ? await updateInstructorPreset(draft.id, { name: draft.name, scenario })
        : await createInstructorPreset(draft.name, scenario)

      replaceDraft(fromPreset(saved))
      await onRefresh()
      setMessage('Scenario saved.')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Unable to save dynamic scenario.')
    } finally {
      setBusy(false)
    }
  }

  const downloadScenario = (preset: InstructorPresetRow) => {
    const payload: PortableScenarioFile = { fileSchema: SCENARIO_FILE_SCHEMA, exportedAt: new Date().toISOString(), scenarioBuilderVersion: SCENARIO_BUILDER_VERSION, name: preset.name, scenario: cloneScenario(preset.scenario) }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = safeScenarioFilename(preset.name)
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url)
    setMessage(`Downloaded “${preset.name}”.`)
  }

  const importScenario = async (file: File) => {
    if (!canDiscard()) { if (scenarioImportInputRef.current) scenarioImportInputRef.current.value = ''; return }
    setBusy(true); setMessage(null)
    try {
      const parsed = JSON.parse(await file.text()) as Partial<PortableScenarioFile>
      if (parsed.fileSchema !== SCENARIO_FILE_SCHEMA) throw new Error('This is not an EDUVENT scenario file.')
      if (!parsed.scenario || parsed.scenario.kind !== 'dynamic') throw new Error('Only dynamic Scenario Builder files can be imported here.')
      if (!Array.isArray(parsed.scenario.stages) || parsed.scenario.stages.length === 0) throw new Error('The imported scenario has no stages.')
      const importedStages = parsed.scenario.stages.map((stage, index) => normaliseStage(stage, index))
      const importedBranches: DynamicScenarioBranch[] = (parsed.scenario.branches ?? []).map((branch, index) => { const triggers=dynamicBranchTriggers(branch); return { ...branch, id:branch.id||createBranchId(), trigger:triggers[0], triggers, triggerMode:dynamicBranchTriggerMode(branch), priority:Number.isFinite(branch.priority)?branch.priority:index, enabled:branch.enabled!==false } })
      if ((parsed.scenario.schemaVersion ?? 0) < 9) importedStages.slice(0,-1).forEach((stage,index)=>{ const next=importedStages[index+1]; if(!stage.id||!next?.id)return; const triggers=dynamicStageTriggers(stage); importedBranches.push({id:createBranchId(),fromStageId:stage.id,toStageId:next.id,trigger:triggers[0],triggers,triggerMode:'any',priority:1000+index,label:'Continue',enabled:true}) })
      const legacyTrigger: DynamicScenarioTrigger = { type:'manual' }
      const scenario: InstructorScenarioSnapshot = { ...cloneScenario(parsed.scenario), schemaVersion: 9, kind: 'dynamic', branches: importedBranches, stages: importedStages.map((stage) => ({ ...stage, sourcePresetId: undefined, advanceTrigger: legacyTrigger, advanceTriggers: [legacyTrigger] })) }
      const saved = await createInstructorPreset(uniqueImportedName(parsed.name ?? 'Imported scenario', [...dynamicPresets, ...staticPresets]), scenario)
      await onRefresh(); replaceDraft(fromPreset(saved)); setMessage(`Imported “${saved.name}”.`)
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Unable to import scenario file.') }
    finally { setBusy(false); if (scenarioImportInputRef.current) scenarioImportInputRef.current.value = '' }
  }

  const publishSelfDirected = async () => {
    if (!selectedPreset || dirty) return
    setAssignmentBusy(true)
    setAssignmentError(null)
    setAssignmentResult(null)
    try {
      const multiplier = assignmentExpiryUnit === 'weeks' ? 7 : 1
      const result = await createSelfDirectedAssignment(selectedPreset.name, selectedPreset.scenario, Math.min(365, assignmentExpiryValue * multiplier))
      setAssignmentResult(result)
    } catch (cause) {
      setAssignmentError(cause instanceof Error ? cause.message : 'Unable to create self-directed session.')
    } finally {
      setAssignmentBusy(false)
    }
  }

  const copyAssignmentLink = async () => {
    if (!assignmentResult) return
    const link = selfDirectedAssignmentUrl(assignmentResult.accessCode)
    try {
      await navigator.clipboard.writeText(link)
      setMessage('Self-directed session link copied.')
    } catch {
      window.prompt('Copy this self-directed session link:', link)
    }
  }

  const remove = async () => {
    if (!draft.id || !window.confirm(`Delete dynamic scenario “${draft.name}”?`)) return
    setBusy(true)
    try {
      await deleteInstructorPreset(draft.id)
      await onRefresh()
      const remaining = dynamicPresets.filter((preset) => preset.id !== draft.id)
      replaceDraft(remaining[0] ? fromPreset(remaining[0]) : newDraft(currentScenario))
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Unable to delete dynamic scenario.')
    } finally {
      setBusy(false)
    }
  }

  if (!wideScreen) {
    return (
      <div className="dynamic-wide-screen-required">
        <strong>Dynamic scenario builder requires a wide screen</strong>
        <p>Open EDUVENT on a desktop, laptop, or sufficiently wide tablet window to build or edit dynamic scenarios.</p>
        <button type="button" onClick={onClose}>Close</button>
      </div>
    )
  }

  return (
    <div className="dynamic-file-manager">
      <aside className="dynamic-scenario-sidebar">
        <div className="dynamic-sidebar-heading">
          <span>Dynamic scenarios</span>
          <strong>{dynamicPresets.length}</strong>
        </div>
        <div className="dynamic-scenario-list">
          {dynamicPresets.map((preset) => (
            <button
              type="button"
              key={preset.id}
              className={draft.id === preset.id ? 'selected' : ''}
              onClick={() => selectScenario(preset)}
            >
              <strong>{preset.name}</strong>
              <small>{preset.scenario.stages?.length ?? 0} stages</small>
            </button>
          ))}
          <button
            type="button"
            className={`dynamic-add-scenario ${draft.id == null ? 'selected' : ''}`}
            onClick={addScenario}
          >
            <strong>＋ Add scenario</strong>
          </button>
        </div>
      </aside>

      <section className="dynamic-builder-pane">
        <div className="dynamic-builder-top-actions">
          <input
            ref={scenarioImportInputRef}
            type="file"
            accept=".json,.eduvent-scenario.json,application/json"
            style={{ display: 'none' }}
            onChange={(event) => { const file = event.target.files?.[0]; if (file) void importScenario(file) }}
          />
          <button type="button" className="dynamic-file-icon-button" disabled={busy} title="Import scenario file" aria-label="Import scenario file" onClick={() => scenarioImportInputRef.current?.click()}><ImportScenarioIcon /></button>
          {selectedPreset && <button type="button" className="dynamic-file-icon-button" disabled={busy || dirty} title={dirty ? 'Save changes before downloading the scenario file' : 'Download scenario file'} aria-label="Download scenario file" onClick={() => downloadScenario(selectedPreset)}><DownloadScenarioIcon /></button>}
          {selectedPreset && <button type="button" className="account-secondary-button" disabled={busy || dirty} title={dirty ? 'Save changes before creating a self-directed session' : 'Create a self-directed session'} onClick={() => { setAssignmentOpen((current) => !current); setAssignmentResult(null); setAssignmentError(null) }}>Assign</button>}
          {selectedPreset && (
            <button
              type="button"
              className="account-primary-button"
              disabled={busy || dirty}
              onClick={() => { onStartScenario(selectedPreset); onClose() }}
            >
              Start scenario
            </button>
          )}
        </div>

        {assignmentOpen && selectedPreset && (
          <section className="dynamic-assignment-card" aria-label="Create self-directed session">
            <div className="dynamic-assignment-heading">
              <div><span>Self-directed session</span><strong>{selectedPreset.name}</strong></div>
              <button type="button" className="dynamic-stage-collapse" onClick={() => setAssignmentOpen(false)} aria-label="Close self-directed session setup">×</button>
            </div>
            <p>Candidates receive an independent copy of this saved scenario and can run it without an instructor connected.</p>
            <div className="dynamic-assignment-expiry">
              <label><span>Expires in</span><input type="number" min={1} max={assignmentExpiryUnit === 'weeks' ? 52 : 365} value={assignmentExpiryValue} onChange={(event) => setAssignmentExpiryValue(Math.max(1, Number(event.target.value) || 1))} /></label>
              <label><span>Unit</span><select value={assignmentExpiryUnit} onChange={(event) => setAssignmentExpiryUnit(event.target.value as 'days' | 'weeks')}><option value="days">Days</option><option value="weeks">Weeks</option></select></label>
              <button type="button" className="account-primary-button" disabled={assignmentBusy} onClick={() => void publishSelfDirected()}>{assignmentBusy ? 'Creating…' : 'Create session'}</button>
            </div>
            <small className="dynamic-assignment-note">The assignment is a snapshot of the scenario at publication time, including stage media and question content.</small>
            {assignmentResult && (
              <div className="dynamic-assignment-result">
                <div><span>Session code</span><strong>{assignmentResult.accessCode}</strong></div>
                <div><span>Expires</span><strong>{new Date(assignmentResult.expiresAt).toLocaleString()}</strong></div>
                <button type="button" className="account-secondary-button" onClick={() => void copyAssignmentLink()}>Copy link</button>
              </div>
            )}
            {assignmentError && <div className="account-error" role="alert">{assignmentError}</div>}
          </section>
        )}

        <div className="dynamic-scenario-header-block">
          <label>
            <span>Dynamic scenario name</span>
            <input
              value={draft.name}
              maxLength={80}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label>
            <span>Instructor notes</span>
            <textarea
              rows={3}
              maxLength={500}
              value={draft.description}
              onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
            />
          </label>
        </div>

        <div className="dynamic-stage-stack">
          {draft.stages.map((stage, index) => {
            const apply = stage.apply ?? defaultMask(stage.snapshot)
            const ventSelected = (apply.ventilator as string[]).map(String)
            const patientSelected = (apply.patient as string[]).map(String)
            const ventFields = ventKeysFor(stage.snapshot.ventilator)
              .map((key) => FIELD_BY_KEY.get(String(key)))
              .filter((field): field is FieldSpec => Boolean(field))
            const collapsed = collapsedStages.has(index)
            const stageType = stage.stageType ?? 'controls'
            const triggers = dynamicStageTriggers(stage)
            const transition = stage.transition ?? immediateTransition()
            const numericVentFields = ventFields.filter((field) => field.type !== 'select' && field.type !== 'boolean' && ventSelected.includes(field.key))
            const numericPatientFields = [...PATIENT_FIELDS, ...PHYSIO_FIELDS].filter((field) => field.type !== 'select' && field.type !== 'boolean' && patientSelected.includes(field.key))

            return (
              <div
                className={`dynamic-stage-shell ${draggedStageIndex === index ? 'dragging' : ''} ${dragOverStageIndex === index && draggedStageIndex !== index ? 'drag-over' : ''}`}
                key={`${index}-${stage.name}`}
                onDragOver={(event) => {
                  if (draggedStageIndex == null) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  setDragOverStageIndex(index)
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  const source = draggedStageIndex ?? Number(event.dataTransfer.getData('text/plain'))
                  if (Number.isInteger(source)) moveStage(source, index)
                  finishStageDrag()
                }}
              >
                <article className="dynamic-stage-card">
                  <div className="dynamic-stage-title-row">
                    <div>
                      <span>Stage {index + 1}</span>
                      <input
                        value={stage.name}
                        onChange={(event) => updateStage(index, (current) => ({ ...current, name: event.target.value }))}
                        placeholder={`Stage ${index + 1} name`}
                      />
                    </div>
                    <div className="dynamic-stage-title-actions">
                      <button
                        type="button"
                        className="dynamic-stage-drag-handle"
                        draggable
                        onDragStart={(event) => beginStageDrag(index, event)}
                        onDragEnd={finishStageDrag}
                        aria-label={`Drag Stage ${index + 1} to reorder`}
                        title="Drag stage to reorder"
                      >⋮⋮</button>
                      <button
                        type="button"
                        className="dynamic-stage-move"
                        disabled={index === 0}
                        onClick={() => moveStage(index, index - 1)}
                        aria-label={`Move Stage ${index + 1} up`}
                        title="Move stage up"
                      >↑</button>
                      <button
                        type="button"
                        className="dynamic-stage-move"
                        disabled={index === draft.stages.length - 1}
                        onClick={() => moveStage(index, index + 1)}
                        aria-label={`Move Stage ${index + 1} down`}
                        title="Move stage down"
                      >↓</button>
                      <button
                        type="button"
                        className="dynamic-stage-collapse"
                        onClick={() => toggleStageCollapsed(index)}
                        aria-label={`${collapsed ? 'Expand' : 'Collapse'} Stage ${index + 1}`}
                        aria-expanded={!collapsed}
                        title={collapsed ? 'Expand stage' : 'Collapse stage'}
                      >{collapsed ? '▸' : '▾'}</button>
                      {draft.stages.length > 1 && (
                        <button
                          type="button"
                          className="dynamic-stage-remove"
                          onClick={() => removeStage(index)}
                          aria-label={`Delete Stage ${index + 1}`}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>

                  <label className="dynamic-stage-comment">
                    <span>Stage comment</span>
                    {collapsed
                      ? <div className={`dynamic-stage-comment-preview ${stage.comment?.trim() ? '' : 'empty'}`}>{stage.comment?.trim() || 'No stage comment'}</div>
                      : <textarea rows={2} maxLength={800} value={stage.comment ?? ''} placeholder="Describe what should happen in this stage, the teaching objective, or what the instructor should look for…" onChange={(event) => updateStage(index, (current) => ({ ...current, comment: event.target.value }))} />}
                  </label>

                  {!collapsed && <>
                  <div className="dynamic-stage-type-tabs" role="group" aria-label={`Stage ${index + 1} type`}>
                    {(['controls', 'media', 'question'] as const).map((type) => <button type="button" key={type} className={stageType === type ? 'selected' : ''} onClick={() => setStageType(index, type)}>{type === 'controls' ? 'Controls' : type === 'media' ? 'Media' : 'Question'}</button>)}
                  </div>
                  {stageType === 'controls' && <>
                  <section className="dynamic-stage-transition-card">
                    <div className="dynamic-stage-transition-main">
                      <span>Transition</span>
                      <div className="dynamic-stage-transition-toggle">
                        <button type="button" className={transition.mode === 'immediate' ? 'selected' : ''} onClick={() => updateStage(index, (current) => ({ ...current, transition: immediateTransition() }))}>Immediate</button>
                        <button type="button" disabled={index === 0} title={index === 0 ? 'The first stage establishes the starting state.' : undefined} className={transition.mode === 'linear' ? 'selected' : ''} onClick={() => updateStage(index, (current) => ({ ...current, transition: linearTransition(current.transition?.mode === 'linear' ? current.transition.durationSeconds : 60) }))}>Linear</button>
                      </div>
                      {transition.mode === 'linear' && index > 0 && <label><span>Duration</span><input type="number" min={1} max={3600} value={transition.durationSeconds} onChange={(event) => updateStage(index, (current) => ({ ...current, transition: linearTransition(Math.max(1, Number(event.target.value) || 1)) }))} /><em>s</em></label>}
                    </div>
                    {index > 0 && (numericVentFields.length > 0 || numericPatientFields.length > 0) && <details className="dynamic-stage-transition-advanced">
                      <summary>Advanced transitions <small>Optional per-parameter overrides</small></summary>
                      <div className="dynamic-stage-transition-overrides">
                        {[...numericVentFields.map((field) => ({ group: 'ventilator' as const, field })), ...numericPatientFields.map((field) => ({ group: 'patient' as const, field }))].map(({ group, field }) => {
                          const overrides = stage.transitionOverrides?.[group] as Record<string, DynamicScenarioTransition> | undefined
                          const override = overrides?.[field.key]
                          const value = override == null ? 'inherit' : override.mode
                          return <div className="dynamic-stage-transition-override" key={`${group}-${field.key}`}><span>{field.label}</span><select value={value} onChange={(event) => updateStage(index, (current) => {
                            const next = { ...(current.transitionOverrides ?? {}) }
                            const groupOverrides = { ...((next[group] ?? {}) as Record<string, DynamicScenarioTransition>) }
                            const choice = event.target.value
                            if (choice === 'inherit') delete groupOverrides[field.key]
                            else if (choice === 'immediate') groupOverrides[field.key] = immediateTransition()
                            else groupOverrides[field.key] = linearTransition(override?.mode === 'linear' ? override.durationSeconds : (current.transition?.mode === 'linear' ? current.transition.durationSeconds : 60))
                            next[group] = groupOverrides as never
                            return { ...current, transitionOverrides: next }
                          })}><option value="inherit">Inherit stage</option><option value="immediate">Immediate</option><option value="linear">Linear</option></select>{override?.mode === 'linear' && <label><input type="number" min={1} max={3600} value={override.durationSeconds} onChange={(event) => updateStage(index, (current) => { const next={ ...(current.transitionOverrides ?? {}) }; const groupOverrides={ ...((next[group] ?? {}) as Record<string, DynamicScenarioTransition>) }; groupOverrides[field.key]=linearTransition(Math.max(1,Number(event.target.value)||1)); next[group]=groupOverrides as never; return { ...current, transitionOverrides: next } })} /><em>s</em></label>}</div>
                        })}
                      </div>
                    </details>}
                  </section>
                  <label className="dynamic-stage-source-row">
                    <span>Start from</span>
                    <select
                      value={stage.sourcePresetId ?? ''}
                      onChange={(event) => selectStageSource(index, event.target.value)}
                    >
                      <option value="">Manual Vent / Patient / Physio settings</option>
                      {staticPresets.length > 0 && (
                        <optgroup label="Static scenario presets">
                          {staticPresets.map((preset) => (
                            <option value={preset.id} key={preset.id}>{preset.name}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </label>

                  <div className="dynamic-stage-profile-strip" role="group" aria-label={`Stage ${index + 1} patient profiles`}>
                    {PATIENT_PROFILE_NAMES.map((profile) => {
                      const selectedTemplate = selectedPatientTemplate(stage)
                      const selected = selectedTemplate?.profile === profile
                      const selectedProfile = profile === 'ARDS'
                        ? (selectedTemplate?.ardsSeverity ? ARDS_PROFILES[selectedTemplate.ardsSeverity] : ARDS_PROFILES.mild)
                        : PATIENT_PROFILES[profile]
                      const modified = selected && !patientMatchesProfile(stage.snapshot.patient, selectedProfile)
                      const label = profile === 'ARDS' && selected && selectedTemplate?.ardsSeverity
                        ? `ARDS · ${selectedTemplate.ardsSeverity[0].toUpperCase() + selectedTemplate.ardsSeverity.slice(1)}`
                        : profile
                      return (
                        <button
                          type="button"
                          key={profile}
                          className={selected ? (modified ? 'profile-modified' : 'profile-selected') : ''}
                          aria-pressed={selected}
                          title={profile === 'ARDS'
                            ? (selected && selectedTemplate?.ardsSeverity
                              ? `ARDS ${selectedTemplate.ardsSeverity} · click for ${ARDS_SEVERITIES[(ARDS_SEVERITIES.indexOf(selectedTemplate.ardsSeverity) + 1) % ARDS_SEVERITIES.length]}`
                              : 'Apply mild ARDS profile')
                            : selected && modified ? `${profile} template selected · settings modified` : `Apply ${profile} profile template`}
                          onClick={() => applyStagePatientProfile(index, profile)}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>

                  <div className="dynamic-control-columns">
                    <section className="dynamic-control-column vent">
                      <div className="dynamic-column-title">
                        <span>VENT</span>
                        <small>{ventSelected.filter((key) => ventFields.some((field) => field.key === key)).length}/{ventFields.length}</small>
                      </div>
                      <div className="dynamic-column-controls">
                        {ventFields.map((field) => renderRow(
                          index,
                          field,
                          'ventilator',
                          stage.snapshot.ventilator as unknown as Record<string, unknown>,
                          ventSelected,
                        ))}
                      </div>
                    </section>

                    <section className="dynamic-control-column patient">
                      <div className="dynamic-column-title">
                        <span>PATIENT</span>
                        <small>{PATIENT_FIELDS.filter((field) => patientSelected.includes(field.key)).length}/{PATIENT_FIELDS.length}</small>
                      </div>
                      <div className="dynamic-column-controls">
                        {PATIENT_FIELDS.map((field) => renderRow(
                          index,
                          field,
                          'patient',
                          stage.snapshot.patient as unknown as Record<string, unknown>,
                          patientSelected,
                        ))}
                      </div>
                    </section>

                    <section className="dynamic-control-column physio">
                      <div className="dynamic-column-title">
                        <span>PHYSIO</span>
                        <small>{PHYSIO_FIELDS.filter((field) => patientSelected.includes(field.key)).length}/{PHYSIO_FIELDS.length}</small>
                      </div>
                      <div className="dynamic-column-controls">
                        {PHYSIO_FIELDS.map((field) => renderRow(
                          index,
                          field,
                          'patient',
                          stage.snapshot.patient as unknown as Record<string, unknown>,
                          patientSelected,
                        ))}
                      </div>
                    </section>
                  </div>
                  </>}
                  {stageType === 'media' && <div className="dynamic-stage-content-picker">
                    <div className="dynamic-stage-content-heading"><strong>Media library</strong><span>Select the image or video presented during this stage.</span></div>
                    <select value={stage.media?.mediaId ?? ''} onChange={(event) => selectStageMedia(index, event.target.value)}><option value="">Select media…</option>{mediaLibrary.map((media) => <option key={media.id} value={media.id}>{media.title} · {media.media_kind === 'video' ? 'Video' : 'Image'}</option>)}</select>
                    {stage.media && <div className="dynamic-stage-selected-content"><strong>{stage.media.title}</strong><span>{stage.media.mediaKind === 'video' ? 'Video' : 'Image'} · simulator continues running while displayed.</span></div>}
                    {!mediaLibrary.length && <small>No media are available in your media library.</small>}
                  </div>}
                  {stageType === 'question' && <div className="dynamic-stage-content-picker">
                    <div className="dynamic-stage-content-heading"><strong>Question library</strong><span>Select a saved MCQ or poll. The question is copied into the scenario snapshot.</span></div>
                    <select value={stage.question?.libraryItemId ?? ''} onChange={(event) => selectStageQuestion(index, event.target.value)}><option value="">Select question…</option>{questionLibrary.map((item) => <option key={item.id} value={item.id}>{item.title || item.body.slice(0, 60)} · {item.kind.toUpperCase()}</option>)}</select>
                    {stage.question && <div className="dynamic-stage-selected-content question"><strong>{stage.question.title || 'Question'}</strong><span>{stage.question.body}</span><small>{stage.question.kind === 'mcq' ? (stage.question.correctOptionId ? 'MCQ · correct-answer trigger available' : 'MCQ · no correct answer marked') : 'Poll · any-answer or time trigger'}</small></div>}
                    {!questionLibrary.length && <small>No MCQs or polls are available in your question library.</small>}
                  </div>}
                  {libraryError && <div className="account-error">{libraryError}</div>}
                  </>}
                </article>

                <div className="dynamic-branch-builder dynamic-path-builder">
                  <div className="dynamic-branch-heading"><div><strong>Paths from this stage</strong><span>Every route to another stage lives here. Add multiple conditions and choose whether ANY or ALL must match.</span></div><button type="button" disabled={draft.stages.length < 2} onClick={() => addBranch(index)}>＋ Add path</button></div>
                  {draft.branches.filter((branch) => branch.fromStageId === stage.id).sort((a,b)=>a.priority-b.priority).map((branch) => {
                    const pathTriggers = dynamicBranchTriggers(branch)
                    return <section className="dynamic-path-card" key={branch.id}>
                      <div className="dynamic-path-head">
                        <label><span>Path name</span><input className="dynamic-branch-label" value={branch.label ?? ''} placeholder="e.g. Continue / Deteriorates / Responds" onChange={(event)=>updateBranch(branch.id,{label:event.target.value})} /></label>
                        <label><span>Destination</span><select value={branch.toStageId} onChange={(event)=>updateBranch(branch.id,{toStageId:event.target.value})}>{draft.stages.filter((candidate)=>candidate.id!==stage.id).map((candidate)=>{const stageIndex=draft.stages.findIndex((item)=>item.id===candidate.id);return <option key={candidate.id} value={candidate.id}>Stage {stageIndex+1}: {candidate.name}</option>})}</select></label>
                        <label><span>Priority</span><input type="number" min={0} max={9999} value={branch.priority} onChange={(event)=>updateBranch(branch.id,{priority:Math.max(0,Number(event.target.value)||0)})} /></label>
                        <button type="button" className="dynamic-stage-remove" onClick={()=>removeBranch(branch.id)} aria-label="Remove path">×</button>
                      </div>
                      <div className="dynamic-path-logic">
                        <strong>When</strong>
                        {pathTriggers.length > 1 && <div className="dynamic-path-mode" role="group" aria-label="Path condition logic"><button type="button" className={dynamicBranchTriggerMode(branch)==='any'?'selected':''} onClick={()=>updateBranch(branch.id,{triggerMode:'any'})}>ANY</button><button type="button" className={dynamicBranchTriggerMode(branch)==='all'?'selected':''} onClick={()=>updateBranch(branch.id,{triggerMode:'all'})}>ALL</button></div>}
                        <small>{pathTriggers.length > 1 ? (dynamicBranchTriggerMode(branch)==='all' ? 'all conditions are true' : 'any condition is true') : 'this condition is met'}</small>
                      </div>
                      <div className="dynamic-path-conditions">{pathTriggers.map((trigger,triggerIndex)=>renderPathTrigger(branch,trigger,triggerIndex,stageType))}</div>
                      <button type="button" className="dynamic-path-add-condition" onClick={()=>addBranchTrigger(branch.id,stageType)}>＋ Add condition</button>
                    </section>
                  })}
                  {!draft.branches.some((branch)=>branch.fromStageId===stage.id) && <div className="dynamic-path-empty">No outgoing path. This stage is an endpoint until the instructor jumps elsewhere.</div>}
                </div>

                <div className="dynamic-stage-insert-row" aria-label={index < draft.stages.length - 1 ? `Insert stage between Stage ${index + 1} and Stage ${index + 2}` : 'Add stage'}>
                  <span />
                  <button
                    type="button"
                    className="dynamic-stage-insert"
                    onClick={() => insertStage(index)}
                    title={index < draft.stages.length - 1 ? `Insert a new stage between Stage ${index + 1} and Stage ${index + 2}` : 'Add a new stage'}
                  >＋ <small>{index < draft.stages.length - 1 ? 'Insert stage' : 'Add stage'}</small></button>
                  <span />
                </div>
              </div>
            )
          })}
        </div>

        {message && <div className="account-message">{message}</div>}

        <footer className="dynamic-builder-footer">
          <button
            type="button"
            className="scenario-delete-button"
            disabled={busy || !draft.id}
            onClick={() => void remove()}
          >
            Delete scenario
          </button>
          <button type="button" disabled={busy || !dirty} onClick={reset}>Reset scenario</button>
          <span />
          <button type="button" disabled={busy} onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="account-primary-button"
            disabled={busy || !draft.name.trim()}
            onClick={() => void save()}
          >
            {busy ? 'Saving…' : 'Save scenario'}
          </button>
        </footer>
      </section>
    </div>
  )
}
