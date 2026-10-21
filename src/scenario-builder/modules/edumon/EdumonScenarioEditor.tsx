import type { EdumonStoredScenario } from '../../../edumon/scenarioTypes'
import type { ProductScenarioRow } from '../../../teaching/scenario/productLibrary'
import type { ScenarioProductId } from '../../../teaching/scenario/products'
import { SharedScenarioEditorFramework } from '../../SharedScenarioEditorFramework'
import { createEdumonAuthoringAdapter } from './authoringAdapter'

interface EdumonScenarioEditorProps {
  product: Extract<ScenarioProductId, 'edumon-ana' | 'edumon-icu'>
  onStartScenario: (row: ProductScenarioRow<EdumonStoredScenario>) => void
}

export function EdumonScenarioEditor({ product, onStartScenario }: EdumonScenarioEditorProps) {
  const label = product === 'edumon-ana' ? 'EDUMON-Ana' : 'EDUMON-ICU'
  return <SharedScenarioEditorFramework adapter={createEdumonAuthoringAdapter(product, label)} onStartScenario={onStartScenario} />
}
