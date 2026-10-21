import type { ReactNode } from 'react'
import { DEFAULT_MONITOR_STATE, type CardiacRhythm } from '../../../edumon/types'
import { RHYTHM_LABELS } from '../../../edumon/monitorEngine'
import type { EdumonScenarioMetric, EdumonScenarioSnapshot, EdumonScenarioTrigger, EdumonStoredScenario } from '../../../edumon/scenarioTypes'
import type { ScenarioProductId } from '../../../teaching/scenario/products'
import type {
  SharedScenarioAuthoringDocument,
  SharedScenarioAuthoringTrigger,
  SharedScenarioEditorAdapter,
} from '../../../teaching/scenario/authoringTypes'
import type { TeachingScenarioStageContent } from '../../../teaching/scenario/runtimeCore'

const RHYTHMS = Object.keys(RHYTHM_LABELS) as CardiacRhythm[]

const EDUMON_APPLY_IDS = ['rhythm', 'heartRate', 'systolicPressure', 'diastolicPressure', 'spo2', 'peripheralPerfusion', 'simulationPaused', 'simulationSpeed'] as const

function EdumonSlider({ label, id, value, min, max, step = 1, displayValue, applied, onAppliedChange, onChange }: { label: string; id: string; value: number; min: number; max: number; step?: number; displayValue?: string; applied: boolean; onAppliedChange: (id: string, applied: boolean) => void; onChange: (value: number) => void }) {
  return <div className={`shared-scenario-variable-row slider ${applied ? 'applied' : 'not-applied'}`}>
    <div className="shared-scenario-variable-heading">
      <label className="shared-scenario-apply-toggle"><input type="checkbox" checked={applied} onChange={(event) => onAppliedChange(id, event.target.checked)} /><span>Apply</span></label>
      <span className="shared-scenario-variable-label">{label}</span><strong>{displayValue ?? value}</strong>
    </div>
    <input disabled={!applied} className="shared-scenario-control-slider" type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
  </div>
}

function EdumonSelect({ label, id, value, applied, children, onAppliedChange, onChange }: { label: string; id: string; value: string | number; applied: boolean; children: ReactNode; onAppliedChange: (id: string, applied: boolean) => void; onChange: (value: string) => void }) {
  return <div className={`shared-scenario-variable-row ${applied ? 'applied' : 'not-applied'}`}><div className="shared-scenario-variable-heading"><label className="shared-scenario-apply-toggle"><input type="checkbox" checked={applied} onChange={(event) => onAppliedChange(id, event.target.checked)} /><span>Apply</span></label><span className="shared-scenario-variable-label">{label}</span></div><select disabled={!applied} value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></div>
}

function SnapshotEditor({ snapshot, onChange, appliedVariableIds, onAppliedVariableIdsChange }: { snapshot: EdumonScenarioSnapshot; onChange: (snapshot: EdumonScenarioSnapshot) => void; appliedVariableIds?: string[]; onAppliedVariableIdsChange?: (ids: string[]) => void }) {
  const patient = snapshot.patient
  const selected = new Set(appliedVariableIds ?? EDUMON_APPLY_IDS)
  const setApplied = (id: string, enabled: boolean) => { const next = new Set(selected); if (enabled) next.add(id); else next.delete(id); onAppliedVariableIdsChange?.([...next]) }
  const setPatient = (patch: Partial<typeof patient>) => onChange({ ...snapshot, patient: { ...patient, ...patch } })
  const isApplied = (id: string) => selected.has(id)
  return <div className="shared-scenario-eduvent-snapshot shared-scenario-edumon-snapshot">
    <section className="shared-scenario-control-group monitor">
      <h3>Monitor patient state</h3>
      <div className="shared-scenario-slider-grid">
        <EdumonSelect id="rhythm" label="Rhythm" applied={isApplied('rhythm')} onAppliedChange={setApplied} value={patient.rhythm} onChange={(value) => setPatient({ rhythm: value as CardiacRhythm })}>{RHYTHMS.map((rhythm) => <option key={rhythm} value={rhythm}>{RHYTHM_LABELS[rhythm]}</option>)}</EdumonSelect>
        <EdumonSlider id="heartRate" label="Heart rate" applied={isApplied('heartRate')} onAppliedChange={setApplied} value={patient.heartRate} min={0} max={250} displayValue={`${patient.heartRate} /min`} onChange={(heartRate) => setPatient({ heartRate })} />
        <EdumonSlider id="systolicPressure" label="Systolic pressure" applied={isApplied('systolicPressure')} onAppliedChange={setApplied} value={patient.systolicPressure} min={0} max={260} displayValue={`${patient.systolicPressure} mmHg`} onChange={(systolicPressure) => setPatient({ systolicPressure })} />
        <EdumonSlider id="diastolicPressure" label="Diastolic pressure" applied={isApplied('diastolicPressure')} onAppliedChange={setApplied} value={patient.diastolicPressure} min={0} max={180} displayValue={`${patient.diastolicPressure} mmHg`} onChange={(diastolicPressure) => setPatient({ diastolicPressure })} />
        <EdumonSlider id="spo2" label="SpO₂" applied={isApplied('spo2')} onAppliedChange={setApplied} value={patient.spo2} min={0} max={100} displayValue={`${patient.spo2}%`} onChange={(spo2) => setPatient({ spo2 })} />
        <EdumonSlider id="peripheralPerfusion" label="Peripheral perfusion" applied={isApplied('peripheralPerfusion')} onAppliedChange={setApplied} value={patient.peripheralPerfusion} min={0} max={2} step={0.05} displayValue={patient.peripheralPerfusion.toFixed(2)} onChange={(peripheralPerfusion) => setPatient({ peripheralPerfusion })} />
        <EdumonSelect id="simulationPaused" label="Simulation" applied={isApplied('simulationPaused')} onAppliedChange={setApplied} value={snapshot.simulationPaused ? 'paused' : 'running'} onChange={(value) => onChange({ ...snapshot, simulationPaused: value === 'paused' })}><option value="running">Running</option><option value="paused">Paused</option></EdumonSelect>
        <EdumonSelect id="simulationSpeed" label="Speed" applied={isApplied('simulationSpeed')} onAppliedChange={setApplied} value={snapshot.simulationSpeed} onChange={(value) => onChange({ ...snapshot, simulationSpeed: Number(value) as EdumonScenarioSnapshot['simulationSpeed'] })}><option value={0.5}>×0.5</option><option value={1}>×1</option><option value={1.5}>×1.5</option><option value={2}>×2</option><option value={4}>×4</option></EdumonSelect>
      </div>
    </section>
  </div>
}
function toSharedTrigger(trigger: EdumonScenarioTrigger): SharedScenarioAuthoringTrigger {
  const id = crypto.randomUUID()
  if (trigger.type === 'manual' || trigger.type === 'question-any' || trigger.type === 'question-correct' || trigger.type === 'media-ended' || trigger.type === 'media-acknowledged') return { id, type: trigger.type }
  if (trigger.type === 'time') return { id, type: 'time', seconds: trigger.seconds }
  if (trigger.type === 'condition') return { id, type: 'condition', metric: trigger.metric, operator: trigger.operator, value: trigger.value }
  return { id, type: 'action', parameter: String(trigger.parameter), actor: trigger.actor ?? 'candidate' }
}

function fromSharedTrigger(trigger: SharedScenarioAuthoringTrigger): EdumonScenarioTrigger {
  if (trigger.type === 'manual' || trigger.type === 'question-any' || trigger.type === 'question-correct' || trigger.type === 'media-ended' || trigger.type === 'media-acknowledged') return { type: trigger.type }
  if (trigger.type === 'time') return { type: 'time', seconds: trigger.seconds }
  if (trigger.type === 'condition') return { type: 'condition', metric: trigger.metric as EdumonScenarioMetric, operator: trigger.operator, value: trigger.value }
  return { type: 'patient-change', parameter: trigger.parameter as keyof EdumonScenarioSnapshot['patient'], actor: trigger.actor }
}

function contentKind(content: TeachingScenarioStageContent | undefined) {
  return content?.kind ?? 'state'
}

export function createEdumonAuthoringAdapter(product: Exclude<ScenarioProductId, 'eduvent'>, productLabel: string): SharedScenarioEditorAdapter<EdumonStoredScenario, EdumonScenarioSnapshot> {
  return {
    product,
    productLabel,
    emptySnapshot: () => ({ patient: { ...DEFAULT_MONITOR_STATE }, simulationPaused: false, simulationSpeed: 1 }),
    defaultAppliedVariableIds: () => [...EDUMON_APPLY_IDS],
    transitionVariables: () => [
      { id: 'heartRate', label: 'Heart rate' },
      { id: 'systolicPressure', label: 'Systolic pressure' },
      { id: 'diastolicPressure', label: 'Diastolic pressure' },
      { id: 'spo2', label: 'SpO₂' },
      { id: 'peripheralPerfusion', label: 'Peripheral perfusion' },
    ],
    conditionMetrics: [
      { id: 'heartRate', label: 'Heart rate' },
      { id: 'systolicPressure', label: 'Systolic pressure' },
      { id: 'diastolicPressure', label: 'Diastolic pressure' },
      { id: 'meanPressure', label: 'Mean arterial pressure' },
      { id: 'pulsePressure', label: 'Pulse pressure' },
      { id: 'spo2', label: 'SpO₂' },
      { id: 'peripheralPerfusion', label: 'Peripheral perfusion' },
    ],
    actionParameters: [
      { id: 'rhythm', label: 'Rhythm changed' },
      { id: 'heartRate', label: 'Heart rate changed' },
      { id: 'systolicPressure', label: 'Systolic pressure changed' },
      { id: 'diastolicPressure', label: 'Diastolic pressure changed' },
      { id: 'spo2', label: 'SpO₂ changed' },
      { id: 'peripheralPerfusion', label: 'Peripheral perfusion changed' },
    ],
    renderSnapshotEditor: (snapshot, onChange, options): ReactNode => <SnapshotEditor snapshot={snapshot} onChange={onChange} appliedVariableIds={options?.appliedVariableIds} onAppliedVariableIdsChange={options?.onAppliedVariableIdsChange} />,
    toDocument: (name, scenario) => ({
      schemaVersion: 1,
      product,
      name,
      description: scenario.description ?? '',
      stages: scenario.definition.stages.map((stage, index) => ({
        id: stage.id,
        name: stage.name || `Stage ${index + 1}`,
        notes: stage.notes ?? '',
        kind: contentKind(stage.content),
        snapshot: stage.snapshot,
        appliedVariableIds: stage.appliedVariableIds ?? [...EDUMON_APPLY_IDS],
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
      schemaVersion: 2,
      kind: document.stages.length > 1 || document.branches.length > 0 || document.stages.some((stage) => stage.kind !== 'state') ? 'dynamic' : 'static',
      description: document.description,
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
          trigger: fromSharedTrigger(branch.trigger),
          triggers: (branch.triggers?.length ? branch.triggers : [branch.trigger]).map(fromSharedTrigger),
          triggerMode: branch.triggerMode === 'all' ? 'all' : 'any',
          priority: branch.priority,
          label: branch.label,
          enabled: branch.enabled,
        })),
      },
    }),
  }
}
