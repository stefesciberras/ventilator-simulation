import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createNodeFileAuthorityStore } from '../server/session-v2-file-authority-store.mjs'
import { createSessionV2AuthorityHost } from '../src/session-v2/authorityHost.mjs'
import { SessionEngineV2 } from '../src/session-v2/engine.mjs'
import { createAnaesthSessionAdapter } from '../src/session-v2/adapters/anaesth.mjs'
import { createAnaesthDeclarativeActionEvaluator } from '../src/session-v2/adapters/actionEffects.mjs'

const directory = await mkdtemp(join(tmpdir(), 'loppjusim-v2-'))
const filePath = join(directory, 'authority.json')
let nowMs = 100000
const auth = async value => value === 'teacher' ? { participantId: 'i', role: 'instructor' }
  : value === 'candidate' ? { participantId: 'c', role: 'candidate' } : null
const adapter = createAnaesthSessionAdapter({
  initialPatient: { heartRate: 78, rhythm: 'sinus', systolicPressure: 125,
    diastolicPressure: 70, spo2: 98, peripheralPerfusion: 1,
    anaestheticGases: { fiSevoPercent: 0 } },
  applyAction: createAnaesthDeclarativeActionEvaluator({ getDefinition: id => id === 'propofol'
    ? { id, kind: 'drug', name: 'Propofol', setting: 'ana', candidate_access: 'allowed',
      short_press_action: 'momentary', effects: [{
        id: 'hypnosis', target: 'anaesthesia.hypnoticEffect', operation: 'target',
        value: 0.8, onsetSeconds: 4, durationSeconds: 30, recoverySeconds: 90,
      }] }
    : null }),
})
const hostFor = store => createSessionV2AuthorityHost({
  store, adapter, authenticate: auth, now: () => nowMs, leaseDurationMs: 2000,
})
const command = (id, type, payload, epoch) => ({
  id, type, payload, epoch, runtimeId: 'main',
})
try {
  const firstStore = createNodeFileAuthorityStore({ filePath })
  const engine = new SessionEngineV2({ sessionId: 'restart-demo', mode: 'simulation', instructorId: 'i', adapter })
  engine.join({ participantId: 'c', role: 'candidate' })
  engine.start('i')
  const first = hostFor(firstStore)
  await first.create({ initialEngine: engine, credentials: 'teacher' })
  assert.equal((await first.submit({ credentials: 'candidate',
    command: command('fi', 'anaesth.gas.set', { fiSevoPercent: 2.3 }, 1) })).accepted, true)
  assert.equal((await first.submit({ credentials: 'candidate',
    command: command('drug', 'action.invoke', { actionId: 'propofol' }, 1) })).accepted, true)
  const before = await firstStore.load('restart-demo')
  assert.equal(before.snapshot.runtimes[0].state.actionRuntime.activeEffects.length, 1)
  // Reconstruct the entire storage object (simulates Node process restart).
  const secondStore = createNodeFileAuthorityStore({ filePath })
  const second = hostFor(secondStore)
  await assert.rejects(second.takeover({ sessionId: 'restart-demo', credentials: 'teacher' }), /authority-lease-held/)
  nowMs += 2100
  const recovered = await second.takeover({ sessionId: 'restart-demo', credentials: 'teacher' })
  assert.equal(recovered.session.epoch, 3)
  assert.equal(recovered.runtimes[0].state.patient.anaestheticGases.fiSevoPercent, 2.3)
  assert.equal(recovered.runtimes[0].state.actionRuntime.activeEffects.length, 1)
  await second.reconnect({ credentials: 'candidate' })
  const repeat = await second.submit({ credentials: 'candidate',
    command: command('drug', 'action.invoke', { actionId: 'propofol' }, 3) })
  assert.equal(repeat.accepted, true)
  assert.equal(second.snapshot.runtimes[0].state.actionRuntime.activeEffects.length, 1)
  await assert.rejects(first.submit({ credentials: 'candidate',
    command: command('late', 'action.invoke', { actionId: 'propofol' }, 1) }), /authority-lease-lost/)
  const thirdStore = createNodeFileAuthorityStore({ filePath })
  assert.equal((await thirdStore.load('restart-demo')).snapshot.runtimes[0].state.actionRuntime.activeEffects.length, 1)
  console.log('Session v2 durable file-backed restart / lease / drug dedup regression passed')
} finally {
  await rm(directory, { recursive: true, force: true })
}
