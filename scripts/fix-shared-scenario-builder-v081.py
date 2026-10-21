from pathlib import Path


def replace(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'Pattern not found in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new))

# Shared authoring model: paths own progression; legacy trigger remains as compatibility anchor.
replace('src/teaching/scenario/authoringTypes.ts', '''export interface SharedScenarioAuthoringBranch {
  id: string
  fromStageId: string
  toStageId: string
  trigger: SharedScenarioAuthoringTrigger
  priority: number
  label?: string
  enabled?: boolean
}''', '''export interface SharedScenarioAuthoringBranch {
  id: string
  fromStageId: string
  toStageId: string
  /** First condition retained for backwards-compatible serialization. */
  trigger: SharedScenarioAuthoringTrigger
  /** Path conditions. */
  triggers?: SharedScenarioAuthoringTrigger[]
  /** ANY is the default; ALL requires every condition to match. */
  triggerMode?: 'any' | 'all'
  priority: number
  label?: string
  enabled?: boolean
}''')
replace('src/teaching/scenario/authoringTypes.ts', '''    snapshot,
    triggers: [defaultAuthoringTrigger()],
  }''', '''    snapshot,
    triggers: [],
  }''')

# Version is intentionally visible in the standalone builder app bar.
Path('src/scenario-builder/version.ts').write_text("export const SCENARIO_BUILDER_VERSION = '0.8.1'\n")

# Actual /scenarios EDUVENT adapter: real range sliders + path conversion.
Path('src/scenario-builder/modules/ventilator/authoringAdapter.tsx').write_text(r'''import type { ReactNode } from 'react'
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
  if (variable.type === 'number') return <input className="shared-scenario-control-slider" type="range" min={variable.min} max={variable.max} step={variable.step ?? 1} value={typeof value === 'number' ? value : 0} onChange={(event) => onChange(Number(event.target.value))} />
  return <input value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} />
}

function variablePalette(variable: ScenarioVariableDefinition) {
  if (variable.id.startsWith('ventilator.')) return 'vent'
  if (variable.group.toLowerCase().includes('phys')) return 'physio'
  return 'patient'
}

function displayVariableValue(variable: ScenarioVariableDefinition, value: unknown) {
  if (variable.type === 'boolean') return value ? 'On' : 'Off'
  if (variable.type === 'select') return variable.options?.find((option) => String(option.value) === String(value))?.label ?? String(value ?? '')
  return `${typeof value === 'number' ? Number(value.toFixed(3)) : value ?? ''}${variable.unit ? ` ${variable.unit}` : ''}`
}

function SnapshotEditor({ snapshot, onChange }: { snapshot: InstructorScenarioSnapshot; onChange: (snapshot: InstructorScenarioSnapshot) => void }) {
  const writable = VENTILATOR_SCENARIO_MODULE.variables.filter((variable) => variable.role === 'setting' && variable.writable)
  const groups = [...new Set(writable.map((variable) => variable.group))]
  return <div className="shared-scenario-eduvent-snapshot">
    {groups.map((group) => {
      const variables = writable.filter((variable) => variable.group === group)
      const palette = variablePalette(variables[0])
      return <section key={group} className={`shared-scenario-control-group ${palette}`}><h3>{group}</h3><div className="shared-scenario-slider-grid">{variables.map((variable) => {
        const value = getPath(snapshot, variable.id)
        return <label className={`shared-scenario-variable-row ${variable.type === 'number' ? 'slider' : ''}`} key={variable.id}>
          <div className="shared-scenario-variable-heading"><span>{variable.label}</span><strong>{displayVariableValue(variable, value)}</strong></div>
          <VariableInput variable={variable} value={value} onChange={(next) => onChange(setPath(snapshot, variable.id, next))} />
        </label>
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
    renderSnapshotEditor: (snapshot, onChange): ReactNode => <SnapshotEditor snapshot={snapshot} onChange={onChange} />,
    toDocument: (name, scenario) => {
      const dynamic = (scenario.kind ?? 'static') === 'dynamic' && scenario.stages?.length
      const sourceStages = dynamic ? scenario.stages! : [{ id: crypto.randomUUID(), name: 'Initial state', comment: '', stageType: 'controls' as const, snapshot: scenario, advanceTriggers: [] as DynamicScenarioTrigger[] }]
      const stages = sourceStages.map((stage, index) => ({
        id: stage.id ?? `stage-${index}`,
        name: stage.name || `Stage ${index + 1}`,
        notes: stage.comment ?? '',
        kind: (stage.stageType ?? 'controls') === 'controls' ? 'state' as const : stage.stageType as 'media' | 'question',
        snapshot: stage.snapshot,
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
          transition: { mode: 'immediate' },
          transitionOverrides: {},
          snapshot: clone(stage.snapshot),
          apply: createFullDynamicStageApplyMask(stage.snapshot),
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
''')

# EDUMON shared adapter follows the same explicit-path authoring model so the shared framework remains product-neutral.
p = Path('src/scenario-builder/modules/edumon/authoringAdapter.tsx')
t = p.read_text()
t = t.replace("        triggers: stage.triggers.map(toSharedTrigger),", "        triggers: [],")
t = t.replace("        trigger: toSharedTrigger(branch.trigger),\n        priority: branch.priority ?? index,", "        trigger: toSharedTrigger(branch.trigger),\n        triggers: (branch.triggers?.length ? branch.triggers : [branch.trigger]).map(toSharedTrigger),\n        triggerMode: branch.triggerMode === 'all' ? 'all' : 'any',\n        priority: branch.priority ?? index,")
# Replace compact toDocument closing so legacy linear stage triggers become explicit Continue paths.
old = """      branches: (scenario.definition.branches ?? []).map((branch, index) => ({
        id: branch.id ?? `branch-${index}`,
        fromStageId: branch.fromStageId ?? scenario.definition.stages[0]?.id ?? '',
        toStageId: branch.toStageId,
        trigger: toSharedTrigger(branch.trigger),
        triggers: (branch.triggers?.length ? branch.triggers : [branch.trigger]).map(toSharedTrigger),
        triggerMode: branch.triggerMode === 'all' ? 'all' : 'any',
        priority: branch.priority ?? index,
        label: branch.label,
        enabled: branch.enabled,
      })),
    }),"""
new = """      branches: [
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
    }),"""
if old not in t: raise SystemExit('EDUMON toDocument pattern not found')
t = t.replace(old, new)
t = t.replace("          triggers: stage.triggers.map(fromSharedTrigger),", "          triggers: [{ type: 'manual' }],")
t = t.replace("          trigger: fromSharedTrigger(branch.trigger),\n          priority: branch.priority,", "          trigger: fromSharedTrigger(branch.trigger),\n          triggers: (branch.triggers?.length ? branch.triggers : [branch.trigger]).map(fromSharedTrigger),\n          triggerMode: branch.triggerMode === 'all' ? 'all' : 'any',\n          priority: branch.priority,")
p.write_text(t)

# Shared visible editor: remove split progression/branch controls and expose one Paths section.
p = Path('src/scenario-builder/SharedScenarioEditorFramework.tsx')
t = p.read_text()
t = t.replace("""function triggerLabel(trigger: SharedScenarioAuthoringTrigger) {
  if (trigger.type === 'manual') return 'Manual'
  if (trigger.type === 'time') return `Time ≥ ${trigger.seconds}s`
  if (trigger.type === 'condition') return `${trigger.metric || 'Metric'} ${trigger.operator} ${trigger.value}`
  if (trigger.type === 'action') return `${trigger.actor}: ${trigger.parameter || 'action'}`
  if (trigger.type === 'question-any') return 'Any answer submitted'
  return 'Correct answer submitted'
}
""", """function triggerLabel(trigger: SharedScenarioAuthoringTrigger) {
  if (trigger.type === 'manual') return 'Instructor choice'
  if (trigger.type === 'time') return `Time ≥ ${trigger.seconds}s`
  if (trigger.type === 'condition') return `${trigger.metric || 'Metric'} ${trigger.operator === 'lt' ? '<' : trigger.operator === 'gt' ? '>' : '='} ${trigger.value}`
  if (trigger.type === 'action') return `${trigger.actor}: ${trigger.parameter || 'action'}`
  if (trigger.type === 'question-any') return 'Any answer submitted'
  return 'Correct answer submitted'
}

function pathTriggers(branch: SharedScenarioAuthoringBranch) {
  return branch.triggers?.length ? branch.triggers : [branch.trigger]
}
""")
t = t.replace("""  const addStage = () => {
    const source = selectedStage?.snapshot ?? adapter.emptySnapshot()
    const stage = createAuthoringStage(`Stage ${document.stages.length + 1}`, clone(source))
    setDocument((current) => ({ ...current, stages: [...current.stages, stage] }))
    setSelectedStageId(stage.id)
  }
""", """  const addStage = () => {
    const source = selectedStage?.snapshot ?? adapter.emptySnapshot()
    const stage = createAuthoringStage(`Stage ${document.stages.length + 1}`, clone(source))
    const trigger = defaultAuthoringTrigger()
    const path: SharedScenarioAuthoringBranch = { id: authoringId('path'), fromStageId: selectedStage.id, toStageId: stage.id, trigger, triggers: [trigger], triggerMode: 'any', priority: document.branches.filter((branch) => branch.fromStageId === selectedStage.id).length, label: 'Continue', enabled: true }
    setDocument((current) => ({ ...current, stages: [...current.stages, stage], branches: [...current.branches, path] }))
    setSelectedStageId(stage.id)
  }
""")
t = t.replace("""    stage.triggers = stage.triggers.map((trigger) => ({ ...trigger, id: authoringId('trigger') }))
    setDocument((current) => ({ ...current, stages: [...current.stages, stage] }))
""", """    stage.triggers = []
    setDocument((current) => ({ ...current, stages: [...current.stages, stage] }))
""")
old_funcs = """  const addTrigger = () => updateStage({ triggers: [...selectedStage.triggers, defaultAuthoringTrigger()] })
  const updateTrigger = (id: string, next: SharedScenarioAuthoringTrigger) => updateStage({ triggers: selectedStage.triggers.map((trigger) => trigger.id === id ? next : trigger) })
  const removeTrigger = (id: string) => updateStage({ triggers: selectedStage.triggers.filter((trigger) => trigger.id !== id) })

  const addBranch = () => {
    if (document.stages.length < 2) return
    const fromStageId = selectedStage.id
    const toStageId = document.stages.find((stage) => stage.id !== fromStageId)?.id ?? fromStageId
    const branch: SharedScenarioAuthoringBranch = { id: authoringId('branch'), fromStageId, toStageId, trigger: defaultAuthoringTrigger(), priority: document.branches.length, enabled: true }
    setDocument((current) => ({ ...current, branches: [...current.branches, branch] }))
  }

  const updateBranch = (id: string, patch: Partial<SharedScenarioAuthoringBranch>) => setDocument((current) => ({ ...current, branches: current.branches.map((branch) => branch.id === id ? { ...branch, ...patch } : branch) }))
  const deleteBranch = (id: string) => setDocument((current) => ({ ...current, branches: current.branches.filter((branch) => branch.id !== id) }))
"""
new_funcs = """  const addBranch = () => {
    if (document.stages.length < 2) return
    const fromStageId = selectedStage.id
    const toStageId = document.stages.find((stage) => stage.id !== fromStageId)?.id ?? fromStageId
    const trigger = defaultAuthoringTrigger()
    const branch: SharedScenarioAuthoringBranch = { id: authoringId('path'), fromStageId, toStageId, trigger, triggers: [trigger], triggerMode: 'any', priority: document.branches.filter((item) => item.fromStageId === fromStageId).length, label: '', enabled: true }
    setDocument((current) => ({ ...current, branches: [...current.branches, branch] }))
  }

  const updateBranch = (id: string, patch: Partial<SharedScenarioAuthoringBranch>) => setDocument((current) => ({ ...current, branches: current.branches.map((branch) => branch.id === id ? { ...branch, ...patch } : branch) }))
  const deleteBranch = (id: string) => setDocument((current) => ({ ...current, branches: current.branches.filter((branch) => branch.id !== id) }))
  const addPathCondition = (branch: SharedScenarioAuthoringBranch) => {
    const next = [...pathTriggers(branch), defaultAuthoringTrigger()]
    updateBranch(branch.id, { trigger: next[0], triggers: next })
  }
  const updatePathCondition = (branch: SharedScenarioAuthoringBranch, triggerId: string, nextTrigger: SharedScenarioAuthoringTrigger) => {
    const next = pathTriggers(branch).map((trigger) => trigger.id === triggerId ? nextTrigger : trigger)
    updateBranch(branch.id, { trigger: next[0] ?? nextTrigger, triggers: next })
  }
  const removePathCondition = (branch: SharedScenarioAuthoringBranch, triggerId: string) => {
    const next = pathTriggers(branch).filter((trigger) => trigger.id !== triggerId)
    if (!next.length) return
    updateBranch(branch.id, { trigger: next[0], triggers: next })
  }
"""
if old_funcs not in t: raise SystemExit('Shared framework function block not found')
t = t.replace(old_funcs, new_funcs)
t = t.replace("""          {document.stages.map((stage, index) => <button key={stage.id} type="button" className={stage.id === selectedStageId ? 'selected' : ''} onClick={() => setSelectedStageId(stage.id)}><small>{index + 1} · {stage.kind}</small><strong>{stage.name}</strong><em>{stage.triggers.map(triggerLabel).join(' OR ')}</em></button>)}""", """          {document.stages.map((stage, index) => {
            const outgoing = document.branches.filter((branch) => branch.fromStageId === stage.id && branch.enabled !== false)
            return <button key={stage.id} type="button" className={stage.id === selectedStageId ? 'selected' : ''} onClick={() => setSelectedStageId(stage.id)}><small>{index + 1} · {stage.kind}</small><strong>{stage.name}</strong><em>{outgoing.length ? `${outgoing.length} path${outgoing.length === 1 ? '' : 's'}` : 'End stage'}</em></button>
          })}""")
old_sections = """          <section className="shared-scenario-triggers">
            <div className="shared-scenario-section-heading"><div><span>Stage progression</span><strong>Advance when any trigger matches</strong></div><button type="button" onClick={addTrigger}>+ Trigger</button></div>
            {selectedStage.triggers.map((trigger) => <TriggerEditor key={trigger.id} trigger={trigger} adapter={adapter as SharedScenarioEditorAdapter<unknown, unknown>} onChange={(next) => updateTrigger(trigger.id, next)} onDelete={selectedStage.triggers.length > 1 ? () => removeTrigger(trigger.id) : undefined} />)}
          </section>

          <section className="shared-scenario-branches">
            <div className="shared-scenario-section-heading"><div><span>Conditional flow</span><strong>Branches from this stage</strong></div><button type="button" disabled={document.stages.length < 2} onClick={addBranch}>+ Branch</button></div>
            {stageBranches.map((branch) => <div key={branch.id} className="shared-scenario-branch-row">
              <input value={branch.label ?? ''} onChange={(event) => updateBranch(branch.id, { label: event.target.value })} placeholder="Branch label" />
              <select value={branch.toStageId} onChange={(event) => updateBranch(branch.id, { toStageId: event.target.value })}>{document.stages.filter((stage) => stage.id !== branch.fromStageId).map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select>
              <input type="number" min={0} value={branch.priority} onChange={(event) => updateBranch(branch.id, { priority: Number(event.target.value) || 0 })} title="Priority" />
              <label className="shared-scenario-check"><input type="checkbox" checked={branch.enabled !== false} onChange={(event) => updateBranch(branch.id, { enabled: event.target.checked })} /> Enabled</label>
              <TriggerEditor trigger={branch.trigger} adapter={adapter as SharedScenarioEditorAdapter<unknown, unknown>} onChange={(trigger) => updateBranch(branch.id, { trigger })} />
              <button type="button" className="scenario-builder-danger" onClick={() => deleteBranch(branch.id)}>Remove branch</button>
            </div>)}
            {!stageBranches.length && <small>No branches. Linear stage order is used.</small>}
          </section>"""
new_sections = """          <section className="shared-scenario-paths">
            <div className="shared-scenario-section-heading"><div><span>Scenario flow</span><strong>Paths from this stage</strong><small>Each path has a destination and one or more conditions.</small></div><button type="button" disabled={document.stages.length < 2} onClick={addBranch}>+ Path</button></div>
            {stageBranches.sort((a, b) => a.priority - b.priority).map((branch) => {
              const conditions = pathTriggers(branch)
              return <div key={branch.id} className="shared-scenario-path-card">
                <div className="shared-scenario-path-header">
                  <label><span>Path name</span><input value={branch.label ?? ''} onChange={(event) => updateBranch(branch.id, { label: event.target.value })} placeholder="e.g. Continue, Deteriorates, Responds" /></label>
                  <label><span>Go to</span><select value={branch.toStageId} onChange={(event) => updateBranch(branch.id, { toStageId: event.target.value })}>{document.stages.filter((stage) => stage.id !== branch.fromStageId).map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label>
                  <label className="compact"><span>Priority</span><input type="number" min={0} value={branch.priority} onChange={(event) => updateBranch(branch.id, { priority: Number(event.target.value) || 0 })} /></label>
                  <label className="compact"><span>Match</span><select value={branch.triggerMode === 'all' ? 'all' : 'any'} onChange={(event) => updateBranch(branch.id, { triggerMode: event.target.value as 'any' | 'all' })}><option value="any">ANY</option><option value="all">ALL</option></select></label>
                  <label className="shared-scenario-check"><input type="checkbox" checked={branch.enabled !== false} onChange={(event) => updateBranch(branch.id, { enabled: event.target.checked })} /> Enabled</label>
                  <button type="button" className="scenario-builder-danger" onClick={() => deleteBranch(branch.id)}>Remove path</button>
                </div>
                <div className="shared-scenario-path-conditions">
                  {conditions.map((trigger, conditionIndex) => <div className="shared-scenario-path-condition" key={trigger.id}>
                    {conditionIndex > 0 && <span className="shared-scenario-path-join">{branch.triggerMode === 'all' ? 'AND' : 'OR'}</span>}
                    <TriggerEditor trigger={trigger} adapter={adapter as SharedScenarioEditorAdapter<unknown, unknown>} onChange={(next) => updatePathCondition(branch, trigger.id, next)} onDelete={conditions.length > 1 ? () => removePathCondition(branch, trigger.id) : undefined} />
                  </div>)}
                  <button type="button" className="shared-scenario-add-condition" onClick={() => addPathCondition(branch)}>+ Condition</button>
                </div>
              </div>
            })}
            {!stageBranches.length && <div className="shared-scenario-end-stage"><strong>End stage</strong><span>No outgoing paths. Reaching this stage completes the scenario.</span></div>}
          </section>"""
if old_sections not in t: raise SystemExit('Shared framework progression sections not found')
t = t.replace(old_sections, new_sections)
p.write_text(t)

# Standalone builder styling: simulator-style semantic sliders and unified path cards.
p = Path('src/scenario-builder/scenarioBuilder.css')
t = p.read_text().replace("Scenario Builder v0.2 requires a wide screen", "Scenario Builder v0.8.1 requires a wide screen")
t += r'''

/* Scenario Builder v0.8.1 — actual /scenarios EDUVENT controls */
.shared-scenario-slider-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 18px}
.shared-scenario-control-group{margin:0 0 14px!important;padding:12px 14px 6px;border:1px solid #31444e;background:#0a1318}
.shared-scenario-control-group.vent{border-color:#365e6f;background:#0b171d}.shared-scenario-control-group.patient{border-color:#3b604a;background:#0c1711}.shared-scenario-control-group.physio{border-color:#5d4a75;background:#15101c}
.shared-scenario-control-group.vent h3{color:#61bedd}.shared-scenario-control-group.patient h3{color:#70c584}.shared-scenario-control-group.physio h3{color:#a66ddd}
.shared-scenario-variable-row{display:grid;gap:7px;padding:10px 0;border-bottom:1px solid rgba(118,145,157,.15)}
.shared-scenario-variable-heading{display:flex;align-items:baseline;justify-content:space-between;gap:10px}.shared-scenario-variable-heading span{font-size:11px;color:#a9bac1}.shared-scenario-variable-heading strong{font-size:11px;color:#eef6f8;font-weight:650;text-align:right}
.shared-scenario-variable-row select{min-height:34px}.shared-scenario-control-slider{width:100%;padding:0!important;border:0!important;background:transparent!important;cursor:pointer}
.shared-scenario-control-group.vent .shared-scenario-control-slider{accent-color:#61bedd}.shared-scenario-control-group.patient .shared-scenario-control-slider{accent-color:#70c584}.shared-scenario-control-group.physio .shared-scenario-control-slider{accent-color:#a66ddd}
.shared-scenario-control-slider::-webkit-slider-runnable-track{height:5px;border-radius:4px;background:#263840}.shared-scenario-control-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:16px;height:16px;margin-top:-5.5px;border:2px solid rgba(255,255,255,.75);border-radius:50%;background:currentColor;box-shadow:0 1px 4px rgba(0,0,0,.5)}
.shared-scenario-control-group.vent .shared-scenario-control-slider::-webkit-slider-thumb{background:#61bedd}.shared-scenario-control-group.patient .shared-scenario-control-slider::-webkit-slider-thumb{background:#70c584}.shared-scenario-control-group.physio .shared-scenario-control-slider::-webkit-slider-thumb{background:#a66ddd}
.shared-scenario-control-slider::-moz-range-track{height:5px;border-radius:4px;background:#263840}.shared-scenario-control-slider::-moz-range-thumb{width:14px;height:14px;border:2px solid rgba(255,255,255,.75);border-radius:50%}.shared-scenario-control-group.vent .shared-scenario-control-slider::-moz-range-thumb{background:#61bedd}.shared-scenario-control-group.patient .shared-scenario-control-slider::-moz-range-thumb{background:#70c584}.shared-scenario-control-group.physio .shared-scenario-control-slider::-moz-range-thumb{background:#a66ddd}

/* Scenario Builder v0.8.1 — unified paths */
.shared-scenario-paths{padding:12px;border:1px solid #2c414a;background:#0b161c}.shared-scenario-section-heading>div{display:grid;gap:2px}.shared-scenario-section-heading small{color:#718892;font-size:9px}
.shared-scenario-path-card{margin-top:10px;padding:10px;border:1px solid #36515c;background:#091419}.shared-scenario-path-header{display:grid;grid-template-columns:minmax(150px,1fr) minmax(150px,1fr) 76px 82px auto auto;gap:8px;align-items:end}.shared-scenario-path-header label{display:grid;gap:4px}.shared-scenario-path-header label>span{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#8298a1}.shared-scenario-path-header .shared-scenario-check{display:flex!important;align-items:center;align-self:center;margin-top:18px}.shared-scenario-path-conditions{margin-top:9px;padding-top:8px;border-top:1px solid #263b44}.shared-scenario-path-condition{position:relative}.shared-scenario-path-condition .shared-scenario-trigger-editor{margin-top:6px}.shared-scenario-path-join{display:inline-block;margin:8px 0 0;padding:2px 6px;border:1px solid #49616b;background:#10212a;color:#9fd9e8;font-size:8px;font-weight:800;letter-spacing:.08em}.shared-scenario-add-condition{margin-top:8px!important;border-color:#4d7859!important;color:#a5e6b5!important;background:#102219!important}.shared-scenario-end-stage{display:grid;gap:3px;margin-top:10px;padding:12px;border:1px dashed #40515a;color:#91a4ac}.shared-scenario-end-stage strong{color:#d4e0e4}.shared-scenario-end-stage span{font-size:10px}.shared-scenario-triggers,.shared-scenario-branches{display:none!important}
@media(max-width:1300px){.shared-scenario-slider-grid{grid-template-columns:1fr}.shared-scenario-path-header{grid-template-columns:1fr 1fr 70px 78px}.shared-scenario-path-header>.shared-scenario-check,.shared-scenario-path-header>button{grid-row:2}}
'''
p.write_text(t)
print('Applied Scenario Builder v0.8.1 to the actual shared /scenarios editor')
