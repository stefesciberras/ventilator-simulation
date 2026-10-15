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
interface FieldSpec { key: string; label: string; type?: 'number' | 'boolean' | 'select'; step?: number; min?: number; max?: number; options?: Array<{ value: string; label: string }> }

const VENT_FIELDS: FieldSpec[] = [
  { key: 'mode', label: 'Mode', type: 'select', options: ['VC-AC','PC-AC','PSV','SIMV-VC','SIMV-PC','VG-PC','APRV','BIPAP'].map((value) => ({ value, label: value })) },
  { key: 'fio2', label: 'FiO₂', step: .05, min: .21, max: 1 }, { key: 'peep', label: 'PEEP', min: 0, max: 30 }, { key: 'rate', label: 'Set RR', min: 0, max: 40 },
  { key: 'tidalVolume', label: 'Tidal volume (mL)', step: 10, min: 50, max: 1500 }, { key: 'inspiratoryTime', label: 'Tinsp (s)', step: .05, min: .1, max: 5 },
  { key: 'inspiratoryFlow', label: 'Inspiratory flow (L/min)', min: 1, max: 120 }, { key: 'plateauPercent', label: 'Plateau (%)', min: 0, max: 100 },
  { key: 'pressureControl', label: 'Pressure control', min: 1, max: 60 }, { key: 'volumeGuaranteePressureLimit', label: 'VG pressure limit', min: 5, max: 60 },
  { key: 'pressureSupport', label: 'Pressure support', min: 0, max: 50 }, { key: 'triggerType', label: 'Trigger type', type: 'select', options: [{ value: 'pressure', label: 'Pressure' }, { value: 'flow', label: 'Flow' }] },
  { key: 'triggerSensitivity', label: 'Pressure trigger', step: .5, min: .5, max: 10 }, { key: 'flowTriggerSensitivity', label: 'Flow trigger', step: .5, min: .5, max: 20 },
  { key: 'terminationSensitivity', label: 'Termination sensitivity (%)', min: 5, max: 80 }, { key: 'simvSyncWindowPercent', label: 'SIMV sync window (%)', min: 0, max: 100 },
  { key: 'showSimvSyncWindow', label: 'Show SIMV sync window', type: 'boolean' }, { key: 'pHigh', label: 'P high', min: 1, max: 60 }, { key: 'pLow', label: 'P low', min: 0, max: 30 },
  { key: 'tHigh', label: 'T high (s)', step: .1, min: .1, max: 20 }, { key: 'tLow', label: 'T low (s)', step: .05, min: .05, max: 5 },
]
const PATIENT_FIELDS: FieldSpec[] = [
  { key: 'compliance', label: 'Compliance (mL/cmH₂O)', min: 5, max: 200 }, { key: 'resistance', label: 'Inspiratory resistance', min: 1, max: 80 },
  { key: 'expiratoryResistance', label: 'Expiratory resistance', min: 1, max: 100 }, { key: 'expiratoryFlowLimitation', label: 'Expiratory flow limitation', step: .05, min: 0, max: 1 },
  { key: 'spontaneousRate', label: 'Patient respiratory rate', min: 0, max: 50 }, { key: 'effort', label: 'Effort', min: 0, max: 30 },
  { key: 'neuralInspiratoryTime', label: 'Neural Tinsp (s)', step: .05, min: .2, max: 3 }, { key: 'effortRisePercent', label: 'Effort rise (%)', min: 0, max: 100 },
  { key: 'effortRelaxationPercent', label: 'Effort relaxation (%)', min: 0, max: 100 }, { key: 'endExpiratoryOesophagealPressure', label: 'End-expiratory Pes', min: -30, max: 20 },
]
const PHYSIO_FIELDS: FieldSpec[] = [
  { key: 'sex', label: 'Sex', type: 'select', options: [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }] }, { key: 'heightCm', label: 'Height (cm)', min: 50, max: 220 },
  { key: 'oxygenConsumption', label: 'O₂ consumption (mL/min)', step: 10, min: 20, max: 800 }, { key: 'frc', label: 'FRC (mL)', step: 50, min: 100, max: 8000 },
  { key: 'shuntFraction', label: 'Shunt fraction', step: .01, min: 0, max: 1 }, { key: 'maxSpO2', label: 'Maximum SpO₂ (%)', min: 50, max: 100 },
  { key: 'co2Production', label: 'CO₂ production (mL/min)', step: 10, min: 20, max: 800 }, { key: 'vdVt', label: 'Vd/Vt', step: .05, min: .1, max: .9 },
]
const VENT_KEYS = VENT_FIELDS.map((f) => f.key as keyof VentilatorSettings)
const PATIENT_KEYS = [...PATIENT_FIELDS, ...PHYSIO_FIELDS].map((f) => f.key as keyof PatientSettings)

function cloneScenario<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
function defaultMask(): DynamicScenarioApplyMask { return { ventilator: [...VENT_KEYS], patient: [...PATIENT_KEYS], alarmLimits: [], patientTransitionSeconds: false, waveformDisplay: false, mediaIds: false } }
function newStage(base: InstructorScenarioSnapshot, index: number): StageDraft { return { name: `Stage ${index + 1}`, snapshot: asStaticScenario(cloneScenario(base), ''), apply: defaultMask(), sourceName: 'Manual settings' } }
function newDraft(base: InstructorScenarioSnapshot): ScenarioDraft { return { id: null, name: 'New dynamic scenario', description: '', stages: [newStage(base, 0)] } }
function fromPreset(preset: InstructorPresetRow): ScenarioDraft { return { id: preset.id, name: preset.name, description: preset.scenario.description ?? '', stages: (preset.scenario.stages ?? []).map((stage, index) => ({ ...cloneScenario(stage), name: stage.name || `Stage ${index + 1}`, apply: stage.apply ?? defaultMask() })) } }
function serialise(draft: ScenarioDraft) { return JSON.stringify(draft) }

export function DynamicScenarioBuilder(props: DynamicScenarioBuilderProps) {
  const { currentScenario, dynamicPresets, staticPresets, simulationPaused, onSimulationPausedChange, onRefresh, onClose } = props
  const previousPausedRef = useRef(simulationPaused)
  const initial = dynamicPresets[0] ? fromPreset(dynamicPresets[0]) : newDraft(currentScenario)
  const [draft, setDraft] = useState<ScenarioDraft>(initial)
  const baselineRef = useRef(serialise(initial))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => { onSimulationPausedChange(true); return () => onSimulationPausedChange(previousPausedRef.current) }, [onSimulationPausedChange])
  const dirty = serialise(draft) !== baselineRef.current
  const selectedPreset = useMemo(() => dynamicPresets.find((preset) => preset.id === draft.id) ?? null, [dynamicPresets, draft.id])
  const replaceDraft = (next: ScenarioDraft) => { setDraft(next); baselineRef.current = serialise(next); setMessage(null) }
  const canDiscard = () => !dirty || window.confirm('Discard unsaved changes to this dynamic scenario?')

  const updateStage = (index: number, updater: (stage: StageDraft) => StageDraft) => setDraft((current) => ({ ...current, stages: current.stages.map((stage, i) => i === index ? updater(stage) : stage) }))
  const selectScenario = (preset: InstructorPresetRow) => { if (canDiscard()) replaceDraft(fromPreset(preset)) }
  const addScenario = () => { if (canDiscard()) replaceDraft(newDraft(currentScenario)) }
  const insertStage = (index: number) => setDraft((current) => { const stages = [...current.stages]; stages.splice(index + 1, 0, newStage(currentScenario, index + 1)); return { ...current, stages } })
  const removeStage = (index: number) => draft.stages.length > 1 && setDraft((current) => ({ ...current, stages: current.stages.filter((_, i) => i !== index) }))

  const selectStageSource = (index: number, presetId: string) => {
    if (!presetId) { updateStage(index, (stage) => ({ ...stage, sourcePresetId: undefined, sourceName: 'Manual settings' })); return }
    const preset = staticPresets.find((item) => item.id === presetId); if (!preset) return
    updateStage(index, (stage) => ({ ...stage, snapshot: asStaticScenario(cloneScenario(preset.scenario), ''), apply: defaultMask(), sourcePresetId: preset.id, sourceName: preset.name }))
  }
  const toggleField = (index: number, group: 'ventilator' | 'patient', key: string, checked: boolean) => updateStage(index, (stage) => { const apply = stage.apply ?? defaultMask(); const selected = new Set((apply[group] as string[]).map(String)); checked ? selected.add(key) : selected.delete(key); return { ...stage, apply: { ...apply, [group]: [...selected] } as DynamicScenarioApplyMask } })
  const setVent = (index: number, key: string, value: unknown) => updateStage(index, (stage) => ({ ...stage, sourcePresetId: undefined, sourceName: 'Manual settings', snapshot: { ...stage.snapshot, ventilator: { ...stage.snapshot.ventilator, [key]: value } } }))
  const setPatient = (index: number, key: string, value: unknown) => updateStage(index, (stage) => ({ ...stage, sourcePresetId: undefined, sourceName: 'Manual settings', snapshot: { ...stage.snapshot, patient: { ...stage.snapshot.patient, [key]: value } } }))

  const editor = (index: number, field: FieldSpec, value: unknown, enabled: boolean, group: 'ventilator' | 'patient') => {
    const setValue = (next: unknown) => group === 'ventilator' ? setVent(index, field.key, next) : setPatient(index, field.key, next)
    if (field.type === 'boolean') return <input className="dynamic-setting-value boolean" type="checkbox" checked={Boolean(value)} disabled={!enabled} onChange={(event) => setValue(event.target.checked)} />
    if (field.type === 'select') return <select className="dynamic-setting-value" value={String(value ?? '')} disabled={!enabled} onChange={(event) => setValue(field.key === 'mode' ? event.target.value as VentilatorMode : event.target.value)}>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
    return <input className="dynamic-setting-value" type="number" value={Number(value ?? 0)} disabled={!enabled} step={field.step ?? 1} min={field.min} max={field.max} onChange={(event) => setValue(Number(event.target.value))} />
  }
  const row = (index: number, field: FieldSpec, group: 'ventilator' | 'patient', values: Record<string, unknown>, selected: string[]) => { const enabled = selected.includes(field.key); return <div className={`dynamic-setting-row ${enabled ? 'enabled' : 'disabled'}`} key={field.key}><label className="dynamic-setting-enable"><input type="checkbox" checked={enabled} onChange={(event) => toggleField(index, group, field.key, event.target.checked)} /><span>{field.label}</span></label>{editor(index, field, values[field.key], enabled, group)}</div> }

  const reset = () => selectedPreset ? replaceDraft(fromPreset(selectedPreset)) : replaceDraft(newDraft(currentScenario))
  const save = async () => {
    if (!draft.name.trim()) { setMessage('Enter a scenario name.'); return }
    setBusy(true); setMessage(null)
    try {
      const base = asStaticScenario(cloneScenario(draft.stages[0]?.snapshot ?? currentScenario), '')
      const scenario: InstructorScenarioSnapshot = { ...base, schemaVersion: 3, kind: 'dynamic', description: draft.description.trim(), stages: draft.stages.map((stage) => ({ ...stage, snapshot: asStaticScenario(cloneScenario(stage.snapshot), '') })) }
      const saved = draft.id ? await updateInstructorPreset(draft.id, { name: draft.name, scenario }) : await createInstructorPreset(draft.name, scenario)
      replaceDraft(fromPreset(saved)); await onRefresh(); setMessage('Scenario saved.')
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Unable to save dynamic scenario.') } finally { setBusy(false) }
  }
  const remove = async () => {
    if (!draft.id || !window.confirm(`Delete dynamic scenario “${draft.name}”?`)) return
    setBusy(true)
    try { await deleteInstructorPreset(draft.id); await onRefresh(); const remaining = dynamicPresets.filter((preset) => preset.id !== draft.id); replaceDraft(remaining[0] ? fromPreset(remaining[0]) : newDraft(currentScenario)) }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Unable to delete dynamic scenario.') } finally { setBusy(false) }
  }

  return <div className="dynamic-file-manager">
    <aside className="dynamic-scenario-sidebar"><div className="dynamic-sidebar-heading"><span>Dynamic scenarios</span><strong>{dynamicPresets.length}</strong></div><div className="dynamic-scenario-list">{dynamicPresets.map((preset) => <button type="button" key={preset.id} className={draft.id === preset.id ? 'selected' : ''} onClick={() => selectScenario(preset)}><strong>{preset.name}</strong><small>{preset.scenario.stages?.length ?? 0} stages</small></button>)}<button type="button" className={`dynamic-add-scenario ${draft.id == null ? 'selected' : ''}`} onClick={addScenario}><strong>＋ Add scenario</strong></button></div></aside>
    <section className="dynamic-builder-pane">
      <div className="dynamic-scenario-header-block"><label><span>Dynamic scenario name</span><input value={draft.name} maxLength={80} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label><label><span>Instructor notes</span><textarea rows={3} maxLength={500} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label></div>
      <div className="dynamic-stage-stack">{draft.stages.map((stage, index) => { const apply = stage.apply ?? defaultMask(); const ventSelected = (apply.ventilator as string[]).map(String); const patientSelected = (apply.patient as string[]).map(String); return <div className="dynamic-stage-shell" key={`${index}-${stage.name}`}><article className="dynamic-stage-card"><div className="dynamic-stage-title-row"><div><span>Stage {index + 1}</span><input value={stage.name} onChange={(event) => updateStage(index, (current) => ({ ...current, name: event.target.value }))} placeholder={`Stage ${index + 1} name`} /></div>{draft.stages.length > 1 && <button type="button" className="dynamic-stage-remove" onClick={() => removeStage(index)} aria-label={`Delete Stage ${index + 1}`}>×</button>}</div><label className="dynamic-stage-source-row"><span>Source</span><select value={stage.sourcePresetId ?? ''} onChange={(event) => selectStageSource(index, event.target.value)}><option value="">Manual Vent / Patient / Physio settings</option>{staticPresets.length > 0 && <optgroup label="Static scenario presets">{staticPresets.map((preset) => <option value={preset.id} key={preset.id}>{preset.name}</option>)}</optgroup>}</select></label><div className="dynamic-stage-sections"><details open><summary>VENT <small>{ventSelected.length}/{VENT_FIELDS.length}</small></summary><div className="dynamic-setting-grid">{VENT_FIELDS.map((field) => row(index, field, 'ventilator', stage.snapshot.ventilator as unknown as Record<string, unknown>, ventSelected))}</div></details><details><summary>PATIENT <small>{PATIENT_FIELDS.filter((field) => patientSelected.includes(field.key)).length}/{PATIENT_FIELDS.length}</small></summary><div className="dynamic-setting-grid">{PATIENT_FIELDS.map((field) => row(index, field, 'patient', stage.snapshot.patient as unknown as Record<string, unknown>, patientSelected))}</div></details><details><summary>PHYSIO <small>{PHYSIO_FIELDS.filter((field) => patientSelected.includes(field.key)).length}/{PHYSIO_FIELDS.length}</small></summary><div className="dynamic-setting-grid">{PHYSIO_FIELDS.map((field) => row(index, field, 'patient', stage.snapshot.patient as unknown as Record<string, unknown>, patientSelected))}</div></details></div></article><button type="button" className="dynamic-add-stage" onClick={() => insertStage(index)} aria-label={`Add stage after Stage ${index + 1}`}>＋</button></div> })}</div>
      {message && <div className="account-message">{message}</div>}
      <footer className="dynamic-builder-footer"><button type="button" className="scenario-delete-button" disabled={busy || !draft.id} onClick={() => void remove()}>Delete scenario</button><button type="button" disabled={busy || !dirty} onClick={reset}>Reset scenario</button><span /><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="account-primary-button" disabled={busy || !draft.name.trim()} onClick={() => void save()}>{busy ? 'Saving…' : 'Save scenario'}</button></footer>
    </section>
  </div>
}
