import assert from 'node:assert/strict'
import { SessionEngineV2 } from '../src/session-v2/engine.mjs'
import { createMemoryCheckpointStore } from '../src/session-v2/checkpointStore.mjs'
import { createAnaesthSessionAdapter } from '../src/session-v2/adapters/anaesth.mjs'
import { createAnaesthDeclarativeActionEvaluator } from '../src/session-v2/adapters/actionEffects.mjs'

const definition = {
  id: 'propofol', name: 'Propofol', kind: 'drug', setting: 'ana',
  candidate_access: 'allowed', short_press_action: 'momentary',
  effects: [{ id: 'hypnotic', target: 'anaesthesia.hypnoticEffect', operation: 'target',
    value: 0.8, onsetSeconds: 10, durationSeconds: 60, recoverySeconds: 120 }],
}
const adapter = createAnaesthSessionAdapter({
  initialPatient: { heartRate: 78, systolicPressure: 122, diastolicPressure: 68,
    spo2: 98, peripheralPerfusion: 1, anaestheticGases: { fiSevoPercent: 0 } },
  applyAction: createAnaesthDeclarativeActionEvaluator({
    getDefinition: id => id === 'propofol' ? definition : null,
  }),
})
const store = createMemoryCheckpointStore()
const engine = new SessionEngineV2({
  sessionId: 'durable-ana', mode: 'simulation', instructorId: 'instructor', adapter,
})
engine.join({ participantId: 'candidate', role: 'candidate' })
engine.start('instructor')
const command = (instance, id, participantId, type, payload = {}, epoch = instance.snapshot.session.epoch) =>
  instance.submit({ id, participantId, epoch, runtimeId: 'main', type, payload })
const administered = command(engine, 'admin-1', 'candidate', 'action.invoke', { actionId: 'propofol' })
assert.equal(administered.accepted, true)
const gas = command(engine, 'gas-1', 'candidate', 'anaesth.gas.set', { fiSevoPercent: 2.5 })
assert.equal(gas.accepted, true)
const before = engine.snapshot
let previousRevision = null
await store.save(engine.exportCheckpoint(), previousRevision)
previousRevision = before.session.revision
const loaded = await store.load('durable-ana')
loaded.snapshot.runtimes[0].state.patient.heartRate = 0
assert.equal(engine.snapshot.runtimes[0].state.patient.heartRate, 78, 'storage must clone on load')
await assert.rejects(store.save(engine.exportCheckpoint(), null), /checkpoint-revision-conflict/)
await assert.rejects(store.save(engine.exportCheckpoint(), previousRevision), /checkpoint-revision-conflict/)
let recovered = SessionEngineV2.fromCheckpoint({
  checkpoint: await store.load('durable-ana'), adapter, expectedSessionId: 'durable-ana',
})
assert.equal(recovered.snapshot.session.status, 'recovering')
assert.equal(recovered.snapshot.session.epoch, before.session.epoch + 1)
assert.equal(recovered.snapshot.runtimes[0].state.patient.anaestheticGases.fiSevoPercent, 2.5)
assert.equal(recovered.snapshot.runtimes[0].state.actionRuntime.activeEffects.length, 1)
assert.equal(command(recovered, 'admin-2', 'candidate', 'action.invoke', { actionId: 'propofol' }).reason, 'participant-disconnected')
recovered.recover('instructor') // trusted host must authenticate before calling this
recovered.recover('candidate')
assert.equal(command(recovered, 'old-epoch', 'candidate', 'action.invoke', { actionId: 'propofol' }, before.session.epoch).reason, 'stale-epoch')
assert.equal(command(recovered, 'admin-1', 'candidate', 'action.invoke', { actionId: 'propofol' }).accepted, true)
assert.equal(recovered.snapshot.runtimes[0].state.actionRuntime.activeEffects.length, 1, 'recovered receipt prevents duplicate drug')
assert.equal(command(recovered, 'admin-2', 'candidate', 'action.invoke', { actionId: 'propofol' }).accepted, true)
assert.equal(recovered.snapshot.runtimes[0].state.actionRuntime.activeEffects.length, 2)
const renewed = recovered.exportCheckpoint()
await store.save(renewed, previousRevision)
assert.equal((await store.load('durable-ana')).snapshot.session.revision, renewed.snapshot.session.revision)
await assert.rejects(store.save(engine.exportCheckpoint(), renewed.snapshot.session.revision), /checkpoint-revision-conflict/, 'old writer cannot overwrite newer checkpoint')

const isolated = new SessionEngineV2({ sessionId: 'teach', mode: 'teaching', instructorId: 'i', adapter })
isolated.join({ participantId: 'a', role: 'candidate' })
isolated.join({ participantId: 'b', role: 'candidate' })
isolated.start('i')
assert.equal(command(isolated, 'gas-a', 'a', 'anaesth.gas.set', { fiSevoPercent: 4 }).reason, 'forbidden-runtime')
assert.equal(isolated.submit({ id: 'gas-a', participantId: 'a', epoch: 1, runtimeId: 'a',
  type: 'anaesth.gas.set', payload: { fiSevoPercent: 4 } }).accepted, true)
const restoredTeaching = SessionEngineV2.fromCheckpoint({ checkpoint: isolated.exportCheckpoint(), adapter })
assert.equal(restoredTeaching.snapshot.runtimes.find(r => r.id === 'a').state.patient.anaestheticGases.fiSevoPercent, 4)
assert.equal(restoredTeaching.snapshot.runtimes.find(r => r.id === 'b').state.patient.anaestheticGases.fiSevoPercent, 0)

const malformed = isolated.exportCheckpoint()
malformed.snapshot.runtimes = []
assert.throws(() => SessionEngineV2.fromCheckpoint({ checkpoint: malformed, adapter }), /Missing teaching candidate runtime/)
assert.throws(() => SessionEngineV2.fromCheckpoint({ checkpoint: isolated.exportCheckpoint(), adapter, expectedSessionId: 'wrong' }), /Wrong session/)
const ended = new SessionEngineV2({ sessionId: 'end', mode: 'simulation', instructorId: 'i', adapter })
ended.start('i')
assert.equal(ended.submit({ id: 'end-1', participantId: 'i', epoch: 1, type: 'end' }).accepted, true)
const endRestored = SessionEngineV2.fromCheckpoint({ checkpoint: ended.exportCheckpoint(), adapter })
assert.equal(endRestored.snapshot.session.status, 'ended')
assert.throws(() => endRestored.recover('i'), /ended session/)
const local = new SessionEngineV2({ sessionId: 'local', mode: 'standalone', adapter })
local.join({ participantId: 'learner', role: 'learner' })
local.start('learner')
const localRestored = SessionEngineV2.fromCheckpoint({ checkpoint: local.exportCheckpoint(), adapter })
assert.equal(localRestored.snapshot.session.status, 'active')
localRestored.recover('learner')
assert.equal(localRestored.snapshot.participants[0].connected, true)
console.log('Session Engine v2 checkpoint recovery / CAS regressions passed')
