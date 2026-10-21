export type ScenarioProductId = 'eduvent' | 'edumon-ana' | 'edumon-icu'

export interface ScenarioProductDefinition {
  id: ScenarioProductId
  label: string
  route: string
}

export const SCENARIO_PRODUCTS: Record<ScenarioProductId, ScenarioProductDefinition> = {
  eduvent: { id: 'eduvent', label: 'EDUVENT', route: '/eduvent' },
  'edumon-ana': { id: 'edumon-ana', label: 'EDUMON-Ana', route: '/edumon/ana' },
  'edumon-icu': { id: 'edumon-icu', label: 'EDUMON-ICU', route: '/edumon/icu' },
}

export function scenarioProductForEdumonModule(moduleId: 'ana' | 'icu'): ScenarioProductId {
  return moduleId === 'ana' ? 'edumon-ana' : 'edumon-icu'
}

export function isScenarioProductId(value: unknown): value is ScenarioProductId {
  return typeof value === 'string' && value in SCENARIO_PRODUCTS
}
