import assert from 'node:assert/strict'
import { advanceEndTidalSevo, anaestheticDepthFromMac, effectiveSevoDepth,
  estimatedAlveolarVentilationLMin } from '../src/edumon/sharedVolatilePhysiology.mjs'
import { createAnaesthSessionAdapter } from '../src/session-v2/adapters/anaesth.mjs'
import { createAnaesthV2PilotEvaluator, projectAnaesthV2Monitor } from '../src/session-v2/adapters/anaesthPilot.mjs'
import { SessionEngineV2 } from '../src/session-v2/engine.mjs'

const near = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-9, `${message}: ${a} != ${b}`)
assert.equal(anaestheticDepthFromMac(0, 0), 5)
assert.equal(anaestheticDepthFromMac(1, 0), 3)
assert.equal(anaestheticDepthFromMac(2, 0), 1)
assert.equal(effectiveSevoDepth(2, 0), 3)
assert.equal(effectiveSevoDepth(2, 1), 2)
assert.equal(effectiveSevoDepth(2, -1), 4)
const sample = { etSevoPercent: 0, fiSevoPercent: 2,
  alveolarVentilationLMin: 4.2, frcMl: 2500, dtSeconds: 1 }
const step = advanceEndTidalSevo(sample)
assert.ok(step > 0 && step < 2)
const afterTwo = advanceEndTidalSevo({ ...sample, etSevoPercent: step })
const oneContinuous = advanceEndTidalSevo({ ...sample, dtSeconds: 2 })
near(afterTwo, oneContinuous, 'Variable-step gas uptake must compose')
near(estimatedAlveolarVentilationLMin({
  respiratoryRate: 12, tidalVolumeMl: 500, deadSpaceMl: 150 }), 4.2, 'Alveolar estimate')
assert.throws(() => advanceEndTidalSevo({ ...sample, dtSeconds: -1 }), /Invalid volatile/)
assert.throws(() => advanceEndTidalSevo({ ...sample, alveolarVentilationLMin: NaN }), /Invalid volatile/)
const patient = { heartRate: 78, rhythm: 'sinus', systolicPressure: 122, diastolicPressure: 68,
  spo2: 98, peripheralPerfusion: 1, respiratory: {
    respiratoryRate: 12, spontaneousRespiratoryRate: 12,
    tidalVolumeMl: 500, spontaneousTidalVolumeMl: 500,
    deadSpaceMl: 150, frcMl: 2500 },
  anaestheticGases: { fiSevoPercent: 0 },
  anaestheticPhysiology: { depthOfAnaesthesia: 5, anaestheticSensitivity: 0 },
}
const adapter = createAnaesthSessionAdapter({ initialPatient: patient,
  applyAction: createAnaesthV2PilotEvaluator() })
const session = new SessionEngineV2({
  sessionId: 'shared-volatile-regression', mode: 'simulation', instructorId: 'inst', adapter,
})
session.join({ participantId: 'candidate', role: 'candidate' })
session.start('inst')
let nextId = 0
const run = (type, participantId, payload={}) => session.submit({
  id: 'v-' + ++nextId, type, participantId, payload,
  runtimeId: 'main', epoch: session.snapshot.session.epoch,
})
const state = () => session.snapshot.runtimes[0].state
assert.equal(state().gasRuntime.etSevoPercent, 0)
assert.equal(run('anaesth.gas.set', 'candidate', { fiSevoPercent: 4 }).accepted, true)
const raw = structuredClone(state().patient)
for (let i=0; i<240; i++) assert.equal(run('tick', 'inst', { deltaMs: 1000 }).accepted, true)
assert.ok(state().gasRuntime.etSevoPercent > 0)
assert.ok(state().gasRuntime.etSevoPercent < 4)
assert.deepEqual(state().patient, raw, 'Gas kinetics must not mutate baseline patient settings')
let expectedEt = 0
for (let i=0; i<4; i++) expectedEt = advanceEndTidalSevo({
  etSevoPercent: expectedEt, fiSevoPercent: 4, alveolarVentilationLMin: 4.2,
  frcMl: 2500, dtSeconds: 60,
})
near(state().gasRuntime.etSevoPercent, expectedEt, 'v2 authoritative EtSevo follows shared model')
assert.equal(projectAnaesthV2Monitor(state()).anaestheticPhysiology.depthOfAnaesthesia,
  effectiveSevoDepth(expectedEt, 0))
const checkpoint = session.exportCheckpoint()
const restored = SessionEngineV2.fromCheckpoint({ checkpoint, adapter })
near(restored.snapshot.runtimes[0].state.gasRuntime.etSevoPercent, expectedEt,
  'EtSevo survives checkpoint restoration')
assert.equal(run('anaesth.gas.set', 'candidate', { fiSevoPercent: 0 }).accepted, true)
const prior = state().gasRuntime.etSevoPercent
for (let i=0; i<100; i++) assert.equal(run('tick', 'inst', { deltaMs: 1000 }).accepted, true)
assert.ok(state().gasRuntime.etSevoPercent < prior, 'Sevo must wash out')
assert.equal(run('reset', 'inst').accepted, true)
assert.equal(state().gasRuntime.etSevoPercent, 0)
assert.equal(state().patient.anaestheticGases.fiSevoPercent, 0)
assert.equal(state().actionRuntime.simulationTime, 0)
assert.equal(projectAnaesthV2Monitor(state()).anaestheticPhysiology.depthOfAnaesthesia, 5)
const legacy = adapter.initialState('main')
delete legacy.gasRuntime
const oldState = adapter.apply(legacy, { type: 'tick', payload: { deltaMs: 1000 } }, { actorRole: 'instructor' })
assert.ok(Number.isFinite(oldState.gasRuntime.etSevoPercent), 'Legacy checkpoint can adopt gas runtime')
console.log('Shared volatile uptake/depth, v2 wash-in/out, reset and checkpoint recovery passed')

