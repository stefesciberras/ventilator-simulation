import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SessionEngineV2 } from '../src/session-v2/engine.mjs'
import { createAnaesthSessionAdapter } from '../src/session-v2/adapters/anaesth.mjs'
import { createAnaesthV2PilotEvaluator } from '../src/session-v2/adapters/anaesthPilot.mjs'
import { advanceBisIndex, bisTargetForDepth, tofReadingFromBlock } from '../src/edumon/sharedAnaestheticMeasurements.mjs'

const read = path => readFileSync(path, 'utf8')
assert.equal(bisTargetForDepth(5), 100)
assert.equal(bisTargetForDepth(3), 50)
assert.equal(bisTargetForDepth(1), 20)
assert.equal(advanceBisIndex(100, 5, 1), 100)
assert.ok(advanceBisIndex(100, 2, 1) < 100)
const half = advanceBisIndex(100, 2, 1)
assert.ok(Math.abs(advanceBisIndex(half, 2, 1) - advanceBisIndex(100, 2, 2)) < 1e-10)
assert.deepEqual(tofReadingFromBlock(0), { count: 4, ratio: 1 })
assert.deepEqual(tofReadingFromBlock(0.95), { count: 0, ratio: 0 })
assert.deepEqual(tofReadingFromBlock(0.7), { count: 2, ratio: 0 })
assert.deepEqual(tofReadingFromBlock(0.95, 3), { count: 3, ratio: 0 })

const patient = {
  heartRate: 78, systolicPressure: 122, diastolicPressure: 68, spo2: 98,
  peripheralPerfusion: 1, anaestheticGases: { fiSevoPercent: 0 },
  anaestheticPhysiology: { depthOfAnaesthesia: 5 },
  respiratory: { respiratoryRate: 12, tidalVolumeMl: 500, deadSpaceMl: 150,
    spontaneousRespiratoryRate: 12, spontaneousTidalVolumeMl: 500, frcMl: 2500 },
}
const adapter = createAnaesthSessionAdapter({ initialPatient: patient,
  applyAction: createAnaesthV2PilotEvaluator() })
const engine = new SessionEngineV2({
  sessionId: 'bis-tof', mode: 'simulation', instructorId: 'inst', adapter,
})
engine.join({ participantId: 'candidate', role: 'candidate' })
engine.start('inst')
let i=0
const send = (participantId, type, payload={}) => engine.submit({
  id: 'mt-' + ++i, epoch: engine.snapshot.session.epoch,
  participantId, runtimeId: 'main', type, payload,
})
const state = () => engine.snapshot.runtimes[0].state
assert.deepEqual(state().monitorRuntime, { bisValue: 100, tofReading: null })
assert.equal(send('candidate','monitor.tof.measure').accepted,true)
assert.deepEqual(state().monitorRuntime.tofReading, {
  count: 4, ratio: 1, measuredAtSimulationTime: 0,
})
assert.equal(send('candidate','action.invoke',{actionId:'relaxant'}).accepted,true)
assert.equal(send('candidate','action.invoke',{actionId:'propofol'}).accepted,true)
assert.equal(send('candidate','monitor.tof.measure',{ count: 0 }).accepted,false,
  'Client cannot forge a TOF value')
for(let j=0;j<120;j++) assert.equal(send('inst','tick',{deltaMs:1000}).accepted,true)
assert.equal(state().actionRuntime.simulationTime,120)
assert.ok(state().monitorRuntime.bisValue < 100,
  'BIS follows a shared hypnotic target with modelled delay')
assert.deepEqual(state().monitorRuntime.tofReading, {
  count: 4, ratio: 1, measuredAtSimulationTime: 0,
}, 'TOF count remains last measured value during blockade')
assert.equal(send('candidate','monitor.tof.measure').accepted,true)
assert.deepEqual(state().monitorRuntime.tofReading, {
  count: 0, ratio: 0, measuredAtSimulationTime: 120,
})
const latestBis = state().monitorRuntime.bisValue
const checkpoint = engine.exportCheckpoint()
const recovered = SessionEngineV2.fromCheckpoint({ checkpoint, adapter })
assert.equal(recovered.snapshot.runtimes[0].state.monitorRuntime.bisValue,latestBis)
assert.deepEqual(recovered.snapshot.runtimes[0].state.monitorRuntime.tofReading,
  state().monitorRuntime.tofReading)
assert.equal(send('inst','reset').accepted,true)
assert.deepEqual(state().monitorRuntime, { bisValue: 100, tofReading: null })
assert.equal(state().actionRuntime.simulationTime,0)
assert.equal(state().gasRuntime.etSevoPercent,0)

const panel = read('src/edumon/EdumonAnaGasControl.tsx')
const bis = read('src/edumon/EdumonBisTrend.tsx')
const css = read('src/edumon/edumon-ana-gases.css')
const preview = read('src/edumon/AnaesthSessionV2Preview.tsx')
const app = read('src/edumon/EdumonApp.tsx')
const worker = read('worker/sessionV2Room.mjs')
assert.ok(panel.includes('v2-readonly'), 'v2 FiSevo must not look editable yellow')
assert.ok(css.includes('.edumon-gas-row.v2-readonly > strong'), 'Restore neutral FiSevo styling')
assert.ok(bis.includes('if (!ownsSurface || v2BisState !== undefined) return'),
  'v2 must disable competing v1 BIS clock')
assert.ok(panel.includes('tofValue?.count'), 'v2 TOF panel reads checkpointed measurement')
assert.ok(panel.includes('onV2TofMeasure?.()'), 'v2 TOF press is authoritative action')
assert.ok(preview.includes("command('monitor.tof.measure', {})"),
  'v2 preview must send TOF measure request')
assert.ok(app.includes('onMonitorSnapshot={setV2MonitorState}'),
  'full monitor receives authoritative BIS/TOF snapshot')
assert.ok(worker.includes("'monitor.tof.measure'"), 'Worker gateway must permit TOF command')
console.log('Shared BIS/TOF model, intermittent measurement, checkpoint recovery, reset and color regressions passed')
