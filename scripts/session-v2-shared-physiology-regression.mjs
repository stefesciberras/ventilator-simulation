import assert from 'node:assert/strict'
import {
  DEFAULT_RESPIRATORY_STATE, applySharedEdumonActionPhysiology,
  applySharedEdumonBounds, sharedAnaestheticDepth,
  saturatingSympatheticResponse,
} from '../src/edumon/sharedActionPhysiology.mjs'
import { getAnaesthV2PilotDefinitions, projectAnaesthV2Monitor, resolveV2ActionNumber } from '../src/session-v2/adapters/anaesthPilot.mjs'
import { createAnaesthV2PilotEvaluator } from '../src/session-v2/adapters/anaesthPilot.mjs'

const nearly = (actual, expected, label) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: expected ${expected}, got ${actual}`)
const patient = () => ({
  heartRate: 78, rhythm: 'sinus', systolicPressure: 122,
  diastolicPressure: 68, spo2: 98, peripheralPerfusion: 1,
  respiratory: { ...DEFAULT_RESPIRATORY_STATE },
  anaestheticPhysiology: { depthOfAnaesthesia: 5 },
})
const fixed = values => (target, base) => values[target] ?? base
const baseline = patient()
const unchanged = applySharedEdumonActionPhysiology(baseline, fixed({}))
assert.equal(unchanged.heartRate, 78)
assert.equal(unchanged.systolicPressure, 122)
assert.equal(unchanged.respiratory.respiratoryRate, 12)
assert.deepEqual(baseline, patient(), 'Pure physiology must not mutate baseline')

const inhibited = fixed({
  'respiration.drive': 0.4, 'neuromuscular.block': 0.75,
  'respiration.airwayObstruction': 0.5,
  'haemodynamics.meanArterialPressure': 78,
  'haemodynamics.heartRate': 63,
  'anaesthesia.hypnoticEffect': 0.65,
})
const manual = applySharedEdumonActionPhysiology(baseline, inhibited)
nearly(manual.respiratory.spontaneousRespiratoryRate, 1.2, 'MANUAL spontaneous RR')
nearly(manual.respiratory.respiratoryRate, 1.2, 'MANUAL effective RR')
nearly(manual.respiratory.tidalVolumeMl, 50, 'MANUAL VT')
nearly(manual.respiratory.expiratoryResistanceCmH2OLs, 24, 'airway obstruction')
nearly(manual.heartRate, 63, 'heart-rate target')
nearly(manual.systolicPressure, 122 + (78 - 86), 'MAP shift SBP')
nearly(manual.diastolicPressure, 68 + (78 - 86), 'MAP shift DBP')
assert.equal(sharedAnaestheticDepth(baseline, inhibited), 2)

const mandatory = patient()
mandatory.respiratory.ventilatorMode = 'VC-AC'
mandatory.respiratory.respiratoryRate = 14
mandatory.respiratory.tidalVolumeMl = 480
const controlled = applySharedEdumonActionPhysiology(mandatory, inhibited)
assert.equal(controlled.respiratory.respiratoryRate, 14, 'Mandatory breaths unaffected by relaxant')
assert.equal(controlled.respiratory.tidalVolumeMl, 480, 'Mandatory VT unaffected by relaxant')
nearly(controlled.respiratory.spontaneousRespiratoryRate, 1.2, 'Independent spontaneous rate')
const psv = patient()
psv.respiratory.ventilatorMode = 'PSV'
const supported = applySharedEdumonActionPhysiology(psv, inhibited)
nearly(supported.respiratory.tidalVolumeMl, 125, 'PSV tidal breathing depends on block')
const fullBlock = applySharedEdumonActionPhysiology(mandatory, fixed({ 'neuromuscular.block': 1 }))
assert.equal(fullBlock.respiratory.spontaneousRespiratoryRate, 0)
assert.equal(fullBlock.respiratory.respiratoryRate, 14)
assert.equal(fullBlock.respiratory.tidalVolumeMl, 480)

const stimulus = fixed({
  'stimulus.sympathetic': 1, 'anaesthesia.nociceptiveResponse': 0.55,
  'anaesthesia.hypnoticEffect': 0.65,
})
const sympatheticScale = saturatingSympatheticResponse(0.55 * 0.35)
const aroused = applySharedEdumonActionPhysiology(baseline, stimulus)
nearly(aroused.heartRate, 78 + 25 * sympatheticScale, 'v1 sympathetic HR')
nearly(aroused.systolicPressure, 122 + 30 * sympatheticScale, 'v1 sympathetic SBP')

const bounded = applySharedEdumonBounds({
  ...patient(), heartRate: 270, systolicPressure: 5, diastolicPressure: 250,
  respiratory: { ...DEFAULT_RESPIRATORY_STATE,
    tidalVolumeMl: 1200, deadSpaceMl: 1500, expiratoryResistanceCmH2OLs: 600 },
})
assert.equal(bounded.heartRate, 240)
assert.equal(bounded.diastolicPressure, 200)
assert.equal(bounded.systolicPressure, 201)
assert.equal(bounded.respiratory.tidalVolumeMl, 1000)
assert.equal(bounded.respiratory.deadSpaceMl, 1000)
assert.equal(bounded.respiratory.expiratoryResistanceCmH2OLs, 200)

// The v2 projection now *must* agree with shared v1 physiology, including
// its numeric action resolver and bounded values at each simulated time.
const evaluator = createAnaesthV2PilotEvaluator()
let state = { patient: patient(),
  actionRuntime: { simulationTime: 0, activeEffects: [], activeToggleActions: [] } }
state = evaluator(state, { actionId: 'propofol' },
  { actorRole: 'candidate', mode: 'simulation', commandId: 'dose-1' })
state = evaluator(state, { actionId: 'relaxant' },
  { actorRole: 'candidate', mode: 'simulation', commandId: 'dose-2' })
for (const time of [0, 10, 25, 60, 120, 300, 1800]) {
  const at = { ...state, actionRuntime: { ...state.actionRuntime, simulationTime: time } }
  const resolve = (target, base) => resolveV2ActionNumber(at.actionRuntime, target, base)
  const expected = applySharedEdumonActionPhysiology(at.patient, resolve)
  const actual = projectAnaesthV2Monitor(at)
  for (const key of ['heartRate', 'systolicPressure', 'diastolicPressure']) {
    nearly(actual[key], expected[key], `v2 parity ${key} at t=${time}`)
  }
  for (const key of ['respiratoryRate', 'spontaneousRespiratoryRate', 'tidalVolumeMl']) {
    nearly(actual.respiratory[key], expected.respiratory[key], `v2 parity ${key} at t=${time}`)
  }
  assert.equal(actual.anaestheticPhysiology.depthOfAnaesthesia,
    sharedAnaestheticDepth(at.patient, resolve), 'v2 effective depth parity')
  assert.equal(at.patient.heartRate, 78, 'v2 must not change canonical baseline')
}

// Explicitly test v1-compatible partial strength semantics for constraints.
const constraintRuntime = { simulationTime: 5, activeToggleActions: [], activeEffects: [
  { instanceId: 'a', actionId: 'constraint', mode: 'momentary', intensity: 1,
    startedAtSimulationTime: 0, effect: {
      target: 'haemodynamics.heartRate', operation: 'constraint', constraint: 'minimum',
      value: 90, onsetSeconds: 10, durationSeconds: 10, recoverySeconds: 10,
    } },
] }
nearly(resolveV2ActionNumber(constraintRuntime, 'haemodynamics.heartRate', 60), 75,
  'v1-compatible interpolated minimum constraint')
assert.equal(getAnaesthV2PilotDefinitions().find(d => d.id === 'relaxant').effects[0].onsetSeconds, 120)
console.log('Shared EDUMON v1/v2 physiology parity, respiratory modes and bounds regression passed')
