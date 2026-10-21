import type { EdumonSimulationSpeed } from './EdumonTopBar'
import type { MonitorPatientState } from './types'
import type { TeachingScenarioDefinition } from '../teaching/scenario/runtimeCore'

export interface EdumonScenarioSnapshot {
  patient: MonitorPatientState
  simulationPaused: boolean
  simulationSpeed: EdumonSimulationSpeed
}

export type EdumonScenarioMetric =
  | 'heartRate'
  | 'systolicPressure'
  | 'diastolicPressure'
  | 'meanPressure'
  | 'pulsePressure'
  | 'spo2'
  | 'peripheralPerfusion'

export type EdumonScenarioTrigger =
  | { type: 'manual' }
  | { type: 'time'; seconds: number }
  | { type: 'condition'; metric: EdumonScenarioMetric; operator: 'lt' | 'eq' | 'gt'; value: number }
  | { type: 'patient-change'; parameter: keyof MonitorPatientState }

export interface EdumonStoredScenario {
  schemaVersion: 1
  kind: 'static' | 'dynamic'
  description: string
  definition: TeachingScenarioDefinition<EdumonScenarioSnapshot, EdumonScenarioTrigger>
}

export function createStaticEdumonScenario(id: string, name: string, snapshot: EdumonScenarioSnapshot, description = ''): EdumonStoredScenario {
  return {
    schemaVersion: 1,
    kind: 'static',
    description,
    definition: {
      id,
      name,
      description,
      stages: [{ id: `${id}-stage-1`, name: 'Initial state', snapshot, triggers: [{ type: 'manual' }] }],
    },
  }
}
