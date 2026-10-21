import { EDUSIM_PRODUCTS } from '../../core/products'
import type { SimulationProductId } from '../../core/SimulationProductAdapter'

export type ScenarioProductId = SimulationProductId

export interface ScenarioProductDefinition {
  id: ScenarioProductId
  label: string
  route: string
}

export const SCENARIO_PRODUCTS: Record<ScenarioProductId, ScenarioProductDefinition> = {
  eduvent: { id: 'eduvent', label: EDUSIM_PRODUCTS.eduvent.label, route: EDUSIM_PRODUCTS.eduvent.route },
  'edumon-ana': { id: 'edumon-ana', label: EDUSIM_PRODUCTS['edumon-ana'].label, route: EDUSIM_PRODUCTS['edumon-ana'].route },
  'edumon-icu': { id: 'edumon-icu', label: EDUSIM_PRODUCTS['edumon-icu'].label, route: EDUSIM_PRODUCTS['edumon-icu'].route },
}

export function scenarioProductForEdumonModule(moduleId: 'ana' | 'icu'): ScenarioProductId {
  return moduleId === 'ana' ? 'edumon-ana' : 'edumon-icu'
}

export function isScenarioProductId(value: unknown): value is ScenarioProductId {
  return typeof value === 'string' && value in SCENARIO_PRODUCTS
}
