import type { LoppjuSimRuntimeMode } from '../core/runtimeModes'
import type { EdumonSimulationSpeed } from './EdumonTopBar'
import type { MonitorPatientState } from './types'
import type { TeachingScenarioDefinition } from '../teaching/scenario/runtimeCore'
import type { SharedScenarioActor } from '../teaching/scenario/authoringTypes'

export interface EdumonScenarioMonitoringSnapshot {
  invasiveBloodPressure?: boolean
  bis?: boolean
  capnography?: boolean
  temperature?: boolean
}

export interface EdumonScenarioSnapshot {
  patient: MonitorPatientState
  simulationPaused: boolean
  simulationSpeed: EdumonSimulationSpeed
  /**
   * Optional monitor/display capabilities controlled by a scenario stage.
   * Kept separate from patient physiology so scenarios can add/remove monitoring
   * without mutating the underlying clinical state.
   */
  monitoring?: EdumonScenarioMonitoringSnapshot
}

export type EdumonScenarioMetric =
  | 'heartRate'
  | 'systolicPressure'
  | 'diastolicPressure'
  | 'meanPressure'
  | 'pulsePressure'
  | 'spo2'
  | 'peripheralPerfusion'
  | 'totalRespiratoryRate'

export type EdumonScenarioTrigger =
  | { type: 'manual' }
  | { type: 'time'; seconds: number }
  | { type: 'condition'; metric: EdumonScenarioMetric; operator: 'lt' | 'eq' | 'gt'; value: number }
  | { type: 'patient-change'; parameter: keyof MonitorPatientState; actor?: SharedScenarioActor }
  | { type: 'parameter-change'; parameterId: string; snapshotPath: string; actor?: SharedScenarioActor }
  | { type: 'edusim-action'; actionId: string; actor?: SharedScenarioActor }
  | { type: 'question-any' }
  | { type: 'question-correct' }
  | { type: 'media-ended' }
  | { type: 'media-acknowledged' }

export interface EdumonStoredScenario {
  schemaVersion: 1 | 2 | 3
  kind: 'static' | 'dynamic'
  description: string
  supportedModes?: LoppjuSimRuntimeMode[]
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
      stages: [{ id: `${id}-stage-1`, name: 'Initial state', snapshot, triggers: [{ type: 'manual' }], content: { kind: 'state' } }],
      branches: [],
    },
  }
}
