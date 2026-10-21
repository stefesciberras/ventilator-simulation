import { useMemo } from 'react'
import {
  createInstructorPreset,
  deleteInstructorPreset,
  listInstructorPresets,
  updateInstructorPreset,
  type InstructorPresetRow,
  type InstructorScenarioSnapshot,
} from '../../instructorAccount'
import { useScenarioLibraryManager } from './useScenarioLibraryManager'

/**
 * Compatibility adapter for legacy EDUVENT presets. Keeping normalisation here
 * lets shared library management own CRUD without leaking the old preset
 * persistence API back into InstructorAccountControls.
 */
export function useEduventScenarioLibrary(enabled: boolean) {
  const repository = useMemo(() => ({
    list: () => listInstructorPresets('eduvent'),
    create: (name: string, scenario: InstructorScenarioSnapshot) => createInstructorPreset(name, scenario, 'eduvent'),
    update: (id: string, updates: { name?: string; scenario?: InstructorScenarioSnapshot }) => updateInstructorPreset(id, updates, 'eduvent'),
    remove: (id: string) => deleteInstructorPreset(id, 'eduvent'),
  }), [])

  return useScenarioLibraryManager<InstructorPresetRow, InstructorScenarioSnapshot>({ enabled, repository })
}
