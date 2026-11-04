import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SessionEngineV2 } from '../src/session-v2/engine.mjs'
import { createAnaesthSessionAdapter } from '../src/session-v2/adapters/anaesth.mjs'

const read = path => readFileSync(path, 'utf8')
const preview = read('src/edumon/AnaesthSessionV2Preview.tsx')
const app = read('src/edumon/EdumonApp.tsx')
const panel = read('src/edumon/EdumonWorkspacePanel.tsx')
const gas = read('src/edumon/EdumonAnaGasControl.tsx')
assert.ok(preview.includes('volatileCallbackRef.current(typeof etSevo'), 'v2 canonical EtSevo must be forwarded to monitor')
assert.ok(preview.includes('volatileCallbackRef.current(null)'), 'connecting/disconnecting must clear stale v2 gas display')
assert.ok(app.includes('onVolatileSnapshot={setV2EtSevo}'), 'v2 preview must publish EtSevo into main monitor')
assert.ok(app.includes('v2VolatileState={v2PreviewEnabled ? { etSevoPercent: v2EtSevo } : undefined}'),
  'only experimental v2 receives external gas authority; v1 is unchanged')
assert.ok(panel.includes('v2VolatileState={v2VolatileState}'), 'workspace must propagate canonical EtSevo')
assert.ok(gas.includes('if (externalV2Gas) return\n    let frame = 0'),
  'local v1 gas animation must not run during v2 authority')
assert.ok(gas.includes('displayedEtSevo.toFixed(1)'), 'full gas footer must render canonical EtSevo')
assert.ok(gas.includes('displayedMac.toFixed(1)'), 'full MAC footer must render canonical EtSevo-derived MAC')
assert.ok(gas.includes('disabled={externalV2Gas}'), 'do not allow unsynchronized local FiSevo slider edits')

const patient = { heartRate: 78, systolicPressure: 122, diastolicPressure: 68,
  spo2: 98, peripheralPerfusion: 1, anaestheticGases: { fiSevoPercent: 0 },
  respiratory: { tidalVolumeMl: 500, deadSpaceMl: 150, respiratoryRate: 12, frcMl: 2500 } }
const adapter = createAnaesthSessionAdapter({ initialPatient: patient })
const engine = new SessionEngineV2({ sessionId: 'v2-gas-visual', mode: 'simulation',
  instructorId: 'instructor', adapter })
engine.join({ participantId: 'candidate', role: 'candidate' })
engine.start('instructor')
let sequence = 0
const send = (type, actor, payload = {}) => engine.submit({
  id: 'visual-' + ++sequence, type, participantId: actor, payload,
  epoch: engine.snapshot.session.epoch, runtimeId: 'main',
})
const state = () => engine.snapshot.runtimes[0].state
assert.equal(send('anaesth.gas.set', 'candidate', { fiSevoPercent: 4 }).accepted, true)
for (let i=0; i<100; i++) assert.equal(send('tick', 'instructor', { deltaMs: 1000 }).accepted, true)
const et = state().gasRuntime.etSevoPercent
assert.ok(et > 0, 'EtSevo accumulates during canonical simulation ticks')
assert.equal(state().patient.anaestheticGases.fiSevoPercent, 4)
const restored = SessionEngineV2.fromCheckpoint({ checkpoint: engine.exportCheckpoint(), adapter })
assert.equal(restored.snapshot.runtimes[0].state.gasRuntime.etSevoPercent, et)
assert.equal(restored.snapshot.runtimes[0].state.patient.anaestheticGases.fiSevoPercent, 4)
assert.equal(send('reset', 'instructor').accepted, true)
assert.equal(state().gasRuntime.etSevoPercent, 0, 'reset clears canonical EtSevo')
assert.equal(state().patient.anaestheticGases.fiSevoPercent, 0, 'reset clears inspired concentration')
assert.equal(state().actionRuntime.simulationTime, 0)
console.log('Session v2 Anaesth volatile display single-authority, reset and recovery regression passed')
