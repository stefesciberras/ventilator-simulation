import assert from 'node:assert/strict'
import { SessionEngineV2 } from '../src/session-v2/engine.mjs'
import { createMemoryAuthorityStore } from '../src/session-v2/authorityStore.mjs'
import { createSessionV2AuthorityHost } from '../src/session-v2/authorityHost.mjs'
import { createAnaesthSessionAdapter } from '../src/session-v2/adapters/anaesth.mjs'
import { createAnaesthDeclarativeActionEvaluator } from '../src/session-v2/adapters/actionEffects.mjs'

let currentTime = 1000000
const now = () => currentTime
const auth = async credential => {
  const users = {
    instructor: { participantId: 'i', role: 'instructor' },
    learner: { participantId: 'c', role: 'candidate' },
    intruder: { participantId: 'attacker', role: 'instructor' },
  }
  return users[credential] ?? null
}
const definition = {
  id: 'propofol', name: 'Propofol', setting: 'ana', kind: 'drug',
  candidate_access: 'allowed', short_press_action: 'momentary',
  effects: [{ id: 'hypnotic', target: 'anaesthesia.hypnoticEffect', operation: 'target',
    value: 0.7, onsetSeconds: 2, durationSeconds: 30, recoverySeconds: 40 }],
}
const adapter = createAnaesthSessionAdapter({
  initialPatient: { heartRate: 78, systolicPressure: 120, diastolicPressure: 70,
    peripheralPerfusion: 1, spo2: 98, anaestheticGases: { fiSevoPercent: 0 } },
  applyAction: createAnaesthDeclarativeActionEvaluator({ getDefinition: id => id === 'propofol' ? definition : null }),
})
const store = createMemoryAuthorityStore()
const makeHost = (s = store) => createSessionV2AuthorityHost({
  store: s, adapter, authenticate: auth, now, leaseDurationMs: 2000,
})
const engine = new SessionEngineV2({ sessionId: 's1', mode: 'simulation', instructorId: 'i', adapter })
engine.join({ participantId: 'c', role: 'candidate' })
engine.start('i')
const hostA = makeHost()
await hostA.create({ initialEngine: engine, credentials: 'instructor' })
assert.equal(hostA.snapshot.session.epoch, 1)
const makeCommand = (id, type = 'action.invoke', payload = { actionId: 'propofol' }, epoch = 1) =>
  ({ id, runtimeId: 'main', type, payload, epoch, participantId: 'i' })
const original = await hostA.submit({ credentials: 'learner', command: makeCommand('dose-1') })
assert.equal(original.accepted, true, 'verified candidate may administer permitted action')
assert.equal(hostA.snapshot.runtimes[0].state.actionRuntime.activeEffects.length, 1)
const receipt = await hostA.submit({ credentials: 'learner', command: makeCommand('dose-1') })
assert.deepEqual(receipt, original, 'same accepted command receipt returned without re-execution')
assert.equal((await store.load('s1')).snapshot.runtimes[0].state.actionRuntime.activeEffects.length, 1)
assert.equal((await store.load('s1')).snapshot.session.revision, hostA.snapshot.session.revision)
await assert.rejects(hostA.submit({ credentials: 'intruder', command: makeCommand('fake') }), /unrecognized-participant/)
await assert.rejects(hostA.submit({ credentials: 'bad-token', command: makeCommand('fake') }), /unauthenticated/)
await assert.rejects(hostA.renew({ credentials: 'learner' }), /forbidden-authority/)
const hostB = makeHost()
await assert.rejects(hostB.takeover({ sessionId: 's1', credentials: 'instructor' }), /authority-lease-held/)
await assert.rejects(hostB.takeover({ sessionId: 's1', credentials: 'intruder' }), /forbidden-authority/)
currentTime += 1500
await hostA.renew({ credentials: 'instructor' })
currentTime += 1800
await assert.rejects(hostB.takeover({ sessionId: 's1', credentials: 'instructor' }), /authority-lease-held/)
currentTime += 300
const snapshotBeforeTakeover = await store.load('s1')
const takeover = await hostB.takeover({ sessionId: 's1', credentials: 'instructor' })
assert.equal(takeover.session.status, 'active')
assert.equal(takeover.session.epoch, 3, 'recovered authority fences the old epoch')
assert.equal(takeover.runtimes[0].state.actionRuntime.activeEffects.length, 1)
assert.equal((await store.load('s1')).snapshot.session.epoch, 3)
assert.ok(takeover.session.revision > snapshotBeforeTakeover.snapshot.session.revision)
assert.equal((await hostB.submit({ credentials: 'learner', command: makeCommand('stale', 'action.invoke', { actionId: 'propofol' }, 1) })).reason, 'stale-epoch')
assert.equal((await hostB.submit({ credentials: 'learner', command: makeCommand('before-reconnect', 'action.invoke', { actionId: 'propofol' }, 3) })).reason, 'participant-disconnected')
await hostB.reconnect({ credentials: 'learner' })
const duplicate = await hostB.submit({ credentials: 'learner', command: makeCommand('dose-1', 'action.invoke', { actionId: 'propofol' }, 3) })
assert.equal(duplicate.accepted, true)
assert.equal(hostB.snapshot.runtimes[0].state.actionRuntime.activeEffects.length, 1, 'retained receipt prevents double dose')
const second = await hostB.submit({ credentials: 'learner', command: makeCommand('dose-2', 'action.invoke', { actionId: 'propofol' }, 3) })
assert.equal(second.accepted, true)
assert.equal(hostB.snapshot.runtimes[0].state.actionRuntime.activeEffects.length, 2)
await assert.rejects(hostA.submit({ credentials: 'learner', command: makeCommand('old-host') }), /authority-lease-lost/)
assert.equal(hostA.stopped, true, 'old host must stop following write rejection')
assert.equal((await store.load('s1')).snapshot.runtimes[0].state.actionRuntime.activeEffects.length, 2)
const unchangedRevision = hostB.snapshot.session.revision
const failingStore = createMemoryAuthorityStore()
const failedEngine = new SessionEngineV2({ sessionId: 'failed', mode: 'simulation', instructorId: 'i', adapter })
failedEngine.join({ participantId: 'c', role: 'candidate' })
failedEngine.start('i')
const brokenHost = makeHost({
  ...failingStore,
  commit: async () => { throw Error('disk-unavailable') },
})
await brokenHost.create({ initialEngine: failedEngine, credentials: 'instructor' })
await assert.rejects(brokenHost.submit({ credentials: 'learner', command: makeCommand('fail') }), /disk-unavailable/)
assert.equal(brokenHost.snapshot.runtimes[0].state.actionRuntime.activeEffects.length, 0,
  'failed persistence never changes acknowledged in-memory state')
assert.equal((await failingStore.load('failed')).snapshot.runtimes[0].state.actionRuntime.activeEffects.length, 0)
assert.equal(brokenHost.stopped, true)
assert.equal(hostB.snapshot.session.revision, unchangedRevision)
await assert.rejects(hostB.reconnect({ credentials: 'instructor' }), /instructor-requires-authority-takeover/)
console.log('Session v2 trusted authority / persist-before-ack regressions passed')
