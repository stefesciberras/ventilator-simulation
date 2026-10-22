import { useMemo } from 'react'
import { createScenarioRepository, type ScenarioCodec } from './ScenarioRepository'
import type { ProductScenarioRow } from './productLibrary'
import type { ScenarioProductId } from './products'
import { useScenarioLibraryManager } from './useScenarioLibraryManager'

/**
 * Product-neutral saved-scenario controller. Simulator code supplies the
 * product id, payload type and (when required) a product codec; CRUD,
 * busy/error state and refresh remain shared across EDUSIM.
 */
export function useProductScenarioLibrary<TScenario>(
  product: ScenarioProductId,
  enabled = true,
  codec?: ScenarioCodec<TScenario>,
) {
  const repository = useMemo(
    () => createScenarioRepository<TScenario>(product, codec),
    [product, codec],
  )

  return useScenarioLibraryManager<ProductScenarioRow<TScenario>, TScenario>({ enabled, repository })
}
