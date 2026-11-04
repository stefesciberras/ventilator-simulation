/**
 * Declarative Drugs & Events reducer for Session Engine v2.
 *
 * The caller MUST supply a trusted, local, synchronously readable definition
 * library. No network calls, global ActionRuntime singleton or direct changes
 * to measured values occur here. This reducer creates canonical ActiveEffects
 * compatible with the current EDUSIM ActionRuntimeSnapshot schema.
 */
const clone = value => structuredClone(value)
const finite = value => typeof value === 'number' && Number.isFinite(value)
const allowedTargets = new Set([
  'haemodynamics.heartRate', 'haemodynamics.meanArterialPressure',
  'respiration.drive', 'respiration.airwayObstruction',
  'neuromuscular.block', 'neuromuscular.tofMinimumCount',
  'anaesthesia.hypnoticEffect', 'anaesthesia.nociceptiveResponse',
  'stimulus.sympathetic',
])
const allowedOperations = new Set(['offset', 'set', 'multiplier', 'target', 'increment', 'constraint', 'trigger'])
const allowedConstraints = new Set(['block-increase', 'block-decrease', 'minimum', 'maximum'])

function validateDefinition(definition, requestedId) {
  if (!definition || definition.id !== requestedId || !['ana', 'all'].includes(definition.setting) ||
      !['drug', 'event'].includes(definition.kind) ||
      !['momentary', 'toggle'].includes(definition.short_press_action) ||
      !Array.isArray(definition.effects)) throw new Error('Unsupported action definition')
  for (const effect of definition.effects) {
    if (!effect || typeof effect.id !== 'string' || !effect.id ||
        !allowedTargets.has(effect.target) || !allowedOperations.has(effect.operation) ||
        !finite(effect.value) || ![effect.onsetSeconds, effect.durationSeconds, effect.recoverySeconds]
          .every(n => finite(n) && n >= 0) ||
        (effect.operation === 'constraint' && !allowedConstraints.has(effect.constraint))) {
      throw new Error('Invalid action effect')
    }
  }
}

/**
 * @param {object} options
 * @param {(id:string)=>object|null} options.getDefinition - preloaded, trusted library only
 * @param {(definition:object,context:object)=>boolean} [options.authorize] - additional host policy
 */
export function createAnaesthDeclarativeActionEvaluator({ getDefinition, authorize } = {}) {
  if (typeof getDefinition !== 'function') throw new Error('Trusted action library is required')
  return function evaluate(state, request, context) {
    const definition = getDefinition(request.actionId)
    validateDefinition(definition, request.actionId)
    // Existing action candidate_access defaults to instructor-only.
    if (context.actorRole !== 'instructor' && context.mode !== 'standalone') {
      if (definition.candidate_access !== 'allowed') throw new Error('Candidate action forbidden')
    }
    if (authorize && authorize(definition, context) !== true) throw new Error('Action not authorized')
    const runtime = state.actionRuntime
    if (!runtime || !finite(runtime.simulationTime) ||
        !Array.isArray(runtime.activeEffects) || !Array.isArray(runtime.activeToggleActions)) {
      throw new Error('Invalid action runtime')
    }
    const next = clone(runtime)
    const at = next.simulationTime
    const running = next.activeToggleActions.find(action => action.actionId === definition.id)
    if (definition.short_press_action === 'toggle' && running) {
      next.activeToggleActions = next.activeToggleActions.filter(action => action.actionId !== definition.id)
      next.activeEffects = next.activeEffects.map(effect =>
        effect.actionId === definition.id && effect.mode === 'toggle' && effect.stoppedAtSimulationTime == null
          ? { ...effect, stoppedAtSimulationTime: at } : effect)
    } else {
      const intensity = request.intensity ?? 1
      const actionPriority = finite(definition.priority) ? definition.priority : 30
      const commandId = context.commandId
      if (typeof commandId !== 'string' || !commandId) throw new Error('Command ID required')
      const created = definition.effects.map(effect => ({
        instanceId: `${definition.id}:${effect.id}:${commandId}`,
        actionId: definition.id,
        actionName: definition.name,
        actionKind: definition.kind,
        mode: definition.short_press_action,
        intensity,
        effect: { ...clone(effect), priority: finite(effect.priority) ? effect.priority : actionPriority },
        startedAtSimulationTime: at,
      }))
      next.activeEffects.push(...created)
      if (definition.short_press_action === 'toggle') {
        next.activeToggleActions.push({
          actionId: definition.id,
          actionName: definition.name,
          actionKind: definition.kind,
          intensity,
          startedAtSimulationTime: at,
          effectIds: definition.effects.map(effect => effect.id),
        })
      }
    }
    return { ...state, actionRuntime: next }
  }
}
