import type { InstructorPresetRow, InstructorScenarioSnapshot } from '../../../instructorAccount'
import type { ProductScenarioRow } from '../../../teaching/scenario/productLibrary'
import { SharedScenarioEditorFramework } from '../../SharedScenarioEditorFramework'
import { createRuntimeAwareVentilatorAuthoringAdapter } from './runtimeModeAuthoringAdapter'

interface VentilatorScenarioEditorProps {
  seedScenario: InstructorScenarioSnapshot
  dynamicPresets: InstructorPresetRow[]
  staticPresets: InstructorPresetRow[]
  onRefresh: () => Promise<void>
  onStartScenario: (preset: InstructorPresetRow) => void
  onClose: () => void
}

export function VentilatorScenarioEditor({ seedScenario, onStartScenario }: VentilatorScenarioEditorProps) {
  return <SharedScenarioEditorFramework
    adapter={createRuntimeAwareVentilatorAuthoringAdapter(seedScenario)}
    onStartScenario={(row: ProductScenarioRow<InstructorScenarioSnapshot>) => onStartScenario(row as InstructorPresetRow)}
  />
}
