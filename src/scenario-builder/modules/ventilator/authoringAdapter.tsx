import type { ReactNode } from 'react'
import {
  createFullDynamicStageApplyMask,
  dynamicBranchTriggerMode,
  dynamicBranchTriggers,
  type DynamicScenarioActionId,
  type DynamicScenarioMetric,
  type DynamicScenarioTrigger,
  type InstructorScenarioSnapshot,
} from '../../../instructorAccount'
import type { ScenarioVariableDefinition } from '../../model'
import { VENTILATOR_SCENARIO_MODULE } from './definition'
import type {
  SharedScenarioAuthoringBranch,
  SharedScenarioAuthoringDocument,
  SharedScenarioAuthoringTrigger,
  SharedScenarioEditorAdapter,
} from '../../../teaching/scenario/authoringTypes'
import type { SharedScenarioTransition } from '../../../teaching/scenario/authoringTypes'

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }

function getPath(snapshot: InstructorScenarioSnapshot, id: string): unknown {
  const [group, key] = id.split('.')
  if (group === 'ventilator') return (snapshot.ventilator as unknown as Record<string, unknown>)[key]
  if (group === 'patient') return (snapshot.patient as unknown as Record<string, unknown>)[key]
  return undefined
}

function setPath(snapshot: InstructorScenarioSnapshot, id: string, value: unknown): InstructorScenarioSnapshot {
  const next = clone(snapshot)
  const [group, key] = id.split('.')
  if (group === 'ventilator') (next.ventilator as unknown as Record<string, unknown>)[key] = value
  if (group === 'patient') (next.patient as unknown as Record<string, unknown>)[key] = value
  return next
}

function VariableInput({ variable, value, onChange, disabled = false }: { variable: ScenarioVariableDefinition; value: unknown; onChange: (value: unknown) => void; disabled?: boolean }) {
  if (variable.type === 'boolean') return <select disabled={disabled} value={value ? 'true' : 'false'} onChange={(event) => onChange(event.target.value === 'true')}><option value="true">On</option><option value="false">Off</option></select>
  if (variable.type === 'select') return <select disabled={disabled} value={String(value ?? '')} onChange={(event) => onChange(event.target.value)}>{variable.options?.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}</select>
  if (variable.type === 'number') {
    const isFio2 = variable.id === 'ventilator.fio2'
    const numericValue = typeof value === 'number' ? value : 0
    return <input
      className="shared-scenario-control-slider"
      type="range"
      min={isFio2 ? 21 : variable.min}
      max={isFio2 ? 100 : variable.max}
      step={isFio2 ? 1 : (variable.step ?? 1)}
      value={isFio2 ? Math.round(numericValue * 100) : numericValue}
      disabled={disabled}
      onChange={(event) => onChange(isFio2 ? Number(event.target.value) / 100 : Number(event.target.value))}
    />
  }
  return <input disabled={disabled} value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} />
}

function variablePalette(variable: ScenarioVariableDefinition) {
  if (variable.id.startsWith('ventilator.')) return 'vent'
  if (variable.group.toLowerCase().includes('phys')) return 'physio'
  return 'patient'
}

function displayVariableValue(variable: ScenarioVariableDefinition, value: unknown) {
  if (variable.type === 'boolean') return value ? 'On' : 'Off'
  if (variable.type === 'select') return variable.options?.find((option) => String(option.value) === String(value))?.label ?? String(value ?? '')
  if (variable.id === 'ventilator.fio2' && typeof value === 'number') return `${Math.round(value * 100)}%`
  return `${typeof value === 'number' ? Number(value.toFixed(3)) : value ?? ''}${variable.unit ? ` ${variable.unit}` : ''}`
}

function allWritableVariableIds() {
  return VENTILATOR_SCENARIO_MODULE.variables
    .filter((variable) => variable.role === 'setting' && variable.writable)
    .map((variable) => variable.id)
}

function isVentilatorVariableRelevant(variable: ScenarioVariableDefinition, snapshot: InstructorScenarioSnapshot) {
  if (!variable.id.startsWith('ventilator.')) return true
  const key = variable.id.slice('ventilator.'.length)
  const mode = snapshot.ventilator.mode
  const isSimv = mode === 'SIMV-VC' || mode === 'SIMV-PC'
  const isVolumeMandatory = mode === 'VC-AC' || mode === 'SIMV-VC'
  const isPressureMandatory = mode === 'PC-AC' || mode === 'SIMV-PC'

  if (key === 'mode' || key === 'fio2') return true
  if (mode === 'APRV') return ['pHigh', 'pLow', 'tHigh', 'tLow'].includes(key)
  if (mode === 'BIPAP') return ['pressureControl', 'peep', 'rate', 'inspiratoryTime', 'triggerType', snapshot.ventilator.triggerType === 'flow' ? 'flowTriggerSensitivity' : 'triggerSensitivity'].includes(key)

  if (['pHigh', 'pLow', 'tHigh', 'tLow'].includes(key)) return false
  if (key === 'peep') return true
  if (key === 'rate') return mode !== 'PSV'
  if (key === 'tidalVolume') return isVolumeMandatory || mode === 'VG-PC'
  if (key === 'inspiratoryTime') return mode !== 'PSV'
  if (key === 'inspiratoryFlow' || key === 'plateauPercent') return isVolumeMandatory
  if (key === 'pressureControl') return isPressureMandatory
  if (key === 'volumeGuaranteePressureLimit') return mode === 'VG-PC'
  if (key === 'pressureSupport' || key === 'terminationSensitivity') return mode === 'PSV' || isSimv
  if (key === 'simvSyncWindowPercent' || key === 'showSimvSyncWindow') return isSimv
  if (key === 'triggerType') return true
  if (key === 'triggerSensitivity') return snapshot.ventilator.triggerType !== 'flow'
  if (key === 'flowTriggerSensitivity') return snapshot.ventilator.triggerType === 'flow'
  return true
}

function variableIdsFromApplyMask(stage: { apply?: { ventilator: Array<string | number | symbol>; patient: Array<string | number | symbol> } }) {
  if (!stage.apply) return allWritableVariableIds()
  return [
    ...stage.apply.ventilator.map((key) => `ventilator.${String(key)}`),
    ...stage.apply.patient.map((key) => `patient.${String(key)}`),
  ]
}

function sharedTransitionOverrides(stage: { transitionOverrides?: { ventilator?: Record<string, import('../../../instructorAccount').DynamicScenarioTransition>; patient?: Record<string, import('../../../instructorAccount').DynamicScenarioTransition> } }) {
  const overrides: Record<string, SharedScenarioTransition> = {}
  Object.entries(stage.transitionOverrides?.ventilator ?? {}).forEach(([key, value]) => { overrides[`ventilator.${key}`] = value })
  Object.entries(stage.transitionOverrides?.patient ?? {}).forEach(([key, value]) => { overrides[`patient.${key}`] = value })
  return overrides
}

function dynamicTransitionOverrides(overrides: Record<string, SharedScenarioTransition> | undefined) {
  const ventilator: Record<string, SharedScenarioTransition> = {}
  const patient: Record<string, SharedScenarioTransition> = {}
  Object.entries(overrides ?? {}).forEach(([id, value]) => {
    if (id.startsWith('ventilator.')) ventilator[id.slice('ventilator.'.length)] = value
    if (id.startsWith('patient.')) patient[id.slice('patient.'.length)] = value
  })
  return { ventilator, patient }
}

function applyMaskFromVariableIds(snapshot: InstructorScenarioSnapshot, ids: readonly string[]) {
  const full = createFullDynamicStageApplyMask(snapshot)
  const selected = new Set(ids)
  return {
    ...full,
    ventilator: full.ventilator.filter((key) => selected.has(`ventilator.${String(key)}`)),
    patient: full.patient.filter((key) => selected.has(`patient.${String(key)}`)),
    alarmLimits: [],
    patientTransitionSeconds: false,
    waveformDisplay: false,
    mediaIds: false,
  }
}

function SnapshotEditor({ snapshot, onChange, appliedVariableIds, onAppliedVariableIdsChange }: {
  snapshot: InstructorScenarioSnapshot
  onChange: (snapshot: InstructorScenarioSnapshot) => void
  appliedVariableIds?: string[]
  onAppliedVariableIdsChange?: (ids: string[]) => void
}) {
  const writable = VENTILATOR_SCENARIO_MODULE.variables.filter((variable) => variable.role === 'setting' && variable.writable)
  const groups = [...new Set(writable.map((variable) => variable.group))]
  const selected = new Set(appliedVariableIds ?? allWritableVariableIds())
  const setApplied = (id: string, enabled: boolean) => {
    const next = new Set(selected)
    if (enabled) next.add(id)
    else next.delete(id)
    onAppliedVariableIdsChange?.([...next])
  }
  return <div className="shared-scenario-eduvent-snapshot">
    {groups.map((group) => {
      const variables = writable.filter((variable) => variable.group === group && isVentilatorVariableRelevant(variable, snapshot))
      if (!variables.length) return null
      const palette = variablePalette(variables[0])
      return <section key={group} className={`shared-scenario-control-group ${palette}`}><h3>{group}</h3><div className="shared-scenario-slider-grid">{variables.map((variable) => {
        const value = getPath(snapshot, variable.id)
        const applied = selected.has(variable.id)
        return <div className={`shared-scenario-variable-row ${variable.type === 'number' ? 'slider' : ''} ${applied ? 'applied' : 'not-applied'}`} key={variable.id}>
          <div className="shared-scenario-variable-heading">
            <label className="shared-scenario-apply-toggle" title={applied ? 'This value will be applied on stage entry' : 'This value will be left unchanged on stage entry'}>
              <input type="checkbox" checked={applied} onChange={(event) => setApplied(variable.id, event.target.checked)} />
              <span>Apply</span>
            </label>
            <span className="shared-scenario-variable-label">{variable.label}</span>
            <strong>{displayVariableValue(variable, value)}</strong>
          </div>
          <VariableInput variable={variable} value={value} disabled={!applied} onChange={(next) => onChange(setPath(snapshot, variable.id, next))} />
        </div>
      })}</div></section>
    })}
  </div>
}
function triggerToShared(trigger: DynamicScenarioTrigger): SharedScenarioAuthoringTrigger {
  const id = crypto.randomUUID()
  if (trigger.type === 'manual' || trigger.type === 'question-any' || trigger.type === 'question-correct') return { id, type: trigger.type }
  if (trigger.type === 'time') return { id, type: 'time', seconds: trigger.seconds }
  if (trigger.type === 'condition') return { id, type: 'condition', metric: trigger.metric, operator: trigger.operator, value: trigger.value }
  if (trigger.type === 'action') return { id, type: 'action', parameter: `ventilator.${String(trigger.parameter)}`, actor: trigger.actor }
  if (trigger.type === 'patient-change') return { id, type: 'action', parameter: `patient.${String(trigger.parameter)}`, actor: trigger.actor }
  return { id, type: 'action', parameter: `device.${trigger.action}`, actor: trigger.actor }
}

function sharedToTrigger(trigger: SharedScenarioAuthoringTrigger): DynamicScenarioTrigger {
  if (trigger.type === 'manual' || trigger.type === 'question-any' || trigger.type === 'question-correct') return { type: trigger.type }
  if (trigger.type === 'time') return { type: 'time', seconds: trigger.seconds }
  if (trigger.type === 'condition') return { type: 'condition', metric: trigger.metric as DynamicScenarioMetric, operator: trigger.operator, value: trigger.value }
  if (trigger.parameter.startsWith('patient.')) return { type: 'patient-change', parameter: trigger.parameter.slice(8) as keyof InstructorScenarioSnapshot['patient'], actor: trigger.actor }
  if (trigger.parameter.startsWith('device.')) return { type: 'device-action', action: trigger.parameter.slice(7) as DynamicScenarioActionId, actor: trigger.actor }
  return { type: 'action', parameter: trigger.parameter.replace(/^ventilator\./, '') as keyof InstructorScenarioSnapshot['ventilator'], actor: trigger.actor }
}

function sharedPath(fromStageId: string, toStageId: string, triggers: DynamicScenarioTrigger[], priority: number, label = 'Continue'): SharedScenarioAuthoringBranch {
  const converted = triggers.map(triggerToShared)
  const fallback = converted[0] ?? triggerToShared({ type: 'manual' })
  return { id: crypto.randomUUID(), fromStageId, toStageId, trigger: fallback, triggers: converted.length ? converted : [fallback], triggerMode: 'any', priority, label, enabled: true }
}

export function createVentilatorAuthoringAdapter(seed: InstructorScenarioSnapshot): SharedScenarioEditorAdapter<InstructorScenarioSnapshot, InstructorScenarioSnapshot> {
  const writable = VENTILATOR_SCENARIO_MODULE.variables.filter((variable) => variable.role === 'setting' && variable.writable)
  return {
    product: 'eduvent',
    productLabel: 'EDUVENT',
    emptySnapshot: () => clone(seed),
    conditionMetrics: VENTILATOR_SCENARIO_MODULE.variables.filter((variable) => variable.role === 'measurement').map((variable) => ({ id: variable.id.replace(/^measurement\./, ''), label: variable.label })),
    actionParameters: [
      ...writable.map((variable) => ({ id: variable.id, label: variable.label })),
      { id: 'device.freeze-waveform', label: 'Freeze waveform' },
      { id: 'device.inspiratory-hold', label: 'Inspiratory hold' },
      { id: 'device.expiratory-hold', label: 'Expiratory hold' },
      { id: 'device.oxygen-flush', label: 'Oxygen flush' },
      { id: 'device.nebulisation', label: 'Nebulisation' },
    ],
    defaultAppliedVariableIds: () => allWritableVariableIds(),
    transitionVariables: (snapshot) => writable.filter((variable) => variable.type === 'number' && isVentilatorVariableRelevant(variable, snapshot)).map((variable) => ({ id: variable.id, label: variable.label })),
    renderSnapshotEditor: (snapshot, onChange, options): ReactNode => <SnapshotEditor snapshot={snapshot} onChange={onChange} appliedVariableIds={options?.appliedVariableIds} onAppliedVariableIdsChange={options?.onAppliedVariableIdsChange} />,
    toDocument: (name, scenario) => {
      const dynamic = (scenario.kind ?? 'static') === 'dynamic' && scenario.stages?.length
      const sourceStages = dynamic ? scenario.stages! : [{ id: crypto.randomUUID(), name: 'Initial state', comment: '', stageType: 'controls' as const, snapshot: scenario, advanceTriggers: [] as DynamicScenarioTrigger[] }]
      const stages = sourceStages.map((stage, index) => ({
        id: stage.id ?? `stage-${index}`,
        name: stage.name || `Stage ${index + 1}`,
        notes: stage.comment ?? '',
        kind: (stage.stageType ?? 'controls') === 'controls' ? 'state' as const : stage.stageType as 'media' | 'question',
        snapshot: stage.snapshot,
        appliedVariableIds: variableIdsFromApplyMask(stage),
        transition: stage.transition ?? { mode: 'immediate' as const },
        transitionOverrides: sharedTransitionOverrides(stage),
        triggers: [] as SharedScenarioAuthoringTrigger[],
        media: stage.media ? { ...stage.media, mediaId: stage.media.mediaId ?? stage.media.storagePath } : undefined,
        question: stage.question,
      }))
      const paths: SharedScenarioAuthoringBranch[] = (scenario.branches ?? []).map((branch) => {
        const triggers = dynamicBranchTriggers(branch).map(triggerToShared)
        const fallback = triggers[0] ?? triggerToShared({ type: 'manual' })
        return { id: branch.id, fromStageId: branch.fromStageId, toStageId: branch.toStageId, trigger: fallback, triggers: triggers.length ? triggers : [fallback], triggerMode: dynamicBranchTriggerMode(branch), priority: branch.priority, label: branch.label, enabled: branch.enabled }
      })
      if ((scenario.schemaVersion ?? 0) < 9) {
        sourceStages.slice(0, -1).forEach((stage, index) => {
          const fromStageId = stages[index]?.id
          const toStageId = stages[index + 1]?.id
          if (!fromStageId || !toStageId) return
          const triggers = stage.advanceTriggers?.length ? stage.advanceTriggers : [stage.advanceTrigger ?? { type: 'manual' } as DynamicScenarioTrigger]
          paths.push(sharedPath(fromStageId, toStageId, triggers, 1000 + index))
        })
      }
      return { schemaVersion: 1, product: 'eduvent', name, description: scenario.description ?? '', stages, branches: paths }
    },
    fromDocument: (document: SharedScenarioAuthoringDocument<InstructorScenarioSnapshot>) => {
      const first = clone(document.stages[0]?.snapshot ?? seed)
      const dynamic = document.stages.length > 1 || document.branches.length > 0 || document.stages.some((stage) => stage.kind !== 'state')
      if (!dynamic) return { ...first, schemaVersion: 2, kind: 'static', description: document.description, stages: undefined, branches: undefined }
      return {
        ...first,
        schemaVersion: 9,
        kind: 'dynamic',
        description: document.description,
        stages: document.stages.map((stage) => ({
          id: stage.id,
          name: stage.name,
          comment: stage.notes,
          stageType: stage.kind === 'state' ? 'controls' : stage.kind,
          media: stage.media ? { ...stage.media, mediaId: stage.media.mediaId ?? stage.media.storagePath } : undefined,
          question: stage.question,
          transition: stage.transition ?? { mode: 'immediate' },
          transitionOverrides: dynamicTransitionOverrides(stage.transitionOverrides),
          snapshot: clone(stage.snapshot),
          apply: applyMaskFromVariableIds(stage.snapshot, stage.appliedVariableIds ?? allWritableVariableIds()),
          advanceTrigger: { type: 'manual' },
          advanceTriggers: [{ type: 'manual' }],
        })),
        branches: document.branches.map((branch) => {
          const sharedTriggers = branch.triggers?.length ? branch.triggers : [branch.trigger]
          const triggers = sharedTriggers.map(sharedToTrigger)
          const fallback: DynamicScenarioTrigger = triggers[0] ?? { type: 'manual' }
          return { id: branch.id, fromStageId: branch.fromStageId, toStageId: branch.toStageId, trigger: fallback, triggers: triggers.length ? triggers : [fallback], triggerMode: branch.triggerMode === 'all' ? 'all' : 'any', priority: branch.priority, label: branch.label, enabled: branch.enabled }
        }),
      }
    },
  }
}
