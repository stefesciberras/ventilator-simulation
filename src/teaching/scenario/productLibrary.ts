import { createScenarioRepository, type ScenarioRepositoryRow } from './ScenarioRepository'
import type { ScenarioProductId } from './products'

export type ProductScenarioRow<TScenario> = ScenarioRepositoryRow<TScenario>

export function listProductScenarios<TScenario>(product: ScenarioProductId): Promise<Array<ProductScenarioRow<TScenario>>> {
  return createScenarioRepository<TScenario>(product).list()
}

export function createProductScenario<TScenario>(product: ScenarioProductId, name: string, scenario: TScenario): Promise<ProductScenarioRow<TScenario>> {
  return createScenarioRepository<TScenario>(product).create(name, scenario)
}

export function updateProductScenario<TScenario>(product: ScenarioProductId, id: string, updates: { name?: string; scenario?: TScenario }): Promise<ProductScenarioRow<TScenario>> {
  return createScenarioRepository<TScenario>(product).update(id, updates)
}

export function deleteProductScenario(product: ScenarioProductId, id: string) {
  return createScenarioRepository<unknown>(product).remove(id)
}
