import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SessionEngineV2 } from '../src/session-v2/engine.mjs'
import { createAnaesthSessionAdapter } from '../src/session-v2/adapters/anaesth.mjs'
import { resolveV2ActionNumber } from '../src/session-v2/adapters/anaesthPilot.mjs'
import { projectBronchospasmVentilation } from '../src/session-v2/adapters/bronchospasm.mjs'

const near = (actual, expected, label) =>
  assert.ok(Math.abs(actual - expected) < 1e-7, `${label}: ${actual} != ${expected}`)
const patient = {
  heartRate: 78, systolicPressure: 122, diastolicPressure: 68,
  spo2: 98, peripheralPerfusion: 1,
  respiratory: {
    ventilatorMode: 'VC-AC', respiratoryRate: 12, tidalVolumeMl: 500,
    ventilatorSetRate: 12, ventilatorSetTidalVolumeMl: 500,
    ventilatorInspiratoryTimeSeconds: 1, peepCmH2O: 5,
    spontaneousRespiratoryRate: 12, spontaneousTidalVolumeMl: 500,
    expiratoryResistanceCmH2OLs: 8, complianceMlPerCmH2O: 70,
    deadSpaceMl: 150, frcMl: 2500,
  },
  anaestheticGases: { fiSevoPercent: 0 },
  anaestheticPhysiology: { depthOfAnaesthesia: 5 },
}
const adapter = createAnaesthSessionAdapter({ initialPatient: patient })
const engine = new SessionEngineV2({
  sessionId: 'bronchospasm-test', mode: 'simulation', instructorId: 'instructor', adapter,
})
engine.join({ participantId: 'candidate', role: 'candidate' })
engine.start('instructor')
let sequence = 0
const send = (role, type, payload = {}) => engine.submit({
  id: `bronchospasm-${++sequence}`, participantId: role,
  epoch: engine.snapshot.session.epoch, runtimeId: 'main', type, payload,
})
const state = () => engine.snapshot.runtimes[0].state
const tick = () => assert.equal(send('instructor', 'tick', { deltaMs: 1000 }).accepted, true)
assert.deepEqual(state().bronchospasmRuntime, {
  targetSeverityPercent: 0, effectiveSeverityPercent: 0,
})
assert.equal(send('candidate', 'event.bronchospasm.set', { severityPercent: 75 }).accepted, false,
  'Candidate cannot set scenario severity')
for (const severityPercent of [-1, 101, NaN, '50', null]) {
  assert.equal(send('instructor', 'event.bronchospasm.set', { severityPercent }).accepted, false)
}
assert.equal(send('instructor', 'event.bronchospasm.set', {
  severityPercent: 50, forgedEffect: { target: 'heartRate', value: 100 },
}).accepted, false, 'Client cannot invent effects')
tick()
const basePressure = state().respiratoryRuntime.peakAirwayPressureCmH2O
const original = structuredClone(state().patient)
assert.equal(send('instructor', 'event.bronchospasm.set', { severityPercent: 100 }).accepted, true)
tick()
const oneSecond = state().bronchospasmRuntime.effectiveSeverityPercent
assert.ok(oneSecond > 0 && oneSecond < 100, 'Bronchospasm onset must be smooth')
assert.equal(state().respiratoryRuntime.peakAirwayPressureCmH2O > basePressure, true,
  'Bronchospasm raises VC resistive peak pressure')
for (let t=0; t<10; t++) tick()
const eventState = state()
assert.ok(eventState.bronchospasmRuntime.effectiveSeverityPercent > 99)
const obstruction = resolveV2ActionNumber(eventState.actionRuntime,'respiration.airwayObstruction',0)
near(obstruction, eventState.bronchospasmRuntime.effectiveSeverityPercent / 100, 'Canonical EventEffect matches severity')
assert.equal(eventState.actionRuntime.activeEffects.filter(e=>e.actionId==='bronchospasm').length,1,
  'Slider updates must not accumulate duplicate effects')
const severeVC = eventState.respiratoryRuntime
assert.ok(severeVC.expiratoryResistanceCmH2OLs > 30, 'Airway resistance increases')
assert.ok(severeVC.peakAirwayPressureCmH2O > basePressure + 10,
  'VC raises Ppeak without arbitrarily altering set pressure')
near(severeVC.tidalVolumeMl,500,'Volume-control tidal volume remains set')
assert.deepEqual(state().patient,original,'Event must not mutate raw patient controls')
const snapshot = engine.exportCheckpoint()
const recovered = SessionEngineV2.fromCheckpoint({checkpoint:snapshot,adapter})
assert.deepEqual(recovered.snapshot.runtimes[0].state.bronchospasmRuntime,
  state().bronchospasmRuntime)
near(recovered.snapshot.runtimes[0].state.respiratoryRuntime.peakAirwayPressureCmH2O,
  severeVC.peakAirwayPressureCmH2O,'Checkpoint persists pressure response')

assert.equal(send('candidate','device.ventilator.mode.set',{ mode:'PC-AC' }).accepted,true)
assert.equal(send('candidate','device.ventilator.mode.set',{ mode:'INVALID' }).accepted,false)
tick()
const pc = state().respiratoryRuntime
near(pc.peakAirwayPressureCmH2O,20,'PC Ppeak follows PEEP + set pressure')
assert.ok(pc.tidalVolumeMl < 500, 'PC delivered VT falls under obstruction')
const pcReference = projectBronchospasmVentilation({
  ...patient.respiratory, ventilatorMode: 'PC-AC', expiratoryResistanceCmH2OLs: 8,
})
assert.ok(pc.tidalVolumeMl < pcReference.tidalVolumeMl, 'PC airflow reduction is resistance dependent')
assert.equal(send('instructor','event.bronchospasm.set',{severityPercent:0}).accepted,true)
for (let t=0;t<20;t++) tick()
assert.ok(state().bronchospasmRuntime.effectiveSeverityPercent < .01)
assert.ok(state().respiratoryRuntime.expiratoryResistanceCmH2OLs < 8.01,
  'Resolution restores original airway resistance')
assert.equal(send('instructor','reset').accepted,true)
assert.deepEqual(state().bronchospasmRuntime, {
  targetSeverityPercent: 0, effectiveSeverityPercent: 0,
})
assert.equal(state().actionRuntime.activeEffects.filter(e=>e.actionId==='bronchospasm').length,0)
assert.equal(state().actionRuntime.simulationTime,0)
const read=p=>readFileSync(p,'utf8')
const capno = read('src/edumon/EdumonCapnographySurface.tsx')
const preview = read('src/edumon/AnaesthSessionV2Preview.tsx')
const ventilator = read('src/edumon/EdumonVentilatorControl.tsx')
const workspace = read('src/edumon/EdumonWorkspacePanel.tsx')
const worker = read('worker/sessionV2Room.mjs')
assert.ok(capno.includes('snapshot.expiratoryResistanceCmH2OLs'), 'Capnogram shape must use authoritative Event resistance')
assert.ok(capno.includes('const obstruction = clamp((tau - 0.45) / 1.8'), 'Resistance must control capnogram upstroke/plateau')
assert.ok(preview.includes('receiveSnapshot(packet.snapshot, packet.clock as ClockControl | undefined)'),
  'Fix 1Hz stuttering: snapshots must retain authoritative clock running/speed')
assert.ok(preview.includes("'event.bronchospasm.set'"), 'Pilot includes instructor severity control')
assert.ok(preview.includes("'device.ventilator.mode.set'"), 'Pilot permits pressure/volume mode validation')
assert.ok(ventilator.includes('displayedPeakPressure'), 'Ventilator monitored Ppeak must come from authority')
assert.ok(workspace.includes('v2RespiratoryState={v2RespiratoryState}'), 'Authority must reach actual ventilator monitor')
assert.ok(worker.includes("'event.bronchospasm.set'"), 'Worker gateway validates Event command')
console.log('Bronchospasm Event, pressure modes, shark-fin wiring, reset/reconnect and smooth clock regression passed')
