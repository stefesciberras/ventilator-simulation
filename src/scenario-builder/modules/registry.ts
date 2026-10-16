import type { InstructorPresetRow } from '../../instructorAccount'
import type { ScenarioModuleDefinition } from '../model'

export const SCENARIO_MODULES: Array<ScenarioModuleDefinition<InstructorPresetRow>> = [
  {
    id: 'ventilator',
    label: 'Mechanical ventilation',
    shortLabel: 'Ventilator',
    description: 'EDUVENT patient, ventilator and physiology scenarios.',
    available: true,
    supportsPreset: (preset) => preset.scenario.kind === 'dynamic',
  },
]

export const DEFAULT_SCENARIO_MODULE_ID = 'ventilator'
