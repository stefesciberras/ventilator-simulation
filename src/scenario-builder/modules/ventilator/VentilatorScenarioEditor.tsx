import { DynamicScenarioBuilder } from '../../../components/DynamicScenarioBuilder'
import type { InstructorPresetRow, InstructorScenarioSnapshot } from '../../../instructorAccount'

interface VentilatorScenarioEditorProps {
  seedScenario: InstructorScenarioSnapshot
  dynamicPresets: InstructorPresetRow[]
  staticPresets: InstructorPresetRow[]
  onRefresh: () => Promise<void>
  onStartScenario: (preset: InstructorPresetRow) => void
  onClose: () => void
}

export function VentilatorScenarioEditor({ seedScenario, dynamicPresets, staticPresets, onRefresh, onStartScenario, onClose }: VentilatorScenarioEditorProps) {
  return (
    <DynamicScenarioBuilder
      currentScenario={seedScenario}
      dynamicPresets={dynamicPresets}
      staticPresets={staticPresets}
      simulationPaused
      onSimulationPausedChange={() => undefined}
      onRefresh={onRefresh}
      onStartScenario={onStartScenario}
      onClose={onClose}
    />
  )
}
