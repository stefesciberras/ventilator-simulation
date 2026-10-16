import type { InstructorPresetRow } from '../../instructorAccount'
import type { ScenarioModuleDefinition } from '../model'
import { VENTILATOR_SCENARIO_MODULE } from './ventilator/definition'

export const SCENARIO_MODULES: Array<ScenarioModuleDefinition<InstructorPresetRow>> = [
  VENTILATOR_SCENARIO_MODULE,
]

export const DEFAULT_SCENARIO_MODULE_ID = 'ventilator'

export function getScenarioModuleDefinition(moduleId: string): ScenarioModuleDefinition<InstructorPresetRow> | undefined {
  return SCENARIO_MODULES.find((module) => module.id === moduleId)
}
