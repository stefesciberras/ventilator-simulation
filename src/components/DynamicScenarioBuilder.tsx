import { useEffect, useMemo, useRef, useState } from 'react'
import type { PatientSettings, VentilatorMode, VentilatorSettings } from '../simulation/types'
import { calculatePredictedBodyWeight } from '../patientMetrics'
import { ARDS_PROFILES, ARDS_SEVERITIES, PATIENT_PROFILES, PATIENT_PROFILE_NAMES, patientMatchesProfile, type ArdsSeverity, type PatientProfileName } from '../patientProfiles'
import {
  asStaticScenario,
  createInstructorPreset,
  deleteInstructorPreset,
  dynamicStageTriggers,
  updateInstructorPreset,
  type DynamicScenarioApplyMask,
  type DynamicScenarioMetric,
  type DynamicScenarioStage,
  type DynamicScenarioTrigger,
  type InstructorPresetRow,
  type InstructorScenarioSnapshot,
} from '../instructorAccount'
import { SCENARIO_BUILDER_VERSION } from '../scenario-builder/version'
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
interface ScenarioDraft { id: string | null; name: string; description: string; stages: StageDraft[] }
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
  return { type: 'action', parameter: 'fio2', actor: 'either' }
}

function singleTriggerSummary(value: DynamicScenarioTrigger) {
  if (value.type === 'manual') return 'Manual'
  if (value.type === 'time') return `After ${value.seconds}s in stage`
  if (value.type === 'condition') {
    const metric = CONDITION_METRICS.find((item) => item.value === value.metric)
    const operator = value.operator === 'lt' ? '<' : value.operator === 'gt' ? '>' : '='
    return `${metric?.label ?? value.metric} ${operator} ${value.value}${metric?.unit ? ` ${metric.unit}` : ''}`
  }
  const field = VENT_FIELDS.find((item) => item.key === value.parameter)
  const actor = value.actor === 'either' ? 'candidate or instructor' : value.actor
  return `${field?.label ?? String(value.parameter)} changed by ${actor}`
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
    name: stage.name || `Stage ${index + 1}`,
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
    name: `Stage ${index + 1}`,
    comment: '',
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
  return { id: null, name: 'New dynamic scenario', description: '', stages: [newStage(base, 0)] }
}

function fromPreset(preset: InstructorPresetRow): ScenarioDraft {
  return {
    id: preset.id,
    name: preset.name,
    description: preset.scenario.description ?? '',
    stages: (preset.scenario.stages ?? []).map(normaliseStage),
  }
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
  const [triggerMenuIndex, setTriggerMenuIndex] = useState<number | null>(null)
  const [collapsedStages, setCollapsedStages] = useState<Set<number>>(() => new Set())
  const scenarioImportInputRef = useRef<HTMLInputElement | null>(null)

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
      stages.splice(index + 1, 0, newStage(currentScenario, index + 1))
      return { ...current, stages }
    })
    setTriggerMenuIndex(null)
  }

  const setAdvanceTriggers = (index: number, advanceTriggers: DynamicScenarioTrigger[]) => {
    const next = advanceTriggers.length ? advanceTriggers : [defaultAdvanceTrigger()]
    updateStage(index, (stage) => ({ ...stage, advanceTrigger: next[0], advanceTriggers: next }))
  }
  const updateAdvanceTrigger = (index: number, nextTrigger: DynamicScenarioTrigger) => {
    const stage = draft.stages[index]; if (!stage) return
    setAdvanceTriggers(index, dynamicStageTriggers(stage).map((trigger) => trigger.type === nextTrigger.type ? nextTrigger : trigger))
  }
  const toggleTriggerType = (index: number, type: DynamicScenarioTrigger['type']) => {
    const stage = draft.stages[index]; if (!stage) return
    const triggers = dynamicStageTriggers(stage)
    const selected = triggers.some((trigger) => trigger.type === type)
    if (selected) {
      if (triggers.length === 1) return
      setAdvanceTriggers(index, triggers.filter((trigger) => trigger.type !== type)); return
    }
    setAdvanceTriggers(index, [...triggers, defaultTriggerForType(type)])
  }

  const removeStage = (index: number) => {
    if (draft.stages.length <= 1) return
    setCollapsedStages(new Set())
    setDraft((current) => ({
      ...current,
      stages: current.stages.filter((_, i) => i !== index),
    }))
  }

  const toggleStageCollapsed = (index: number) => {
    setCollapsedStages((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
    setTriggerMenuIndex((current) => current === index ? null : current)
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
        <div className="dynamic-control-heading">
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
      <div className={`dynamic-control-row ${enabled ? 'enabled' : 'disabled'}`} key={field.key}>
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
            ? <div className="dynamic-control-heading"><span>{field.label}</span><strong>{displayValue(field, values[field.key])}</strong></div>
            : null}
          {renderEditor(index, field, values[field.key], enabled, group)}
        </div>
      </div>
    )
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
        schemaVersion: 5,
        kind: 'dynamic',
        description: draft.description.trim(),
        stages: draft.stages.map((stage) => {
          const snapshot = asStaticScenario(cloneScenario(stage.snapshot), '')
          const relevant = new Set(ventKeysFor(snapshot.ventilator).map(String))
          const triggers = dynamicStageTriggers(stage)
          return {
            ...stage,
            sourcePresetId: undefined,
            advanceTrigger: triggers[0],
            advanceTriggers: triggers,
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
      const scenario: InstructorScenarioSnapshot = { ...cloneScenario(parsed.scenario), schemaVersion: 5, kind: 'dynamic', stages: importedStages.map((stage) => { const triggers = dynamicStageTriggers(stage); return { ...stage, sourcePresetId: undefined, advanceTrigger: triggers[0], advanceTriggers: triggers } }) }
      const saved = await createInstructorPreset(uniqueImportedName(parsed.name ?? 'Imported scenario', [...dynamicPresets, ...staticPresets]), scenario)
      await onRefresh(); replaceDraft(fromPreset(saved)); setMessage(`Imported “${saved.name}”.`)
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Unable to import scenario file.') }
    finally { setBusy(false); if (scenarioImportInputRef.current) scenarioImportInputRef.current.value = '' }
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
            const triggers = dynamicStageTriggers(stage)

            return (
              <div className="dynamic-stage-shell" key={`${index}-${stage.name}`}>
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
                </article>

                <div className="dynamic-transition-builder">
                  <div className="dynamic-trigger-row" aria-label={`Triggers after Stage ${index + 1}`}>
                    <div className="dynamic-trigger-list">
                      {triggers.map((trigger, triggerIndex) => (
                        <div className="dynamic-trigger-item" key={`${trigger.type}-${triggerIndex}`}>
                          {triggerIndex > 0 && <span className="dynamic-trigger-or">OR</span>}
                          <button type="button" className="dynamic-trigger-chip" onClick={() => setTriggerMenuIndex(index)} title="Edit triggers">{singleTriggerSummary(trigger)}</button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="dynamic-trigger-add"
                      onClick={() => setTriggerMenuIndex((current) => current === index ? null : index)}
                      aria-label={`Add or edit triggers after Stage ${index + 1}`}
                      title="Add or edit triggers"
                    >＋</button>
                  </div>
                  {triggerMenuIndex === index && (() => {
                    const manualTrigger = triggers.find((trigger) => trigger.type === 'manual')
                    const timeTrigger = triggers.find((trigger): trigger is Extract<DynamicScenarioTrigger, { type: 'time' }> => trigger.type === 'time')
                    const conditionTrigger = triggers.find((trigger): trigger is Extract<DynamicScenarioTrigger, { type: 'condition' }> => trigger.type === 'condition')
                    const actionTrigger = triggers.find((trigger): trigger is Extract<DynamicScenarioTrigger, { type: 'action' }> => trigger.type === 'action')
                    return <div className="dynamic-trigger-menu">
                      <div className="dynamic-trigger-types">
                        {(['manual', 'time', 'condition', 'action'] as const).map((type) => (
                          <button type="button" key={type} className={triggers.some((trigger) => trigger.type === type) ? 'selected' : ''} onClick={() => toggleTriggerType(index, type)}>
                            {type === 'manual' ? 'Manual' : type === 'time' ? 'Time passed' : type === 'condition' ? 'Condition' : 'Action'}
                          </button>
                        ))}
                      </div>
                      <p>Any selected trigger can advance to the next stage (OR). Manual keeps the instructor trigger available while automatic triggers remain armed.</p>
                      {manualTrigger && <p>Manual: instructor advances from the Teaching tab. Back remains available during the scenario.</p>}
                      {timeTrigger && <label className="dynamic-trigger-field"><span>Time in stage</span><div><input type="number" min={1} max={3600} step={1} value={timeTrigger.seconds} onChange={(event) => updateAdvanceTrigger(index, { ...timeTrigger, seconds: Math.max(1, Number(event.target.value) || 1) })} /><em>seconds</em></div></label>}
                      {conditionTrigger && <div className="dynamic-trigger-condition">
                        <label><span>Measured value</span><select value={conditionTrigger.metric} onChange={(event) => updateAdvanceTrigger(index, { ...conditionTrigger, metric: event.target.value as DynamicScenarioMetric })}>{CONDITION_METRICS.map((metric) => <option key={metric.value} value={metric.value}>{metric.label}</option>)}</select></label>
                        <label><span>Comparison</span><select value={conditionTrigger.operator} onChange={(event) => updateAdvanceTrigger(index, { ...conditionTrigger, operator: event.target.value as 'lt' | 'eq' | 'gt' })}><option value="lt">Less than (&lt;)</option><option value="eq">Equal to (=)</option><option value="gt">Greater than (&gt;)</option></select></label>
                        <label><span>Value</span><input type="number" step="0.1" value={conditionTrigger.value} onChange={(event) => updateAdvanceTrigger(index, { ...conditionTrigger, value: Number(event.target.value) || 0 })} /></label>
                      </div>}
                      {actionTrigger && <div className="dynamic-trigger-condition">
                        <label><span>Ventilator parameter</span><select value={String(actionTrigger.parameter)} onChange={(event) => updateAdvanceTrigger(index, { ...actionTrigger, parameter: event.target.value as keyof VentilatorSettings })}>{VENT_FIELDS.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}</select></label>
                        <label><span>Changed by</span><select value={actionTrigger.actor} onChange={(event) => updateAdvanceTrigger(index, { ...actionTrigger, actor: event.target.value as 'candidate' | 'instructor' | 'either' })}><option value="either">Candidate or instructor</option><option value="candidate">Candidate</option><option value="instructor">Instructor</option></select></label>
                      </div>}
                      <div className="dynamic-trigger-actions"><button type="button" onClick={() => setTriggerMenuIndex(null)}>Close</button>{index === draft.stages.length - 1 && <button type="button" className="account-primary-button" onClick={() => insertStage(index)}>Add next stage</button>}</div>
                    </div>
                  })()}
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
