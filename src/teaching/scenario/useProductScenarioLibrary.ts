import { useMemo } from 'react'
import {
  createProductScenario,
  deleteProductScenario,
  listProductScenarios,
  updateProductScenario,
  type ProductScenarioRow,
} from './productLibrary'
import type { ScenarioProductId } from './products'
import { useScenarioLibraryManager } from './useScenarioLibraryManager'

/**
 * Product-neutral saved-scenario controller. Simulator code supplies only the
 * product id and scenario payload type; CRUD, busy/error state and refresh are
 * shared across EDUSIM.
 */
export function useProductScenarioLibrary<TScenario>(product: ScenarioProductId, enabled = true) {
  const repository = useMemo(() => ({
    list: () => listProductScenarios<TScenario>(product),
    create: (name: string, scenario: TScenario) => createProductScenario(product, name, scenario),
    update: (id: string, updates: { name?: string; scenario?: TScenario }) => updateProductScenario(product, id, updates),
    remove: (id: string) => deleteProductScenario(product, id),
  }), [product])

  return useScenarioLibraryManager<ProductScenarioRow<TScenario>, TScenario>({ enabled, repository })
}
