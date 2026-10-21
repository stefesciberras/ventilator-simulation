import type { InstructorPresetRow, InstructorScenarioSnapshot } from '../../../instructorAccount'
import type { ProductScenarioRow } from '../../../teaching/scenario/productLibrary'
import { SharedScenarioEditorFramework } from '../../SharedScenarioEditorFramework'
import { createVentilatorAuthoringAdapter } from './authoringAdapter'

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
    adapter={createVentilatorAuthoringAdapter(seedScenario)}
    onStartScenario={(row: ProductScenarioRow<InstructorScenarioSnapshot>) => onStartScenario(row as InstructorPresetRow)}
  />
}
