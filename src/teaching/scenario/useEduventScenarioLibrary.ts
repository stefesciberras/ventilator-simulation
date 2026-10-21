import { useMemo } from 'react'
import {
  createInstructorPreset,
  deleteInstructorPreset,
  listInstructorPresets,
  updateInstructorPreset,
  type InstructorPresetRow,
  type InstructorScenarioSnapshot,
} from '../../instructorAccount'
import { useScenarioLibraryManager, type ScenarioLibraryRepository } from './useScenarioLibraryManager'

/**
 * Compatibility adapter for legacy EDUVENT presets. Keeping normalisation here
 * lets shared library management own CRUD without leaking the old preset
 * persistence API back into InstructorAccountControls.
 */
export function useEduventScenarioLibrary(enabled: boolean) {
  const repository = useMemo<ScenarioLibraryRepository<InstructorPresetRow, InstructorScenarioSnapshot>>(() => ({
    list: () => listInstructorPresets('eduvent'),
    create: (name, scenario) => createInstructorPreset(name, scenario, 'eduvent'),
    update: (id, updates) => updateInstructorPreset(id, updates, 'eduvent'),
    remove: (id) => deleteInstructorPreset(id, 'eduvent'),
  }), [])

  return useScenarioLibraryManager<InstructorPresetRow, InstructorScenarioSnapshot>({ enabled, repository })
}
