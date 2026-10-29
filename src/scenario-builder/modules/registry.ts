import type { InstructorPresetRow } from '../../instructorAccount'
import type { SharedScenarioTriggerRegistryItem } from '../../teaching/scenario/authoringTypes'
import type { ScenarioProductId } from '../../teaching/scenario/products'
import {
  isStudioMeasurable,
  isStudioTriggerable,
  type ScenarioModuleDefinition,
} from '../model'
import '../triggerPalette.css'
import { ANAESTH_SCENARIO_MODULE, ICU_SCENARIO_MODULE } from './edumon/definition'
import { VENTILATOR_SCENARIO_MODULE } from './ventilator/definition'

export const SCENARIO_MODULES: Array<ScenarioModuleDefinition<InstructorPresetRow>> = [
  VENTILATOR_SCENARIO_MODULE,
  ANAESTH_SCENARIO_MODULE,
  ICU_SCENARIO_MODULE,
]

export const DEFAULT_SCENARIO_MODULE_ID = 'ventilator'

export function getScenarioModuleDefinition(moduleId: string): ScenarioModuleDefinition<InstructorPresetRow> | undefined {
  return SCENARIO_MODULES.find((module) => module.id === moduleId)
}

const RUNTIME_TRIGGER_REGISTRY: SharedScenarioTriggerRegistryItem[] = [
  { id: 'runtime:manual', label: 'Instructor choice', group: 'Runtime', kind: 'manual' },
  { id: 'runtime:time', label: 'Time passed', group: 'Runtime', kind: 'time' },
]

/**
 * Builds Studio's static trigger vocabulary directly from product-owned variable metadata.
 * Register a variable once in the module; Studio exposure follows its `studio` metadata
 * (or the defaults defined in model.ts). Drugs/Events are appended dynamically.
 */
export function buildModuleTriggerRegistry(module: ScenarioModuleDefinition<InstructorPresetRow>): SharedScenarioTriggerRegistryItem[] {
  return [
    ...RUNTIME_TRIGGER_REGISTRY,
    ...module.variables.filter(isStudioMeasurable).map((variable) => ({
      id: `measurement:${variable.id}`,
      label: variable.label,
      group: variable.group,
      kind: 'measurement' as const,
      metric: variable.id.replace(/^measurement\./, ''),
      unit: variable.unit,
    })),
    ...module.variables.filter(isStudioTriggerable).map((variable) => ({
      id: `parameter-change:${variable.id}`,
      label: `${variable.label} changed`,
      group: variable.group,
      kind: 'parameter-change' as const,
      parameter: variable.id,
      actors: ['candidate', 'instructor', 'either'] as const,
    })),
  ]
}

export function getStudioTriggerRegistry(product: ScenarioProductId): SharedScenarioTriggerRegistryItem[] {
  const module = product === 'mv'
    ? VENTILATOR_SCENARIO_MODULE
    : product === 'icu'
      ? ICU_SCENARIO_MODULE
      : ANAESTH_SCENARIO_MODULE
  return buildModuleTriggerRegistry(module)
}
