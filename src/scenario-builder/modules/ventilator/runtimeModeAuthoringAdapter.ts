import type { LoppjuSimRuntimeMode } from '../../../core/runtimeModes'
import type { InstructorScenarioSnapshot } from '../../../instructorAccount'
import type { SharedScenarioEditorAdapter } from '../../../teaching/scenario/authoringTypes'
import { createVentilatorAuthoringAdapter } from './authoringAdapter'

type RuntimeAwareVentilatorScenario = InstructorScenarioSnapshot & {
  /** Omitted by legacy scenarios; omission means compatible with all modes. */
  supportedModes?: LoppjuSimRuntimeMode[]
}

/**
 * Keep runtime-mode metadata in the shared Studio layer without coupling the
 * ventilator physiology/scenario codec to session transport concerns.
 */
export function createRuntimeAwareVentilatorAuthoringAdapter(
  seed: InstructorScenarioSnapshot,
): SharedScenarioEditorAdapter<InstructorScenarioSnapshot, InstructorScenarioSnapshot> {
  const base = createVentilatorAuthoringAdapter(seed)
  return {
    ...base,
    toDocument: (name, scenario) => ({
      ...base.toDocument(name, scenario),
      supportedModes: (scenario as RuntimeAwareVentilatorScenario).supportedModes,
    }),
    fromDocument: (document) => ({
      ...base.fromDocument(document),
      supportedModes: document.supportedModes,
    } as RuntimeAwareVentilatorScenario),
  }
}
