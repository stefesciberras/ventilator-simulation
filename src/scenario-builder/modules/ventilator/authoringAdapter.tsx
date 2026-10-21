import type { ReactNode } from 'react'
import {
  createFullDynamicStageApplyMask,
  type DynamicScenarioActionId,
  type DynamicScenarioMetric,
  type DynamicScenarioTrigger,
  type InstructorScenarioSnapshot,
} from '../../../instructorAccount'
import type { ScenarioVariableDefinition } from '../../model'
import { VENTILATOR_SCENARIO_MODULE } from './definition'
import type {
  SharedScenarioAuthoringDocument,
  SharedScenarioAuthoringTrigger,
  SharedScenarioEditorAdapter,
} from '../../../teaching/scenario/authoringTypes'

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

function VariableInput({ variable, value, onChange }: { variable: ScenarioVariableDefinition; value: unknown; onChange: (value: unknown) => void }) {
  if (variable.type === 'boolean') return <select value={value ? 'true' : 'false'} onChange={(event) => onChange(event.target.value === 'true')}><option value="true">On</option><option value="false">Off</option></select>
  if (variable.type === 'select') return <select value={String(value ?? '')} onChange={(event) => onChange(event.target.value)}>{variable.options?.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}</select>
  if (variable.type === 'number') return <input type="number" min={variable.min} max={variable.max} step={variable.step} value={typeof value === 'number' ? value : 0} onChange={(event) => onChange(Number(event.target.value))} />
  return <input value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} />
}

function SnapshotEditor({ snapshot, onChange }: { snapshot: InstructorScenarioSnapshot; onChange: (snapshot: InstructorScenarioSnapshot) => void }) {
  const writable = VENTILATOR_SCENARIO_MODULE.variables.filter((variable) => variable.role === 'setting' && variable.writable)
  const groups = [...new Set(writable.map((variable) => variable.group))]
  return <div className="shared-scenario-eduvent-snapshot">
    {groups.map((group) => <section key={group}><h3>{group}</h3><div className="scenario-builder-field-grid">{writable.filter((variable) => variable.group === group).map((variable) => <label key={variable.id}><span>{variable.label}{variable.unit ? ` · ${variable.unit}` : ''}</span><VariableInput variable={variable} value={getPath(snapshot, variable.id)} onChange={(value) => onChange(setPath(snapshot, variable.id, value))} /></label>)}</div></section>)}
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
    renderSnapshotEditor: (snapshot, onChange): ReactNode => <SnapshotEditor snapshot={snapshot} onChange={onChange} />,
    toDocument: (name, scenario) => {
      const dynamic = (scenario.kind ?? 'static') === 'dynamic' && scenario.stages?.length
      const stages = dynamic ? scenario.stages! : [{ id: crypto.randomUUID(), name: 'Initial state', comment: '', stageType: 'controls' as const, snapshot: scenario, advanceTriggers: [{ type: 'manual' } as DynamicScenarioTrigger] }]
      return {
        schemaVersion: 1,
        product: 'eduvent',
        name,
        description: scenario.description ?? '',
        stages: stages.map((stage, index) => ({
          id: stage.id ?? `stage-${index}`,
          name: stage.name || `Stage ${index + 1}`,
          notes: stage.comment ?? '',
          kind: (stage.stageType ?? 'controls') === 'controls' ? 'state' : stage.stageType as 'media' | 'question',
          snapshot: stage.snapshot,
          triggers: (stage.advanceTriggers?.length ? stage.advanceTriggers : [stage.advanceTrigger ?? { type: 'manual' }]).map(triggerToShared),
          media: stage.media,
          question: stage.question,
        })),
        branches: (scenario.branches ?? []).map((branch) => ({ id: branch.id, fromStageId: branch.fromStageId, toStageId: branch.toStageId, trigger: triggerToShared(branch.trigger), priority: branch.priority, label: branch.label, enabled: branch.enabled })),
      }
    },
    fromDocument: (document: SharedScenarioAuthoringDocument<InstructorScenarioSnapshot>) => {
      const first = clone(document.stages[0]?.snapshot ?? seed)
      const dynamic = document.stages.length > 1 || document.branches.length > 0 || document.stages.some((stage) => stage.kind !== 'state')
      if (!dynamic) return { ...first, schemaVersion: 2, kind: 'static', description: document.description, stages: undefined, branches: undefined }
      return {
        ...first,
        schemaVersion: 7,
        kind: 'dynamic',
        description: document.description,
        stages: document.stages.map((stage) => ({
          id: stage.id,
          name: stage.name,
          comment: stage.notes,
          stageType: stage.kind === 'state' ? 'controls' : stage.kind,
          media: stage.media,
          question: stage.question,
          transition: { mode: 'immediate' },
          transitionOverrides: {},
          snapshot: clone(stage.snapshot),
          apply: createFullDynamicStageApplyMask(stage.snapshot),
          advanceTrigger: sharedToTrigger(stage.triggers[0] ?? { id: crypto.randomUUID(), type: 'manual' }),
          advanceTriggers: stage.triggers.map(sharedToTrigger),
        })),
        branches: document.branches.map((branch) => ({ id: branch.id, fromStageId: branch.fromStageId, toStageId: branch.toStageId, trigger: sharedToTrigger(branch.trigger), priority: branch.priority, label: branch.label, enabled: branch.enabled })),
      }
    },
  }
}
