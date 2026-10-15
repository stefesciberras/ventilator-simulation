import { useEffect, useMemo, useRef, useState } from 'react'
import type { PatientSettings, VentilatorMode, VentilatorSettings } from '../simulation/types'
import {
  asStaticScenario,
  createInstructorPreset,
  deleteInstructorPreset,
  updateInstructorPreset,
  type DynamicScenarioApplyMask,
  type DynamicScenarioStage,
  type InstructorPresetRow,
  type InstructorScenarioSnapshot,
} from '../instructorAccount'
import './DynamicScenarioBuilder.css'

interface DynamicScenarioBuilderProps {
  currentScenario: InstructorScenarioSnapshot
  dynamicPresets: InstructorPresetRow[]
  staticPresets: InstructorPresetRow[]
  simulationPaused: boolean
  onSimulationPausedChange: (paused: boolean) => void
  onRefresh: () => Promise<void>
  onClose: () => void
}

type StageDraft = DynamicScenarioStage & { sourcePresetId?: string }
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
  return { ...snapshot, patient }
}

function resolvedFieldValue(field: FieldSpec, value: unknown): unknown {
  if (field.type === 'select' || field.type === 'boolean') return value ?? field.defaultValue
  const numeric = Number(value)
  if (Number.isFinite(numeric)) return numeric
  return field.defaultValue ?? field.min ?? 0
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

  return {
    ...cloneScenario(stage),
    name: stage.name || `Stage ${index + 1}`,
    apply: {
      ...(stage.apply ?? defaultMask(snapshot)),
      ventilator,
      patient: stage.apply?.patient ?? [...PATIENT_KEYS],
    },
  }
}

function newStage(base: InstructorScenarioSnapshot, index: number): StageDraft {
  const snapshot = normalisePhysiologyDefaults(asStaticScenario(cloneScenario(base), ''))
  return {
    name: `Stage ${index + 1}`,
    snapshot,
    apply: defaultMask(snapshot),
    sourceName: 'Manual settings',
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
    onClose,
  } = props

  const wideScreen = useWideScreen()
  const previousPausedRef = useRef(simulationPaused)
  const initial = dynamicPresets[0] ? fromPreset(dynamicPresets[0]) : newDraft(currentScenario)
  const [draft, setDraft] = useState<ScenarioDraft>(initial)
  const baselineRef = useRef(serialise(initial))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

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
    setDraft((current) => {
      const stages = [...current.stages]
      stages.splice(index + 1, 0, newStage(currentScenario, index + 1))
      return { ...current, stages }
    })
  }

  const removeStage = (index: number) => {
    if (draft.stages.length <= 1) return
    setDraft((current) => ({
      ...current,
      stages: current.stages.filter((_, i) => i !== index),
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
    updateStage(index, (stage) => ({
      ...stage,
      snapshot,
      apply: defaultMask(snapshot),
      sourcePresetId: preset.id,
      sourceName: preset.name,
    }))
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
        schemaVersion: 3,
        kind: 'dynamic',
        description: draft.description.trim(),
        stages: draft.stages.map((stage) => {
          const snapshot = asStaticScenario(cloneScenario(stage.snapshot), '')
          const relevant = new Set(ventKeysFor(snapshot.ventilator).map(String))
          return {
            ...stage,
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
                </article>

                <button
                  type="button"
                  className="dynamic-add-stage"
                  onClick={() => insertStage(index)}
                  aria-label={`Add stage after Stage ${index + 1}`}
                >
                  ＋
                </button>
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
