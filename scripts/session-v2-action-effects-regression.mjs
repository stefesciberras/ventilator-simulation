import assert from 'node:assert/strict'
import { SessionEngineV2 } from '../src/session-v2/engine.mjs'
import { createAnaesthSessionAdapter } from '../src/session-v2/adapters/anaesth.mjs'
import { createAnaesthDeclarativeActionEvaluator } from '../src/session-v2/adapters/actionEffects.mjs'

const effects = [{
  id: 'hypnosis', target: 'anaesthesia.hypnoticEffect', operation: 'target',
  value: 0.8, onsetSeconds: 10, durationSeconds: 45, recoverySeconds: 100,
}]
const definitions = new Map([
  ['propofol', { id: 'propofol', name: 'Propofol', kind: 'drug', setting: 'ana',
    short_press_action: 'momentary', candidate_access: 'allowed', effects }],
  ['relaxant', { id: 'relaxant', name: 'Relaxant', kind: 'drug', setting: 'ana',
    short_press_action: 'momentary', candidate_access: 'instructor-only', effects }],
  ['tiva', { id: 'tiva', name: 'TIVA', kind: 'drug', setting: 'ana',
    short_press_action: 'toggle', candidate_access: 'allowed', effects }],
  ['icu-only', { id: 'icu-only', kind: 'drug', setting: 'itu',
    short_press_action: 'momentary', candidate_access: 'allowed', effects }],
])
const evaluator = createAnaesthDeclarativeActionEvaluator({
  getDefinition: id => definitions.get(id) ?? null,
})
const patient = { heartRate: 78, systolicPressure: 122, diastolicPressure: 68, spo2: 98,
  peripheralPerfusion: 1, anaestheticGases: { fiSevoPercent: 0 } }
const engine = new SessionEngineV2({
  sessionId: 'ana-validated', mode: 'simulation', instructorId: 'inst',
  adapter: createAnaesthSessionAdapter({ initialPatient: patient, applyAction: evaluator }),
})
engine.join({ participantId: 'learner', role: 'candidate' })
engine.start('inst')
const submit = (id, type, payload, participantId = 'learner', epoch = engine.snapshot.session.epoch) =>
  engine.submit({ id, type, payload, participantId, runtimeId: 'main', epoch })
const state = () => engine.snapshot.runtimes[0].state
assert.equal(submit('p1', 'action.invoke', { actionId: 'propofol' }).accepted, true)
assert.equal(state().patient.heartRate, 78, 'drug must not directly mutate monitor state')
assert.equal(state().actionRuntime.activeEffects[0].effect.target, 'anaesthesia.hypnoticEffect')
assert.equal(state().actionRuntime.activeEffects[0].instanceId, 'propofol:hypnosis:p1')
assert.equal(submit('p1', 'action.invoke', { actionId: 'propofol' }).accepted, true)
assert.equal(state().actionRuntime.activeEffects.length, 1, 'deduplicate accepted action')
assert.equal(submit('r1', 'action.invoke', { actionId: 'relaxant' }).reason, 'adapter-error')
assert.equal(submit('icu', 'action.invoke', { actionId: 'icu-only' }).reason, 'adapter-error')
assert.equal(submit('bad', 'action.invoke', { actionId: 'unknown' }).reason, 'adapter-error')
assert.equal(submit('r2', 'action.invoke', { actionId: 'relaxant' }, 'inst').accepted, true)
assert.equal(state().actionRuntime.activeEffects.length, 2)
assert.equal(submit('t1', 'action.invoke', { actionId: 'tiva' }).accepted, true)
assert.equal(state().actionRuntime.activeToggleActions.length, 1)
assert.equal(submit('t2', 'action.invoke', { actionId: 'tiva' }).accepted, true)
assert.equal(state().actionRuntime.activeToggleActions.length, 0)
assert.ok(state().actionRuntime.activeEffects.some(e => e.actionId === 'tiva' && e.stoppedAtSimulationTime === 0))
assert.equal(submit('tick1', 'tick', { deltaMs: 500 }, 'inst').accepted, true)
assert.equal(state().actionRuntime.simulationTime, 0.5)
assert.equal(engine.snapshot.session.clockMs, 500)
assert.equal(submit('reset', 'reset', {}, 'inst').accepted, true)
assert.equal(state().actionRuntime.activeEffects.length, 0)
assert.equal(state().actionRuntime.simulationTime, 0)
engine.disconnect('inst')
const oldEpoch = engine.snapshot.session.epoch
engine.recover('inst')
assert.equal(submit('old', 'action.invoke', { actionId: 'propofol' }, 'learner', oldEpoch).reason, 'stale-epoch')
assert.equal(submit('new', 'action.invoke', { actionId: 'propofol' }).accepted, true)
assert.equal(state().actionRuntime.activeEffects.length, 1)
assert.equal(patient.heartRate, 78)
console.log('Session v2 declarative action integration regression passed')
