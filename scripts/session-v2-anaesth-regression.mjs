import assert from 'node:assert/strict'
import { SessionEngineV2 } from '../src/session-v2/engine.mjs'
import { createAnaesthSessionAdapter } from '../src/session-v2/adapters/anaesth.mjs'

const BASE_PATIENT = {
  heartRate: 78, systolicPressure: 122, diastolicPressure: 68, spo2: 98,
  peripheralPerfusion: 1, temperatureC: 37,
  respiratory: { respiratoryRate: 12, fio2: 0.21, peepCmH2O: 0 },
  anaestheticGases: { fiSevoPercent: 0 },
}
let drugExecutions = 0
const adapter = createAnaesthSessionAdapter({
  initialPatient: BASE_PATIENT,
  applyAction: (state, action) => {
    assert.equal(action.actionId, 'propofol')
    ++drugExecutions
    return { ...state, actionRuntime: { ...state.actionRuntime,
      activeEffects: [...state.actionRuntime.activeEffects,
        { actionId: 'propofol', intensity: action.intensity ?? 1 }] } }
  },
})
const session = new SessionEngineV2({ sessionId: 'ana-1', mode: 'simulation', instructorId: 'instructor', adapter })
session.join({ participantId: 'candidate', role: 'candidate' })
assert.throws(() => session.join({ participantId: 'candidate2', role: 'candidate' }), /one candidate/)
session.start('instructor')
const cmd = (id, participantId, type, payload = {}, runtimeId = 'main', epoch = session.snapshot.session.epoch) =>
  session.submit({ id, participantId, type, payload, runtimeId, epoch })
assert.equal(cmd('unauthorized', 'candidate', 'patient.parameter.set', { path: 'heartRate', value: 140 }).reason, 'adapter-error')
assert.equal(cmd('invalid-device', 'candidate', 'device.parameter.set', { path: 'foo', value: 4 }).accepted, false)
assert.equal(cmd('bad-gas', 'candidate', 'anaesth.gas.set', { fiSevoPercent: -2 }).accepted, false)
assert.equal(cmd('gas', 'candidate', 'anaesth.gas.set', { fiSevoPercent: 2 }).accepted, true)
assert.equal(session.snapshot.runtimes[0].state.patient.anaestheticGases.fiSevoPercent, 2)
assert.equal(cmd('rr', 'candidate', 'device.parameter.set', { path: 'ventilatorSetRate', value: 15 }).accepted, true)
assert.equal(session.snapshot.runtimes[0].state.patient.respiratory.ventilatorSetRate, 15)
assert.equal(cmd('drug', 'candidate', 'action.invoke', { actionId: 'propofol', intensity: 1 }).accepted, true)
assert.equal(cmd('drug', 'candidate', 'action.invoke', { actionId: 'propofol', intensity: 1 }).accepted, true)
assert.equal(drugExecutions, 1, 'duplicate drug command must not re-administer')
assert.equal(cmd('forged', 'candidate', 'action.invoke', { actionId: 'propofol', intensity: 1, activeEffects: [] }).accepted, false)
assert.equal(cmd('hr', 'instructor', 'patient.parameter.set', { path: 'heartRate', value: 95 }).accepted, true)
assert.equal(session.snapshot.runtimes[0].state.patient.heartRate, 95)
session.disconnect('instructor')
const oldEpoch = session.snapshot.session.epoch
session.recover('instructor')
assert.equal(cmd('stale', 'candidate', 'action.invoke', { actionId: 'propofol' }, 'main', oldEpoch).reason, 'stale-epoch')
assert.equal(cmd('reset', 'instructor', 'reset').accepted, true)
assert.equal(session.snapshot.runtimes[0].state.patient.anaestheticGases.fiSevoPercent, 0)
assert.equal(session.snapshot.runtimes[0].state.actionRuntime.activeEffects.length, 0)
assert.equal(BASE_PATIENT.anaestheticGases.fiSevoPercent, 0, 'seed input must not be mutated')

const failClosed = new SessionEngineV2({ sessionId: 'ana-2', mode: 'simulation', instructorId: 'instructor',
  adapter: createAnaesthSessionAdapter({ initialPatient: BASE_PATIENT }) })
failClosed.join({ participantId: 'candidate', role: 'candidate' })
failClosed.start('instructor')
assert.equal(failClosed.submit({ id: 'drug', participantId: 'candidate', epoch: 1, type: 'action.invoke',
  runtimeId: 'main', payload: { actionId: 'propofol' } }).reason, 'adapter-error')

const teaching = new SessionEngineV2({ sessionId: 'ana-3', mode: 'teaching', instructorId: 'instructor', adapter })
teaching.join({ participantId: 'a', role: 'candidate' })
teaching.join({ participantId: 'b', role: 'candidate' })
teaching.start('instructor')
assert.equal(teaching.submit({ id: 'g', participantId: 'a', epoch: 1, type: 'anaesth.gas.set',
  runtimeId: 'a', payload: { fiSevoPercent: 4 } }).accepted, true)
assert.equal(teaching.snapshot.runtimes.find(r => r.id === 'a').state.patient.anaestheticGases.fiSevoPercent, 4)
assert.equal(teaching.snapshot.runtimes.find(r => r.id === 'b').state.patient.anaestheticGases.fiSevoPercent, 0)
console.log('Session v2 Anaesth adapter regression checks passed')
