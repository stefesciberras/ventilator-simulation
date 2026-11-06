import assert from 'node:assert/strict'
import { SessionEngineV2 } from '../src/session-v2/engine.mjs'
import { createAnaesthV2SessionAdapter, projectAnaesthV2SessionSnapshot,
  projectAnaesthV2SessionLibrary } from '../src/session-v2/anaesthSession.mjs'
import { legacyAnaesthV2Library } from '../src/session-v2/adapters/anaesthLibrary.mjs'

// The same setup must work without a Cloudflare runtime or network access.
const originalFetch = globalThis.fetch
globalThis.fetch = () => { throw Error('Unexpected network access') }
try {
  const library = legacyAnaesthV2Library()
  const adapter = createAnaesthV2SessionAdapter(library)
  assert.throws(() => createAnaesthV2SessionAdapter({}), /catalogue/)
  const engine = new SessionEngineV2({ sessionId: 'shared-ana', mode: 'simulation', instructorId: 'i', adapter })
  engine.join({ participantId: 'c', role: 'candidate' })
  engine.start('i')
  const submit = (id, type, payload, participantId = 'i') => {
    const receipt = engine.submit({ id, type, payload, participantId, runtimeId: 'main', epoch: engine.snapshot.session.epoch })
    assert.equal(receipt.accepted, true, JSON.stringify(receipt))
  }
  const initial = projectAnaesthV2SessionSnapshot(engine.snapshot).runtimes[0].state
  assert.equal(initial.monitorProjection.heartRate, 78)
  assert.equal(initial.monitorProjection.systolicPressure, 122)
  assert.equal(initial.effectIndicators.neuromuscularBlockPercent, 0)
  submit('hr', 'patient.parameter.set', { path: 'heartRate', value: 40, transitionSeconds: 10 })
  submit('drug', 'action.invoke', { actionId: 'propofol' }, 'c')
  for (let t = 0; t < 8; t++) submit(`tick-${t}`, 'tick', { deltaMs: 1000 })
  const before = engine.exportCheckpoint()
  const snapshot = engine.snapshot
  const input = structuredClone(snapshot)
  const projected = projectAnaesthV2SessionSnapshot(snapshot)
  const state = projected.runtimes[0].state
  assert.equal(state.monitorProjection.heartRate, state.monitorRuntime.modelledHeartRate)
  assert.ok(state.monitorProjection.heartRate < 50)
  assert.equal(state.alarmRuntime.evaluations.find(e => e.key === 'heartRateLow').active, true)
  assert.ok(state.actionRuntime.activeEffects.length > 0)
  assert.deepEqual(snapshot, input, 'Projection must not mutate its input')
  assert.deepEqual(engine.exportCheckpoint(), before, 'Presentation must not change durable physiology or receipts')
  assert.equal(before.snapshot.runtimes[0].state.monitorProjection, undefined)
  const restored = SessionEngineV2.fromCheckpoint({ checkpoint: before, adapter: createAnaesthV2SessionAdapter(library) })
  assert.deepEqual(projectAnaesthV2SessionSnapshot(restored.snapshot).runtimes, projected.runtimes)
  const publicLibrary = projectAnaesthV2SessionLibrary(library)
  assert.equal(publicLibrary.actions.length, library.definitions.length)
  assert.ok(publicLibrary.actions.every(action => !('effects' in action)))
  publicLibrary.actions[0].name = 'Changed presentation'
  assert.notEqual(library.definitions[0].name, 'Changed presentation')
  const empty = projectAnaesthV2SessionSnapshot({ runtimes: [{ id: 'empty', state: {} }] })
  assert.equal(empty.runtimes[0].state.monitorProjection, null)
  assert.equal(empty.runtimes[0].state.effectIndicators, null)
  console.log('Shared Anaesth session setup, projection, offline execution and checkpoint preservation passed')
} finally {
  globalThis.fetch = originalFetch
}
