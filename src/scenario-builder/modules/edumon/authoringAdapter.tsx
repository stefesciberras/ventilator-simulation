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

function SnapshotEditor({ snapshot, onChange }: { snapshot: EdumonScenarioSnapshot; onChange: (snapshot: EdumonScenarioSnapshot) => void }) {
  const patient = snapshot.patient
  const setPatient = (patch: Partial<typeof patient>) => onChange({ ...snapshot, patient: { ...patient, ...patch } })
  return <div className="scenario-builder-field-grid shared-scenario-edumon-snapshot">
    <label><span>Rhythm</span><select value={patient.rhythm} onChange={(event) => setPatient({ rhythm: event.target.value as CardiacRhythm })}>{RHYTHMS.map((rhythm) => <option key={rhythm} value={rhythm}>{RHYTHM_LABELS[rhythm]}</option>)}</select></label>
    <label><span>Heart rate</span><input type="number" min={0} max={250} value={patient.heartRate} onChange={(event) => setPatient({ heartRate: Number(event.target.value) || 0 })} /></label>
    <label><span>Systolic pressure</span><input type="number" min={0} max={260} value={patient.systolicPressure} onChange={(event) => setPatient({ systolicPressure: Number(event.target.value) || 0 })} /></label>
    <label><span>Diastolic pressure</span><input type="number" min={0} max={180} value={patient.diastolicPressure} onChange={(event) => setPatient({ diastolicPressure: Number(event.target.value) || 0 })} /></label>
    <label><span>SpO₂</span><input type="number" min={0} max={100} value={patient.spo2} onChange={(event) => setPatient({ spo2: Number(event.target.value) || 0 })} /></label>
    <label><span>Peripheral perfusion</span><input type="number" min={0} max={2} step={0.05} value={patient.peripheralPerfusion} onChange={(event) => setPatient({ peripheralPerfusion: Number(event.target.value) || 0 })} /></label>
    <label><span>Simulation</span><select value={snapshot.simulationPaused ? 'paused' : 'running'} onChange={(event) => onChange({ ...snapshot, simulationPaused: event.target.value === 'paused' })}><option value="running">Running</option><option value="paused">Paused</option></select></label>
    <label><span>Speed</span><select value={snapshot.simulationSpeed} onChange={(event) => onChange({ ...snapshot, simulationSpeed: Number(event.target.value) as EdumonScenarioSnapshot['simulationSpeed'] })}><option value={0.5}>×0.5</option><option value={1}>×1</option><option value={1.5}>×1.5</option><option value={2}>×2</option><option value={4}>×4</option></select></label>
  </div>
}

function toSharedTrigger(trigger: EdumonScenarioTrigger): SharedScenarioAuthoringTrigger {
  const id = crypto.randomUUID()
  if (trigger.type === 'manual' || trigger.type === 'question-any' || trigger.type === 'question-correct') return { id, type: trigger.type }
  if (trigger.type === 'time') return { id, type: 'time', seconds: trigger.seconds }
  if (trigger.type === 'condition') return { id, type: 'condition', metric: trigger.metric, operator: trigger.operator, value: trigger.value }
  return { id, type: 'action', parameter: String(trigger.parameter), actor: trigger.actor ?? 'candidate' }
}

function fromSharedTrigger(trigger: SharedScenarioAuthoringTrigger): EdumonScenarioTrigger {
  if (trigger.type === 'manual' || trigger.type === 'question-any' || trigger.type === 'question-correct') return { type: trigger.type }
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
    renderSnapshotEditor: (snapshot, onChange): ReactNode => <SnapshotEditor snapshot={snapshot} onChange={onChange} />,
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
        triggers: stage.triggers.map(toSharedTrigger),
        media: stage.content?.kind === 'media' ? stage.content.media : undefined,
        question: stage.content?.kind === 'question' ? stage.content.question : undefined,
      })),
      branches: (scenario.definition.branches ?? []).map((branch, index) => ({
        id: branch.id ?? `branch-${index}`,
        fromStageId: branch.fromStageId ?? scenario.definition.stages[0]?.id ?? '',
        toStageId: branch.toStageId,
        trigger: toSharedTrigger(branch.trigger),
        priority: branch.priority ?? index,
        label: branch.label,
        enabled: branch.enabled,
      })),
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
          triggers: stage.triggers.map(fromSharedTrigger),
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
          priority: branch.priority,
          label: branch.label,
          enabled: branch.enabled,
        })),
      },
    }),
  }
}
