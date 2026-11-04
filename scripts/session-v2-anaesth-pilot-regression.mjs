import assert from 'node:assert/strict'
import { SessionEngineV2 } from '../src/session-v2/engine.mjs'
import { createAnaesthSessionAdapter } from '../src/session-v2/adapters/anaesth.mjs'
import { createAnaesthV2PilotEvaluator, projectAnaesthV2Monitor,
  resolveV2ActionNumber, anaesthV2PilotActionIds } from '../src/session-v2/adapters/anaesthPilot.mjs'

const patient = {
  heartRate: 78, rhythm: 'sinus', systolicPressure: 122, diastolicPressure: 68,
  spo2: 98, peripheralPerfusion: 1, temperatureC: 37,
  respiratory: { respiratoryRate: 12, spontaneousRespiratoryRate: 12, tidalVolumeMl: 500,
    spontaneousTidalVolumeMl: 500 },
  anaestheticGases: { fiSevoPercent: 0 },
  anaestheticPhysiology: { depthOfAnaesthesia: 5 },
}
const adapter = createAnaesthSessionAdapter({ initialPatient: patient,
  applyAction: createAnaesthV2PilotEvaluator() })
const engine = new SessionEngineV2({
  sessionId: 'ana-pilot', mode: 'simulation', instructorId: 'inst', adapter,
})
engine.join({ participantId: 'candidate', role: 'candidate' })
engine.start('inst')
const send = (id, type, payload, participantId = 'candidate') => engine.submit({
  id, type, payload, participantId, runtimeId: 'main', epoch: engine.snapshot.session.epoch,
})
const state = () => engine.snapshot.runtimes.find(r => r.id === 'main').state
const project = () => projectAnaesthV2Monitor(state())
assert.deepEqual(anaesthV2PilotActionIds, ['propofol', 'fentanyl', 'relaxant'])
assert.equal(send('propofol-1', 'action.invoke', { actionId: 'propofol' }).accepted, true)
assert.equal(state().patient.heartRate, 78, 'Action must not directly mutate raw patient')
assert.equal(project().heartRate, 78, 'No effects at zero simulated time')
assert.equal(send('propofol-1', 'action.invoke', { actionId: 'propofol' }).accepted, true)
assert.equal(state().actionRuntime.activeEffects.length, 3, 'Duplicate dose must not replay')
assert.equal(send('untrusted', 'action.invoke', { actionId: 'unknown' }).accepted, false)
assert.equal(send('unauthorized-tick', 'tick', { deltaMs: 1000 }).accepted, false)
for (let i = 0; i < 30; i++) {
  assert.equal(send('t-' + i, 'tick', { deltaMs: 1000 }, 'inst').accepted, true)
}
assert.equal(state().actionRuntime.simulationTime, 30)
assert.equal(project().anaestheticPhysiology.depthOfAnaesthesia, 2)
assert.ok(project().systolicPressure < 122)
assert.ok(project().respiratory.spontaneousRespiratoryRate < 12)
assert.equal(state().patient.systolicPressure, 122)
assert.equal(send('fentanyl', 'action.invoke', { actionId: 'fentanyl' }).accepted, true)
assert.equal(send('relaxant', 'action.invoke', { actionId: 'relaxant' }).accepted, true)
for (let i = 30; i < 170; i++) {
  assert.equal(send('t-' + i, 'tick', { deltaMs: 1000 }, 'inst').accepted, true)
}
assert.ok(project().heartRate < 78)
assert.ok(project().respiratory.spontaneousRespiratoryRate < 2)
const checkpoint = engine.exportCheckpoint()
const restored = SessionEngineV2.fromCheckpoint({ checkpoint, adapter })
assert.deepEqual(projectAnaesthV2Monitor(restored.snapshot.runtimes[0].state), project())
assert.equal(restored.snapshot.runtimes[0].state.actionRuntime.activeEffects.length, 7)
assert.equal(send('reset', 'reset', {}, 'inst').accepted, true)
assert.equal(state().actionRuntime.activeEffects.length, 0)
assert.equal(project().anaestheticPhysiology.depthOfAnaesthesia, 5)
assert.equal(project().respiratory.spontaneousRespiratoryRate, 12)
assert.equal(resolveV2ActionNumber(state().actionRuntime, 'respiration.drive', 1), 1)
console.log('Session v2 Anaesth checkpointed ActionEffects / monitor projection regressions passed')
