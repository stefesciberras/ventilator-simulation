import { activateAction, isActionToggleRunning, setActionIntensity } from '../edusim/actions/ActionRuntime'
import { listEdusimActions, type EdusimActionEnvironment } from './actionLibrary'
import type { EdumonActionCommandState } from './teachingState'

const definitionsByEnvironment = new Map<EdusimActionEnvironment, Awaited<ReturnType<typeof listEdusimActions>>>()

async function definitions(environment: EdusimActionEnvironment) {
  const cached = definitionsByEnvironment.get(environment)
  if (cached) return cached
  const loaded = await listEdusimActions(environment)
  definitionsByEnvironment.set(environment, loaded)
  return loaded
}

export async function applyReplicatedEdumonAction(
  environment: EdusimActionEnvironment,
  command: EdumonActionCommandState,
): Promise<boolean> {
  const action = (await definitions(environment)).find((candidate) => candidate.id === command.actionId)
  if (!action) return false

  if (command.type === 'intensity') {
    setActionIntensity(action.id, command.intensity ?? 1)
    return true
  }

  if (command.type === 'deactivate') {
    if (action.short_press_action === 'toggle' && isActionToggleRunning(action.id)) {
      activateAction(action, command.simulationTime, command.intensity ?? 1)
    }
    return true
  }

  // A candidate activation is replayed through the instructor-authoritative ActionRuntime.
  // For a toggle that is already running, do not accidentally interpret a duplicate packet
  // as a stop command; the explicit deactivate command handles that transition.
  if (action.short_press_action === 'toggle' && isActionToggleRunning(action.id)) return true
  activateAction(action, command.simulationTime, command.intensity ?? 1)
  return true
}
