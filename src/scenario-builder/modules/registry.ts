import type { InstructorPresetRow } from '../../instructorAccount'
import type { SharedScenarioTriggerRegistryItem } from '../../teaching/scenario/authoringTypes'
import type { ScenarioProductId } from '../../teaching/scenario/products'
import type { ScenarioModuleDefinition } from '../model'
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
 * Builds the static trigger vocabulary directly from a product module.
 * Measurements become threshold conditions; writable settings become parameter-change events.
 * Drugs/Events are appended dynamically by products that use the shared action library.
 */
export function buildModuleTriggerRegistry(module: ScenarioModuleDefinition<InstructorPresetRow>): SharedScenarioTriggerRegistryItem[] {
  const byId = new Map(module.variables.map((variable) => [variable.id, variable]))
  const measurementIds = [...new Set(module.triggerSources
    .filter((source) => source.kind === 'measurement')
    .map((source) => source.variableId))]
  const parameterIds = [...new Set(module.triggerSources
    .filter((source) => source.kind === 'candidate-action' || source.kind === 'instructor-action')
    .map((source) => source.variableId))]

  return [
    ...RUNTIME_TRIGGER_REGISTRY,
    ...measurementIds.flatMap((id) => {
      const variable = byId.get(id)
      return variable ? [{
        id: `measurement:${id}`,
        label: variable.label,
        group: variable.group,
        kind: 'measurement' as const,
        metric: id.replace(/^measurement\./, ''),
        unit: variable.unit,
      }] : []
    }),
    ...parameterIds.flatMap((id) => {
      const variable = byId.get(id)
      return variable ? [{
        id: `parameter-change:${id}`,
        label: `${variable.label} changed`,
        group: variable.group,
        kind: 'parameter-change' as const,
        parameter: id,
        actors: ['candidate', 'instructor', 'either'] as const,
      }] : []
    }),
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
