import { SIMULATION_PRODUCTS } from '../../core/products'
import { normaliseSimulationProductId, type SimulationProductId } from '../../core/SimulationProductAdapter'

export type ScenarioProductId = SimulationProductId

export interface ScenarioProductDefinition {
  id: ScenarioProductId
  label: string
  route: string
}

export const SCENARIO_PRODUCTS: Record<ScenarioProductId, ScenarioProductDefinition> = {
  mv: { id: 'mv', label: SIMULATION_PRODUCTS.mv.label, route: SIMULATION_PRODUCTS.mv.route },
  anaesth: { id: 'anaesth', label: SIMULATION_PRODUCTS.anaesth.label, route: SIMULATION_PRODUCTS.anaesth.route },
  icu: { id: 'icu', label: SIMULATION_PRODUCTS.icu.label, route: SIMULATION_PRODUCTS.icu.route },
}

export function scenarioProductForEdumonModule(moduleId: 'ana' | 'icu'): ScenarioProductId {
  return moduleId === 'ana' ? 'anaesth' : 'icu'
}

export function isScenarioProductId(value: unknown): value is ScenarioProductId {
  return normaliseSimulationProductId(value) === value
}

export { normaliseSimulationProductId }
