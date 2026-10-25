import type { InstructorPresetRow } from '../../instructorAccount'
import type { ScenarioModuleDefinition } from '../model'
import { VENTILATOR_SCENARIO_MODULE } from './ventilator/definition'

const ANAESTH_MODULE: ScenarioModuleDefinition<InstructorPresetRow> = {
  id: 'anaesth',
  schemaVersion: 1,
  label: 'LoppjuSIM-Anaesth',
  shortLabel: 'Anaesthesia monitor',
  description: 'Anaesthesia patient-monitor scenarios using the shared LoppjuSIM scenario library.',
  available: true,
  variables: [],
  templates: [],
  triggerSources: [],
  supportsPreset: (preset) => preset.product === 'anaesth',
}

const ICU_MODULE: ScenarioModuleDefinition<InstructorPresetRow> = {
  id: 'icu',
  schemaVersion: 1,
  label: 'LoppjuSIM-ICU',
  shortLabel: 'ICU monitor',
  description: 'Intensive-care patient-monitor scenarios using the shared LoppjuSIM scenario library.',
  available: true,
  variables: [],
  templates: [],
  triggerSources: [],
  supportsPreset: (preset) => preset.product === 'icu',
}

export const SCENARIO_MODULES: Array<ScenarioModuleDefinition<InstructorPresetRow>> = [
  VENTILATOR_SCENARIO_MODULE,
  ANAESTH_MODULE,
  ICU_MODULE,
]

export const DEFAULT_SCENARIO_MODULE_ID = 'ventilator'

export function getScenarioModuleDefinition(moduleId: string): ScenarioModuleDefinition<InstructorPresetRow> | undefined {
  return SCENARIO_MODULES.find((module) => module.id === moduleId)
}
