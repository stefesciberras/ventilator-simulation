import { useMemo } from 'react'
import type { InstructorScenarioSnapshot } from '../../instructorAccount'
import { normaliseEduventScenario } from '../../eduvent/scenarioCodec'
import { createScenarioRepository, type ScenarioRepositoryRow } from './ScenarioRepository'
import { useScenarioLibraryManager } from './useScenarioLibraryManager'

export type EduventScenarioRow = ScenarioRepositoryRow<InstructorScenarioSnapshot>

/** EDUVENT adapter over the shared EDUSIM scenario repository. */
export function useEduventScenarioLibrary(enabled: boolean) {
  const repository = useMemo(() => createScenarioRepository<InstructorScenarioSnapshot>('eduvent', {
    encode: normaliseEduventScenario,
    decode: (scenario) => normaliseEduventScenario(scenario as InstructorScenarioSnapshot),
  }), [])

  return useScenarioLibraryManager<EduventScenarioRow, InstructorScenarioSnapshot>({ enabled, repository })
}
