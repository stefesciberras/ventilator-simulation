import type { InstructorPresetRow } from '../../../instructorAccount'
import { ECG_MORPHOLOGIES, ECG_MORPHOLOGY_LABELS, RHYTHM_LABELS } from '../../../edumon/monitorEngine'
import type { CardiacRhythm, EcgMorphology } from '../../../edumon/types'
import type {
  ScenarioModuleDefinition,
  ScenarioTriggerSourceDefinition,
  ScenarioVariableDefinition,
} from '../../model'

const rhythmOptions = (Object.keys(RHYTHM_LABELS) as CardiacRhythm[]).map((value) => ({ value, label: RHYTHM_LABELS[value] }))
const morphologyOptions = (ECG_MORPHOLOGIES as EcgMorphology[]).map((value) => ({ value, label: ECG_MORPHOLOGY_LABELS[value] }))

export const EDUMON_PATIENT_GROUP_ORDER = ['Patient', 'Cardiovascular', 'Respiratory', 'Metabolism', 'Anaesthesia'] as const

const variables: ScenarioVariableDefinition[] = [
  { id: 'rhythm', label: 'Rhythm', group: 'Cardiovascular', type: 'select', role: 'setting', options: rhythmOptions, writable: true, snapshotPath: 'patient.rhythm' },
  { id: 'ecgMorphology', label: 'ECG morphology', group: 'Cardiovascular', type: 'select', role: 'setting', options: morphologyOptions, writable: true, snapshotPath: 'patient.ecgMorphology' },
  { id: 'morphologySeverity', label: 'Morphology severity', group: 'Cardiovascular', type: 'number', role: 'setting', unit: '%', min: 0, max: 100, step: 1, defaultValue: 50, writable: true, snapshotPath: 'patient.morphologySeverity' },
  { id: 'heartRate', label: 'Heart rate', group: 'Cardiovascular', type: 'number', role: 'setting', unit: '/min', min: 0, max: 250, step: 1, writable: true, snapshotPath: 'patient.heartRate', transitionable: true },
  { id: 'systolicPressure', label: 'Systolic pressure', group: 'Cardiovascular', type: 'number', role: 'setting', unit: 'mmHg', min: 0, max: 260, step: 1, writable: true, snapshotPath: 'patient.systolicPressure', transitionable: true },
  { id: 'diastolicPressure', label: 'Diastolic pressure', group: 'Cardiovascular', type: 'number', role: 'setting', unit: 'mmHg', min: 0, max: 180, step: 1, writable: true, snapshotPath: 'patient.diastolicPressure', transitionable: true },
  { id: 'spo2', label: 'SpO₂', group: 'Respiratory', type: 'number', role: 'setting', unit: '%', min: 0, max: 100, step: 1, writable: true, snapshotPath: 'patient.spo2', transitionable: true },
  { id: 'peripheralPerfusion', label: 'Peripheral perfusion', group: 'Respiratory', type: 'number', role: 'setting', min: 0, max: 2, step: 0.05, writable: true, snapshotPath: 'patient.peripheralPerfusion', transitionable: true },
  { id: 'temperatureC', label: 'Temperature', group: 'Metabolism', type: 'number', role: 'setting', unit: '°C', min: 30, max: 42, step: 0.1, defaultValue: 37, writable: true, snapshotPath: 'patient.temperatureC' },
  { id: 'spontaneousRespiratoryRate', label: 'Spontaneous respiratory rate', group: 'Respiratory', type: 'number', role: 'setting', unit: '/min', min: 0, max: 40, step: 1, defaultValue: 12, writable: true, snapshotPath: 'patient.respiratory.spontaneousRespiratoryRate' },
  { id: 'spontaneousTidalVolumeMl', label: 'Spontaneous tidal volume', group: 'Respiratory', type: 'number', role: 'setting', unit: 'mL', min: 50, max: 1500, step: 10, defaultValue: 500, writable: true, snapshotPath: 'patient.respiratory.spontaneousTidalVolumeMl' },
  { id: 'deadSpaceMl', label: 'Dead space', group: 'Respiratory', type: 'number', role: 'setting', unit: 'mL', min: 0, max: 500, step: 10, defaultValue: 150, writable: true, snapshotPath: 'patient.respiratory.deadSpaceMl' },
  { id: 'complianceMlPerCmH2O', label: 'Respiratory compliance', group: 'Respiratory', type: 'number', role: 'setting', unit: 'mL/cmH₂O', min: 5, max: 200, step: 5, defaultValue: 70, writable: true, snapshotPath: 'patient.respiratory.complianceMlPerCmH2O' },
  { id: 'expiratoryResistanceCmH2OLs', label: 'Expiratory resistance', group: 'Respiratory', type: 'number', role: 'setting', unit: 'cmH₂O/L/s', min: 1, max: 60, step: 1, defaultValue: 8, writable: true, snapshotPath: 'patient.respiratory.expiratoryResistanceCmH2OLs' },
  { id: 'frcMl', label: 'Functional residual capacity', group: 'Respiratory', type: 'number', role: 'setting', unit: 'mL', min: 500, max: 6000, step: 100, defaultValue: 2500, writable: true, snapshotPath: 'patient.respiratory.frcMl' },
  { id: 'shuntFraction', label: 'Shunt fraction', group: 'Respiratory', type: 'number', role: 'setting', min: 0, max: 0.8, step: 0.01, defaultValue: 0.03, writable: true, snapshotPath: 'patient.respiratory.shuntFraction' },
  { id: 'maxSpO2', label: 'Maximum SpO₂', group: 'Respiratory', type: 'number', role: 'setting', unit: '%', min: 50, max: 100, step: 1, defaultValue: 100, writable: true, snapshotPath: 'patient.respiratory.maxSpO2' },
  { id: 'oxygenConsumptionMlMin', label: 'VO₂', group: 'Metabolism', type: 'number', role: 'setting', unit: 'mL/min', min: 50, max: 600, step: 10, defaultValue: 250, writable: true, snapshotPath: 'patient.respiratory.oxygenConsumptionMlMin' },
  { id: 'co2ProductionMlMin', label: 'VCO₂', group: 'Metabolism', type: 'number', role: 'setting', unit: 'mL/min', min: 50, max: 600, step: 10, defaultValue: 250, writable: true, snapshotPath: 'patient.respiratory.co2ProductionMlMin' },
  { id: 'sex', label: 'Sex', group: 'Patient', type: 'select', role: 'setting', options: [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }], writable: true, snapshotPath: 'patient.respiratory.sex' },
  { id: 'heightCm', label: 'Height', group: 'Patient', type: 'number', role: 'setting', unit: 'cm', min: 50, max: 220, step: 1, defaultValue: 170, writable: true, snapshotPath: 'patient.respiratory.heightCm' },
  { id: 'anaestheticSensitivity', label: 'Anaesthetic sensitivity', group: 'Anaesthesia', type: 'number', role: 'setting', min: -1, max: 1, step: 0.1, defaultValue: 0, writable: true, snapshotPath: 'patient.anaestheticPhysiology.anaestheticSensitivity' },
  { id: 'anaestheticResponse', label: 'Anaesthetic haemodynamic response', group: 'Anaesthesia', type: 'number', role: 'setting', min: -1, max: 1, step: 0.1, defaultValue: 0, writable: true, snapshotPath: 'patient.anaestheticPhysiology.anaestheticResponse' },
  { id: 'depthOfAnaesthesia', label: 'Depth of anaesthesia', group: 'Anaesthesia', type: 'number', role: 'setting', min: 1, max: 5, step: 1, defaultValue: 5, writable: true, snapshotPath: 'patient.anaestheticPhysiology.depthOfAnaesthesia' },
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
