import {
  activateAction,
  clearActionRuntime,
  deactivateAction,
  setActionRuntimeSimulationTime,
  type ActionRuntimeSnapshot,
  type ActiveEffect,
} from '../edusim/actions/ActionRuntime'

function groupKey(effect: ActiveEffect) {
  return `${effect.actionId}|${effect.mode}|${effect.startedAtSimulationTime}|${effect.intensity}`
}

/**
 * Rebuild the authoritative ActionRuntime from a candidate snapshot without looking
 * up cloud action definitions. ActiveEffect already carries the complete declarative
 * effect definition, keeping the Simulation fast path usable with no Internet access.
 */
export function applyReplicatedEdumonActionSnapshot(snapshot: ActionRuntimeSnapshot): void {
  clearActionRuntime()

  const groups = new Map<string, ActiveEffect[]>()
  for (const effect of snapshot.activeEffects) {
    const key = groupKey(effect)
    const bucket = groups.get(key) ?? []
    bucket.push(effect)
    groups.set(key, bucket)
  }

  const representedToggleIds = new Set<string>()
  for (const effects of groups.values()) {
    const first = effects[0]
    if (!first) continue
    activateAction({
      id: first.actionId,
      name: first.actionName,
      kind: first.actionKind,
      short_press_action: first.mode,
      effects: effects.map((entry) => ({ ...entry.effect })),
    }, first.startedAtSimulationTime, first.intensity)

    if (first.mode === 'toggle') {
      representedToggleIds.add(first.actionId)
      const stoppedAt = effects.find((entry) => entry.stoppedAtSimulationTime != null)?.stoppedAtSimulationTime
      if (stoppedAt != null) {
        setActionRuntimeSimulationTime(stoppedAt)
        deactivateAction(first.actionId)
      }
    }
  }

  // Preserve running toggle actions with no physiological effects (for example
  // scenario/logging actions), which are absent from activeEffects by definition.
  for (const toggle of snapshot.activeToggleActions) {
    if (representedToggleIds.has(toggle.actionId)) continue
    activateAction({
      id: toggle.actionId,
      name: toggle.actionName,
      kind: toggle.actionKind,
      short_press_action: 'toggle',
      effects: [],
    }, toggle.startedAtSimulationTime, toggle.intensity)
  }

  setActionRuntimeSimulationTime(snapshot.simulationTime)
}
