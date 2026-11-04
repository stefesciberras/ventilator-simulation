import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { advanceAlveolarCo2, alveolarVentilationFromBreathing } from '../src/core/physiology/respiratory/sharedCo2Kinetics.mjs'
import { SessionEngineV2 } from '../src/session-v2/engine.mjs'
import { createAnaesthSessionAdapter } from '../src/session-v2/adapters/anaesth.mjs'
import { createAnaesthV2PilotEvaluator } from '../src/session-v2/adapters/anaesthPilot.mjs'

const close = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-8,
  `${message}: ${a} versus ${b}`)
const baseline = { respiratoryRate: 12, tidalVolumeMl: 500, deadSpaceMl: 150 }
const v = alveolarVentilationFromBreathing(baseline)
close(v.alveolarVentilationLMin, 4.2, 'alveolar ventilation')
close(v.minuteVentilationLMin, 6, 'minute ventilation')
const single = advanceAlveolarCo2({
  previousAlveolarCo2MmHg: 40, ...baseline, sex: 'male', heightCm: 170,
  co2ProductionMlMin: 250, deltaSeconds: 1,
})
const pbw = Math.max(20, 50 + .91 * (170 - 152.4))
const oldFormula = Math.max(0, Math.min(150, 40 +
  (.863 * (250 - (4.2 * 40 / .863)) / Math.max(15, pbw * .55) / 60)))
close(single.alveolarCo2MmHg, oldFormula, 'exact pre-extraction CO2 equation')
assert.equal(single.estimatedEtCo2MmHg, single.alveolarCo2MmHg)
const noVent = advanceAlveolarCo2({
  previousAlveolarCo2MmHg: 40, ...baseline, respiratoryRate: 0, deltaSeconds: 60,
})
assert.ok(noVent.alveolarCo2MmHg > 40, 'apnoea causes CO2 accumulation')
assert.throws(()=>advanceAlveolarCo2({
  previousAlveolarCo2MmHg: 40, ...baseline, deltaSeconds: -1,
}), /invalid-co2-input/)

const patient = { heartRate: 78, systolicPressure: 122, diastolicPressure: 68,
  spo2: 98, peripheralPerfusion: 1, respiratory: { ...baseline, frcMl: 2500 },
  anaestheticGases: { fiSevoPercent: 0 }, anaestheticPhysiology: { depthOfAnaesthesia: 5 } }
const adapter = createAnaesthSessionAdapter({ initialPatient: patient,
  applyAction: createAnaesthV2PilotEvaluator() })
const engine = new SessionEngineV2({
  sessionId: 'co2-integration', mode: 'simulation', instructorId: 'inst', adapter,
})
engine.join({ participantId: 'candidate', role: 'candidate' })
engine.start('inst')
let seq = 0
const send = (who, type, payload={}) => engine.submit({
  id: 'co2-'+(++seq), epoch: engine.snapshot.session.epoch,
  participantId: who, runtimeId: 'main', type, payload,
})
const state = () => engine.snapshot.runtimes[0].state
const tick = () => assert.equal(send('inst', 'tick', { deltaMs: 1000 }).accepted, true)
assert.equal(state().respiratoryRuntime.estimatedEtCo2MmHg,40)
for (let i=0;i<120;i++) tick()
assert.ok(state().respiratoryRuntime.estimatedEtCo2MmHg > 40)
close(state().respiratoryRuntime.respiratoryRate, 12, 'baseline RR')
const beforeDrug = state().respiratoryRuntime.estimatedEtCo2MmHg
assert.equal(send('candidate','action.invoke',{actionId:'propofol'}).accepted,true)
for (let i=0;i<90;i++) tick()
assert.ok(state().respiratoryRuntime.respiratoryRate < 12, 'propofol causes reduced RR')
assert.ok(state().respiratoryRuntime.estimatedEtCo2MmHg > beforeDrug,
  'CO2 accumulates during reduced respiratory drive')
const saved = engine.exportCheckpoint()
const recovered = SessionEngineV2.fromCheckpoint({checkpoint:saved,adapter})
assert.deepEqual(recovered.snapshot.runtimes[0].state.respiratoryRuntime,
  state().respiratoryRuntime, 'reconnect preserves CO2 kinetics and RR')
assert.equal(send('candidate','device.parameter.set',{path:'ventilatorSetRate',value:15}).accepted,true)
assert.equal(send('inst','reset').accepted,true)
assert.equal(state().respiratoryRuntime.estimatedEtCo2MmHg,40)
assert.equal(state().respiratoryRuntime.respiratoryRate,12)
assert.equal(state().actionRuntime.simulationTime,0)
const read = p => readFileSync(p,'utf8')
const core = read('src/core/physiology/respiratory/RespiratoryPhysiology.ts')
const capno = read('src/edumon/EdumonCapnographySurface.tsx')
const app = read('src/edumon/EdumonApp.tsx')
const preview = read('src/edumon/AnaesthSessionV2Preview.tsx')
assert.ok(core.includes('advanceAlveolarCo2({'), 'v1 must call the shared CO2 kernel')
assert.ok(capno.includes('if (v2RespiratoryState !== undefined) return'),
  'v2 must disable browser-local respiratory gas-exchange loop')
assert.ok(capno.includes('displayedEtCo2 == null'), 'capnography must read canonical EtCO2')
assert.ok(app.includes('onRespiratorySnapshot={setV2RespiratoryState}'),
  'v2 snapshots must reach capnography via app')
assert.ok(preview.includes('estimatedEtCo2MmHg: runtime?.respiratoryRuntime?.estimatedEtCo2MmHg'),
  'v2 preview must publish checkpointed respiratory readings')
console.log('Shared CO2 kinetics, v2 hypoventilation, checkpoint/reset and capnography authority regressions passed')
