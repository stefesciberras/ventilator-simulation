import type { ReactNode } from 'react'
import { DEFAULT_MONITOR_STATE, type MonitorVentilationMode } from '../../../edumon/types'
import { calculateConfiguredVdVtFromValues } from '../../../patientMetrics'
import { listEdusimActions } from '../../../edumon/actionLibrary'
import type { EdumonScenarioMetric, EdumonScenarioSnapshot, EdumonScenarioTrigger, EdumonStoredScenario } from '../../../edumon/scenarioTypes'
import type { ScenarioProductId } from '../../../teaching/scenario/products'
import type {
  SharedScenarioAuthoringDocument,
  SharedScenarioAuthoringTrigger,
  SharedScenarioEditorAdapter,
  SharedScenarioTriggerRegistryItem,
} from '../../../teaching/scenario/authoringTypes'
import type { TeachingScenarioStageContent } from '../../../teaching/scenario/runtimeCore'
import type { ScenarioVariableDefinition } from '../../model'
import {
  EDUMON_PATIENT_GROUP_ORDER,
  getEdumonScenarioModule,
  readScenarioSnapshotValue,
  scenarioTriggerVariables,
  transitionScenarioVariables,
  writableScenarioVariables,
  writeScenarioSnapshotValue,
} from './definition'

type EdumonScenarioProduct = Extract<ScenarioProductId, 'anaesth' | 'icu'>

function normalizeLegacyDeadSpaceSnapshot(snapshot: EdumonScenarioSnapshot): EdumonScenarioSnapshot {
  const respiratory = snapshot.patient.respiratory
  if (!respiratory || respiratory.vdVt != null || respiratory.deadSpaceMl == null) return snapshot
  const referenceTidalVolumeMl = respiratory.tidalVolumeMl ?? respiratory.spontaneousTidalVolumeMl ?? 500
  return {
    ...snapshot,
    patient: {
      ...snapshot.patient,
      respiratory: {
        ...respiratory,
        vdVt: calculateConfiguredVdVtFromValues(undefined, respiratory.deadSpaceMl, referenceTidalVolumeMl),
      },
    },
  }
}

function normalizeLegacyAppliedVariableIds(ids: string[] | undefined): string[] | undefined {
  if (!ids) return ids
  return [...new Set(ids.map((id) => id === 'deadSpaceMl' ? 'vdVt' : id))]
}

function clinicalGroupClass(group: string) {
  if (group === 'Patient') return 'patient'
  if (group === 'Cardiovascular') return 'cardiovascular'
  if (group === 'Respiratory') return 'respiratory'
  if (group === 'Ventilation') return 'ventilation'
  if (group === 'Metabolism') return 'metabolism'
  if (group === 'Anaesthesia') return 'anaesthesia'
  return 'monitor'
}

const ventilationVariablesByMode: Record<MonitorVentilationMode, ReadonlySet<string>> = {
  MANUAL: new Set(['ventilatorMode', 'fio2', 'peepCmH2O']),
  'VC-AC': new Set([
    'ventilatorMode',
    'fio2',
    'peepCmH2O',
    'ventilatorSetRate',
    'ventilatorSetTidalVolumeMl',
    'ventilatorInspiratoryTimeSeconds',
    'ventilatorInspiratoryFlowLMin',
    'ventilatorPlateauPercent',
  ]),
  'PC-AC': new Set([
    'ventilatorMode',
    'fio2',
    'peepCmH2O',
    'ventilatorSetRate',
    'ventilatorInspiratoryTimeSeconds',
    'ventilatorPressureControlCmH2O',
  ]),
  PSV: new Set([
    'ventilatorMode',
    'fio2',
    'peepCmH2O',
    'ventilatorPressureSupportCmH2O',
    'ventilatorTerminationSensitivityPercent',
  ]),
  'SIMV-VC': new Set([
    'ventilatorMode',
    'fio2',
    'peepCmH2O',
    'ventilatorSetRate',
    'ventilatorSetTidalVolumeMl',
    'ventilatorInspiratoryTimeSeconds',
    'ventilatorInspiratoryFlowLMin',
    'ventilatorPlateauPercent',
    'ventilatorPressureSupportCmH2O',
    'ventilatorTerminationSensitivityPercent',
    'ventilatorSimvSyncWindowPercent',
  ]),
  'SIMV-PC': new Set([
    'ventilatorMode',
    'fio2',
    'peepCmH2O',
    'ventilatorSetRate',
    'ventilatorInspiratoryTimeSeconds',
    'ventilatorPressureControlCmH2O',
    'ventilatorPressureSupportCmH2O',
    'ventilatorTerminationSensitivityPercent',
    'ventilatorSimvSyncWindowPercent',
  ]),
  'VG-PC': new Set([
    'ventilatorMode',
    'fio2',
    'peepCmH2O',
    'ventilatorSetRate',
    'ventilatorSetTidalVolumeMl',
    'ventilatorInspiratoryTimeSeconds',
    'ventilatorVolumeGuaranteePressureLimitCmH2O',
  ]),
}

function ventilationVariableVisible(variable: ScenarioVariableDefinition, snapshot: EdumonScenarioSnapshot) {
  if (variable.group !== 'Ventilation') return true
  const mode = (snapshot.patient.respiratory?.ventilatorMode ?? 'MANUAL') as MonitorVentilationMode
  return (ventilationVariablesByMode[mode] ?? ventilationVariablesByMode.MANUAL).has(variable.id)
}

function displayValue(variable: ScenarioVariableDefinition, value: unknown) {
  if (variable.type === 'select') return variable.options?.find((option) => option.value === String(value))?.label ?? String(value ?? '')
  if (variable.type === 'boolean') return value ? 'On' : 'Off'
  if (typeof value === 'number') {
    const decimals = variable.step != null && variable.step < 1 ? Math.max(0, String(variable.step).split('.')[1]?.length ?? 0) : 0
    return `${value.toFixed(decimals)}${variable.unit ? ` ${variable.unit}` : ''}`
  }
  return String(value ?? '')
}

function RegistryVariableControl({
  variable,
  snapshot,
  applied,
  onAppliedChange,
  onChange,
}: {
  variable: ScenarioVariableDefinition
  snapshot: EdumonScenarioSnapshot
  applied: boolean
  onAppliedChange: (id: string, applied: boolean) => void
  onChange: (snapshot: EdumonScenarioSnapshot) => void
}) {
  const value = readScenarioSnapshotValue(snapshot, variable)
  const effectiveValue = value ?? variable.defaultValue ?? (variable.type === 'number' ? variable.min ?? 0 : undefined)
  const set = (next: unknown) => onChange(writeScenarioSnapshotValue(snapshot, variable, next))

  return <div className={`shared-scenario-variable-row ${variable.type === 'number' ? 'slider' : ''} ${applied ? 'applied' : 'not-applied'}`}>
    <div className="shared-scenario-variable-heading">
      <label className="shared-scenario-apply-toggle"><input type="checkbox" checked={applied} onChange={(event) => onAppliedChange(variable.id, event.target.checked)} /><span>Apply</span></label>
      <span className="shared-scenario-variable-label">{variable.label}</span>
      <strong>{displayValue(variable, effectiveValue)}</strong>
    </div>
    {variable.type === 'number' && <input disabled={!applied} className="shared-scenario-control-slider" type="range" min={variable.min ?? 0} max={variable.max ?? 100} step={variable.step ?? 1} value={typeof effectiveValue === 'number' ? effectiveValue : Number(variable.defaultValue ?? variable.min ?? 0)} onChange={(event) => set(Number(event.target.value))} />}
    {variable.type === 'select' && <select disabled={!applied} value={String(effectiveValue ?? '')} onChange={(event) => set(typeof effectiveValue === 'number' ? Number(event.target.value) : event.target.value)}>{variable.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>}
    {variable.type === 'boolean' && <label className="shared-scenario-boolean-control"><input disabled={!applied} type="checkbox" checked={Boolean(effectiveValue)} onChange={(event) => set(event.target.checked)} /><span>{effectiveValue ? 'Enabled' : 'Disabled'}</span></label>}
    {variable.type === 'string' && <input disabled={!applied} type="text" value={String(effectiveValue ?? '')} onChange={(event) => set(event.target.value)} />}
  </div>
}

function SnapshotEditor({ product, snapshot, onChange, appliedVariableIds, onAppliedVariableIdsChange }: { product: EdumonScenarioProduct; snapshot: EdumonScenarioSnapshot; onChange: (snapshot: EdumonScenarioSnapshot) => void; appliedVariableIds?: string[]; onAppliedVariableIdsChange?: (ids: string[]) => void }) {
  const module = getEdumonScenarioModule(product)
  const editable = writableScenarioVariables(module).filter((variable) => variable.snapshotPath?.startsWith('patient.'))
  const visibleEditable = editable.filter((variable) => ventilationVariableVisible(variable, snapshot))
  const selected = new Set(appliedVariableIds ?? editable.map((variable) => variable.id))
  const setApplied = (id: string, enabled: boolean) => { const next = new Set(selected); if (enabled) next.add(id); else next.delete(id); onAppliedVariableIdsChange?.([...next]) }
  const groups = EDUMON_PATIENT_GROUP_ORDER.filter((group) => visibleEditable.some((variable) => variable.group === group))

  return <div className="shared-scenario-eduvent-snapshot shared-scenario-edumon-snapshot">
    {groups.map((group) => <section key={group} className={`shared-scenario-control-group ${clinicalGroupClass(group)}`}>
      <h3>{group}</h3>
      <div className="shared-scenario-slider-grid">
        {visibleEditable.filter((variable) => variable.group === group).map((variable) => <RegistryVariableControl key={variable.id} variable={variable} snapshot={snapshot} applied={selected.has(variable.id)} onAppliedChange={setApplied} onChange={onChange} />)}
      </div>
    </section>)}
  </div>
}

function toSharedTrigger(trigger: EdumonScenarioTrigger): SharedScenarioAuthoringTrigger {
  const id = crypto.randomUUID()
  if (trigger.type === 'manual' || trigger.type === 'question-any' || trigger.type === 'question-correct' || trigger.type === 'media-ended' || trigger.type === 'media-acknowledged') return { id, type: trigger.type }
  if (trigger.type === 'time') return { id, type: 'time', seconds: trigger.seconds }
  if (trigger.type === 'condition') return { id, type: 'condition', metric: trigger.metric, operator: trigger.operator, value: trigger.value }
  if (trigger.type === 'edusim-action') return { id, type: 'edusim-action', actionId: trigger.actionId, actor: trigger.actor ?? 'candidate' }
  if (trigger.type === 'parameter-change') return { id, type: 'action', parameter: trigger.parameterId, actor: trigger.actor ?? 'either' }
  return { id, type: 'action', parameter: String(trigger.parameter), actor: trigger.actor ?? 'either' }
}

function fromSharedTrigger(trigger: SharedScenarioAuthoringTrigger, module = getEdumonScenarioModule('anaesth')): EdumonScenarioTrigger {
  if (trigger.type === 'manual' || trigger.type === 'question-any' || trigger.type === 'question-correct' || trigger.type === 'media-ended' || trigger.type === 'media-acknowledged') return { type: trigger.type }
  if (trigger.type === 'time') return { type: 'time', seconds: trigger.seconds }
  if (trigger.type === 'condition') return { type: 'condition', metric: trigger.metric as EdumonScenarioMetric, operator: trigger.operator, value: trigger.value }
  if (trigger.type === 'edusim-action') return { type: 'edusim-action', actionId: trigger.actionId, actor: trigger.actor }
  const variable = module.variables.find((item) => item.id === trigger.parameter)
  if (variable?.snapshotPath) return { type: 'parameter-change', parameterId: variable.id, snapshotPath: variable.snapshotPath, actor: trigger.actor }
  return { type: 'patient-change', parameter: trigger.parameter as keyof EdumonScenarioSnapshot['patient'], actor: trigger.actor }
}

function contentKind(content: TeachingScenarioStageContent | undefined) {
  return content?.kind ?? 'state'
}

export function createEdumonAuthoringAdapter(product: EdumonScenarioProduct, productLabel: string): SharedScenarioEditorAdapter<EdumonStoredScenario, EdumonScenarioSnapshot> {
  const module = getEdumonScenarioModule(product)
  const editableVariables = writableScenarioVariables(module).filter((variable) => variable.snapshotPath?.startsWith('patient.'))
  const appliedIds = editableVariables.map((variable) => variable.id)
  const measurementVariables = scenarioTriggerVariables(module, 'measurement')
  const actionVariables = scenarioTriggerVariables(module, 'candidate-action')
  const triggerRegistry: SharedScenarioTriggerRegistryItem[] = [
    { id: 'runtime:manual', label: 'Instructor choice', group: 'Runtime', kind: 'manual' },
    { id: 'runtime:time', label: 'Time passed', group: 'Runtime', kind: 'time' },
    ...measurementVariables.map((variable) => ({ id: `measurement:${variable.id}`, label: variable.label, group: variable.group, kind: 'measurement' as const, metric: variable.id, unit: variable.unit })),
    ...actionVariables.map((variable) => ({ id: `parameter-change:${variable.id}`, label: `${variable.label} changed`, group: variable.group, kind: 'parameter-change' as const, parameter: variable.id, actors: ['candidate', 'instructor', 'either'] as const })),
  ]

  return {
    product,
    productLabel,
    emptySnapshot: () => ({ patient: { ...DEFAULT_MONITOR_STATE }, simulationPaused: false, simulationSpeed: 1 }),
    defaultAppliedVariableIds: () => [...appliedIds],
    transitionVariables: () => transitionScenarioVariables(module).map((variable) => ({ id: variable.id, label: variable.label, group: variable.group })),
    conditionMetrics: measurementVariables.map((variable) => ({ id: variable.id, label: variable.label, group: variable.group })),
    triggerRegistry,
    loadEdusimActionChoices: async () => {
      const environment = product === 'icu' ? 'edumon-icu' : 'edumon-ana'
      return (await listEdusimActions(environment)).map((action) => ({ id: action.id, label: action.name, kind: action.kind, group: action.kind === 'drug' ? 'Drugs' : 'Events' }))
    },
    actionParameters: actionVariables.map((variable) => ({ id: variable.id, label: `${variable.label} changed`, group: variable.group })),
    renderSnapshotEditor: (snapshot, onChange, options): ReactNode => <SnapshotEditor product={product} snapshot={snapshot} onChange={onChange} appliedVariableIds={options?.appliedVariableIds} onAppliedVariableIdsChange={options?.onAppliedVariableIdsChange} />,
    toDocument: (name, scenario) => ({
      schemaVersion: 1,
      product,
      name,
      description: scenario.description ?? '',
      supportedModes: scenario.supportedModes,
      stages: scenario.definition.stages.map((stage, index) => ({
        id: stage.id,
        name: stage.name || `Stage ${index + 1}`,
        notes: stage.notes ?? '',
        kind: contentKind(stage.content),
        snapshot: normalizeLegacyDeadSpaceSnapshot(stage.snapshot),
        appliedVariableIds: normalizeLegacyAppliedVariableIds(stage.appliedVariableIds) ?? [...appliedIds],
        transition: stage.transition ?? { mode: 'immediate' as const },
        transitionOverrides: stage.transitionOverrides ?? {},
        triggers: [],
        media: stage.content?.kind === 'media' ? stage.content.media : undefined,
        question: stage.content?.kind === 'question' ? stage.content.question : undefined,
      })),
      branches: [
        ...(scenario.definition.branches ?? []).map((branch, index) => ({
          id: branch.id ?? `branch-${index}`,
          fromStageId: branch.fromStageId ?? scenario.definition.stages[0]?.id ?? '',
          toStageId: branch.toStageId,
          trigger: toSharedTrigger(branch.trigger),
          triggers: (branch.triggers?.length ? branch.triggers : [branch.trigger]).map(toSharedTrigger),
          triggerMode: branch.triggerMode === 'all' ? 'all' as const : 'any' as const,
          priority: branch.priority ?? index,
          label: branch.label,
          enabled: branch.enabled,
        })),
        ...scenario.definition.stages.slice(0, -1).map((stage, index) => {
          const triggers = stage.triggers.length ? stage.triggers.map(toSharedTrigger) : [{ id: crypto.randomUUID(), type: 'manual' as const }]
          return { id: `continue-${stage.id}`, fromStageId: stage.id, toStageId: scenario.definition.stages[index + 1].id, trigger: triggers[0], triggers, triggerMode: 'any' as const, priority: 1000 + index, label: 'Continue', enabled: true }
        }),
      ],
    }),
    fromDocument: (document: SharedScenarioAuthoringDocument<EdumonScenarioSnapshot>) => ({
      schemaVersion: 3,
      kind: document.stages.length > 1 || document.branches.length > 0 || document.stages.some((stage) => stage.kind !== 'state') ? 'dynamic' : 'static',
      description: document.description,
      supportedModes: document.supportedModes,
      definition: {
        id: `edumon-${crypto.randomUUID()}`,
        name: document.name,
        description: document.description,
        stages: document.stages.map((stage) => ({
          id: stage.id,
          name: stage.name,
          notes: stage.notes,
          snapshot: stage.snapshot,
          appliedVariableIds: stage.appliedVariableIds,
          transition: stage.transition ?? { mode: 'immediate' },
          transitionOverrides: stage.transitionOverrides ?? {},
          triggers: [{ type: 'manual' }],
          content: stage.kind === 'media' && stage.media
            ? { kind: 'media', media: stage.media }
            : stage.kind === 'question' && stage.question
              ? { kind: 'question', question: stage.question }
              : { kind: 'state' },
        })),
        branches: document.branches.map((branch) => ({
          id: branch.id,
          fromStageId: branch.fromStageId,
          toStageId: branch.toStageId,
          trigger: fromSharedTrigger(branch.trigger, module),
          triggers: (branch.triggers?.length ? branch.triggers : [branch.trigger]).map((trigger) => fromSharedTrigger(trigger, module)),
          triggerMode: branch.triggerMode === 'all' ? 'all' : 'any',
          priority: branch.priority,
          label: branch.label,
          enabled: branch.enabled,
        })),
      },
    }),
  }
}
