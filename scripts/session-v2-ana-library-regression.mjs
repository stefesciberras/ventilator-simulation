import assert from 'node:assert/strict'
import { getAnaesthV2PilotDefinitions } from '../src/session-v2/adapters/anaesthPilot.mjs'
import { validateAnaesthV2Library, validatePinnedAnaesthV2Library,
  loadAnaesthV2Library, legacyAnaesthV2Library, anaesthV2EvaluatorFromLibrary,
  publicAnaesthV2Library } from '../src/session-v2/adapters/anaesthLibrary.mjs'
import { createAnaesthSessionAdapter } from '../src/session-v2/adapters/anaesth.mjs'
import { SessionEngineV2 } from '../src/session-v2/engine.mjs'

const sample = getAnaesthV2PilotDefinitions()
const copy = structuredClone(sample)
copy[0].effects[0].value = 0.45
const mockFetch = async (url, options) => {
  assert.equal(new URL(url).pathname, '/rest/v1/edusim_action_definitions')
  assert.equal(options.headers.apikey, 'a'.repeat(32))
  return { ok: true, json: async () => copy }
}
const env = { SESSION_V2_ACTIONS_SUPABASE_URL: 'https://example.supabase.co',
  SESSION_V2_ACTIONS_SUPABASE_KEY: 'a'.repeat(32) }
const pinned = await loadAnaesthV2Library(env, mockFetch)
assert.equal(pinned.source, 'supabase')
assert.equal(pinned.definitions[0].effects[0].value, 0.45)
copy[0].effects[0].value = 100
assert.equal(pinned.definitions[0].effects[0].value, 0.45, 'catalogue must be defensive')
assert.deepEqual(validatePinnedAnaesthV2Library(pinned), pinned)
assert.deepEqual(publicAnaesthV2Library(pinned).actions.map(x => x.id),
  ['propofol', 'fentanyl', 'relaxant'])
assert.equal(publicAnaesthV2Library(pinned).actions[0].effects, undefined,
  'do not export raw effects as UI metadata')
assert.equal((await loadAnaesthV2Library({})).source, 'pilot-fallback-v1')
assert.equal(legacyAnaesthV2Library().source, 'legacy-pilot-v1')
await assert.rejects(loadAnaesthV2Library({ SESSION_V2_ACTIONS_SUPABASE_URL: env.SESSION_V2_ACTIONS_SUPABASE_URL }),
  /action-library-config-invalid/)
await assert.rejects(loadAnaesthV2Library(env, async () => { throw Error('offline') }), /offline/)
await assert.rejects(loadAnaesthV2Library(env, async () => ({ ok: false })), /action-library-fetch-failed/)
const bad = getAnaesthV2PilotDefinitions()
bad[0].effects[0].target = 'some.undefined.path'
assert.throws(() => validateAnaesthV2Library(bad), /invalid-action-effect/)
const duplicate = getAnaesthV2PilotDefinitions()
duplicate.push(duplicate[0])
assert.throws(() => validateAnaesthV2Library(duplicate), /invalid-action-definition/)
const adapter = createAnaesthSessionAdapter({
  initialPatient: { heartRate: 78, systolicPressure: 122, diastolicPressure: 68,
    spo2: 98, peripheralPerfusion: 1 },
  applyAction: anaesthV2EvaluatorFromLibrary(pinned),
})
const engine = new SessionEngineV2({
  sessionId: 'pinned-catalogue', mode: 'simulation', instructorId: 'instructor', adapter,
})
engine.join({ participantId: 'candidate', role: 'candidate' })
engine.start('instructor')
const submit = (id, actionId) => engine.submit({
  id, type: 'action.invoke', payload: { actionId }, runtimeId: 'main',
  epoch: engine.snapshot.session.epoch, participantId: 'candidate',
})
assert.equal(submit('first', 'propofol').accepted, true)
assert.equal(engine.snapshot.runtimes[0].state.actionRuntime.activeEffects[0].effect.value, 0.45)
assert.equal(submit('first', 'propofol').accepted, true)
assert.equal(engine.snapshot.runtimes[0].state.actionRuntime.activeEffects.length, 3)
const checkpoint = engine.exportCheckpoint()
const reloaded = SessionEngineV2.fromCheckpoint({ checkpoint,
  adapter: createAnaesthSessionAdapter({
    initialPatient: { heartRate: 78, systolicPressure: 122, diastolicPressure: 68,
      spo2: 98, peripheralPerfusion: 1 },
    applyAction: anaesthV2EvaluatorFromLibrary(pinned),
  }),
})
assert.equal(reloaded.snapshot.runtimes[0].state.actionRuntime.activeEffects[0].effect.value, 0.45)
assert.equal(reloaded.snapshot.runtimes[0].state.actionRuntime.activeEffects.length, 3)
console.log('Session v2 pinned Anaesth ActionDefinition library validation / recovery passed')
