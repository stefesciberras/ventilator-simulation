import type { EdumonStoredScenario } from '../../../edumon/scenarioTypes'
import type { ProductScenarioRow } from '../../../teaching/scenario/productLibrary'
import type { ScenarioProductId } from '../../../teaching/scenario/products'
import { RuntimeModeScenarioEditor } from '../../RuntimeModeScenarioEditor'
import { createEdumonAuthoringAdapter } from './authoringAdapter'
import { EdumonScenarioMonitoringEditor } from './EdumonScenarioMonitoringEditor'

interface EdumonScenarioEditorProps {
  product: Extract<ScenarioProductId, 'anaesth' | 'icu'>
  onStartScenario: (row: ProductScenarioRow<EdumonStoredScenario>) => void
}

export function EdumonScenarioEditor({ product, onStartScenario }: EdumonScenarioEditorProps) {
  const label = product === 'anaesth' ? 'LoppjuSIM-Anaesth' : 'LoppjuSIM-ICU'
  const adapter = createEdumonAuthoringAdapter(product, label)

  if (product === 'anaesth') {
    const renderBaseSnapshotEditor = adapter.renderSnapshotEditor
    adapter.renderSnapshotEditor = (snapshot, onChange, options) => <>
      {renderBaseSnapshotEditor(snapshot, onChange, options)}
      <EdumonScenarioMonitoringEditor
        snapshot={snapshot}
        onChange={onChange}
        appliedVariableIds={options?.appliedVariableIds}
        onAppliedVariableIdsChange={options?.onAppliedVariableIdsChange}
      />
    </>
  }

  return <RuntimeModeScenarioEditor adapter={adapter} onStartScenario={onStartScenario} />
}
