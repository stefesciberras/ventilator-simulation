import type { InstructorPresetRow } from '../../../instructorAccount'
import { RHYTHM_LABELS } from '../../../edumon/monitorEngine'
import type { CardiacRhythm } from '../../../edumon/types'
import type {
  ScenarioModuleDefinition,
  ScenarioTriggerSourceDefinition,
  ScenarioVariableDefinition,
} from '../../model'

const rhythmOptions = (Object.keys(RHYTHM_LABELS) as CardiacRhythm[]).map((value) => ({ value, label: RHYTHM_LABELS[value] }))

const variables: ScenarioVariableDefinition[] = [
  { id: 'rhythm', label: 'Rhythm', group: 'Monitor patient state', type: 'select', role: 'setting', options: rhythmOptions, writable: true, snapshotPath: 'patient.rhythm' },
  { id: 'heartRate', label: 'Heart rate', group: 'Monitor patient state', type: 'number', role: 'setting', unit: '/min', min: 0, max: 250, step: 1, writable: true, snapshotPath: 'patient.heartRate', transitionable: true },
  { id: 'systolicPressure', label: 'Systolic pressure', group: 'Monitor patient state', type: 'number', role: 'setting', unit: 'mmHg', min: 0, max: 260, step: 1, writable: true, snapshotPath: 'patient.systolicPressure', transitionable: true },
  { id: 'diastolicPressure', label: 'Diastolic pressure', group: 'Monitor patient state', type: 'number', role: 'setting', unit: 'mmHg', min: 0, max: 180, step: 1, writable: true, snapshotPath: 'patient.diastolicPressure', transitionable: true },
  { id: 'spo2', label: 'SpO₂', group: 'Monitor patient state', type: 'number', role: 'setting', unit: '%', min: 0, max: 100, step: 1, writable: true, snapshotPath: 'patient.spo2', transitionable: true },
  { id: 'peripheralPerfusion', label: 'Peripheral perfusion', group: 'Monitor patient state', type: 'number', role: 'setting', min: 0, max: 2, step: 0.05, writable: true, snapshotPath: 'patient.peripheralPerfusion', transitionable: true },
  { id: 'simulationPaused', label: 'Simulation paused', group: 'Simulation', type: 'boolean', role: 'setting', writable: true, snapshotPath: 'simulationPaused' },
  { id: 'simulationSpeed', label: 'Simulation speed', group: 'Simulation', type: 'select', role: 'setting', options: [0.5, 1, 1.5, 2, 4].map((value) => ({ value: String(value), label: `×${value}` })), writable: true, snapshotPath: 'simulationSpeed' },
  { id: 'meanPressure', label: 'Mean arterial pressure', group: 'Measurements', type: 'number', role: 'measurement', unit: 'mmHg' },
  { id: 'pulsePressure', label: 'Pulse pressure', group: 'Measurements', type: 'number', role: 'measurement', unit: 'mmHg' },
]

const measurementIds = ['heartRate', 'systolicPressure', 'diastolicPressure', 'meanPressure', 'pulsePressure', 'spo2', 'peripheralPerfusion'] as const
const patientActionIds = ['rhythm', 'heartRate', 'systolicPressure', 'diastolicPressure', 'spo2', 'peripheralPerfusion'] as const

const byId = new Map(variables.map((variable) => [variable.id, variable]))

const triggerSources: ScenarioTriggerSourceDefinition[] = [
  ...measurementIds.map((id) => ({ id: `measurement:${id}`, label: byId.get(id)?.label ?? id, kind: 'measurement' as const, variableId: id })),
  ...patientActionIds.flatMap((id) => [
    { id: `candidate-action:${id}`, label: byId.get(id)?.label ?? id, kind: 'candidate-action' as const, variableId: id },
    { id: `instructor-action:${id}`, label: byId.get(id)?.label ?? id, kind: 'instructor-action' as const, variableId: id },
  ]),
]

function createModule(id: 'anaesth' | 'icu', label: string, shortLabel: string, description: string): ScenarioModuleDefinition<InstructorPresetRow> {
  return {
    id,
    schemaVersion: 2,
    label,
    shortLabel,
    description,
    available: true,
    variables,
    templates: [],
    triggerSources,
    supportsPreset: (preset) => preset.product === id,
  }
}

export const ANAESTH_SCENARIO_MODULE = createModule(
  'anaesth',
  'LoppjuSIM-Anaesth',
  'Anaesthesia monitor',
  'Anaesthesia patient-monitor scenarios using the shared LoppjuSIM scenario library.',
)

export const ICU_SCENARIO_MODULE = createModule(
  'icu',
  'LoppjuSIM-ICU',
  'ICU monitor',
  'Intensive-care patient-monitor scenarios using the shared LoppjuSIM scenario library.',
)

export function getEdumonScenarioModule(product: 'anaesth' | 'icu') {
  return product === 'icu' ? ICU_SCENARIO_MODULE : ANAESTH_SCENARIO_MODULE
}

export function writableScenarioVariables<TPreset>(module: ScenarioModuleDefinition<TPreset>) {
  return module.variables.filter((variable) => variable.role === 'setting' && variable.writable && variable.snapshotPath)
}

export function transitionScenarioVariables<TPreset>(module: ScenarioModuleDefinition<TPreset>) {
  return writableScenarioVariables(module).filter((variable) => variable.type === 'number' && variable.transitionable)
}

export function scenarioTriggerVariables<TPreset>(module: ScenarioModuleDefinition<TPreset>, kind: ScenarioTriggerSourceDefinition['kind']) {
  return module.triggerSources
    .filter((source) => source.kind === kind)
    .map((source) => module.variables.find((variable) => variable.id === source.variableId))
    .filter((variable): variable is ScenarioVariableDefinition => Boolean(variable))
}

export function readScenarioSnapshotValue(snapshot: unknown, variable: ScenarioVariableDefinition): unknown {
  if (!variable.snapshotPath) return undefined
  let current: unknown = snapshot
  for (const part of variable.snapshotPath.split('.')) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

export function writeScenarioSnapshotValue<T>(snapshot: T, variable: ScenarioVariableDefinition, value: unknown): T {
  if (!variable.snapshotPath) return snapshot
  const parts = variable.snapshotPath.split('.')
  const clone = structuredClone(snapshot) as Record<string, unknown>
  let current = clone
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index]
    const next = current[part]
    current[part] = next && typeof next === 'object' ? { ...(next as Record<string, unknown>) } : {}
    current = current[part] as Record<string, unknown>
  }
  current[parts[parts.length - 1]] = value
  return clone as T
}
