import assert from 'node:assert/strict'
import { SessionV2Room } from '../worker/sessionV2Room.mjs'

// Simulate Cloudflare's WebSocketPair and Durable Object storage in Node.
// These tests exercise the actual room protocol and checkpoint recovery,
// separate from the general build/type checks.
const oldPair = globalThis.WebSocketPair
const oldResponse = globalThis.Response
const persistent = new Map()
class MockSocket {
  constructor() { this.listeners = new Map(); this.messages = [] }
  accept() {}
  addEventListener(type, fn) { this.listeners.set(type, fn) }
  send(data) {
    this.peer.messages.push(JSON.parse(data))
  }
  close() { this.listeners.get('close')?.({}) }
  emit(type, data) { this.peer.listeners.get(type)?.({ data }) }
}
globalThis.WebSocketPair = class {
  constructor() {
    const a = new MockSocket(), b = new MockSocket()
    a.peer = b
    b.peer = a
    return { 0: a, 1: b }
  }
}
globalThis.Response = class {
  constructor(body, init) { this.body = body; this.status = init.status; this.webSocket = init.webSocket; this.headers = new Headers(init.headers ?? {}) }
}
const state = (ledger = persistent) => ({
  storage: {
    async get(key) { return structuredClone(ledger.get(key)) },
    async put(key, value) {
      if (value === undefined && typeof key === 'object') {
        for (const [entryKey, entryValue] of Object.entries(key)) ledger.set(entryKey, structuredClone(entryValue))
      } else ledger.set(key, structuredClone(value))
    },
  },
  blockConcurrencyWhile: fn => fn(),
})
const request = (role, sessionId = 'cloud-regression') => ({ headers: new Headers({ Upgrade: 'websocket',
  'x-v2-session-id': sessionId, 'x-v2-verified-role': role,
  'x-v2-selected-protocol': 'loppjusim-v2' }) })
const flush = async () => {
  for (let i = 0; i < 12; i++) await new Promise(resolve => setTimeout(resolve, 0))
}
const command = (client, requestId, id, epoch, type, payload = {}) => client.emit('message',
  JSON.stringify({ protocol: 2, type: 'command', requestId,
    command: { id, runtimeId: 'main', epoch, type, payload, participantId: 'instructor' } }))
try {
  const room = new SessionV2Room(state(), {})
  assert.equal((await room.fetch(request('candidate'))).status, 409, 'candidate cannot create a room')
  const instructorUpgrade = await room.fetch(request('instructor'))
  assert.equal(instructorUpgrade.status, 101)
  assert.equal(instructorUpgrade.headers.get('Sec-WebSocket-Protocol'), 'loppjusim-v2',
    'the 101 response must negotiate an offered browser subprotocol')
  const instructor = instructorUpgrade.webSocket
  const candidateUpgrade = await room.fetch(request('candidate'))
  assert.equal(candidateUpgrade.headers.get('Sec-WebSocket-Protocol'), 'loppjusim-v2')
  const candidate = candidateUpgrade.webSocket
  assert.equal(instructor.messages[0].type, 'welcome')
  assert.equal(candidate.messages[0].snapshot.session.mode, 'simulation')
  let epoch = instructor.messages[0].snapshot.session.epoch
  command(candidate, 'unauthorized', 'unauthorized', epoch,
    'patient.parameter.set', { path: 'heartRate', value: 170 })
  await flush()
  assert.equal(candidate.messages.find(p => p.requestId === 'unauthorized').receipt.accepted, false)
  command(instructor, 'hr', 'hr', epoch,
    'patient.parameter.set', { path: 'heartRate', value: 96 })
  await flush()
  assert.equal(instructor.messages.find(p => p.requestId === 'hr').receipt.accepted, true)
  assert.equal(candidate.messages.at(-1).snapshot.runtimes[0].state.patient.heartRate, 96)
  command(candidate, 'sevo', 'sevo', epoch, 'anaesth.gas.set', { fiSevoPercent: 2.4 })
  await flush()
  assert.equal(instructor.messages.at(-1).snapshot.runtimes[0].state.patient.anaestheticGases.fiSevoPercent, 2.4)
  assert.equal(instructor.messages[0].actionLibrary.source, 'pilot-fallback-v1')
  const revision = persistent.get('checkpoint').snapshot.session.revision
  command(candidate, 'duplicate', 'sevo', epoch, 'anaesth.gas.set', { fiSevoPercent: 2.4 })
  await flush()
  assert.equal(candidate.messages.find(p => p.requestId === 'duplicate').receipt.accepted, true)
  assert.equal(persistent.get('checkpoint').snapshot.session.revision, revision)
  // Simulate Durable Object eviction/reconstruction: new instance sees
  // persisted checkpoint, fences old epoch on authenticated instructor join.
  assert.equal(persistent.get('actionLibrary').source, 'pilot-fallback-v1')
  const revived = new SessionV2Room(state(), {})
  const instructor2 = (await revived.fetch(request('instructor'))).webSocket
  const candidate2 = (await revived.fetch(request('candidate'))).webSocket
  assert.deepEqual(instructor2.messages[0].actionLibrary, instructor.messages[0].actionLibrary)
  epoch = instructor2.messages[0].snapshot.session.epoch
  assert.equal(epoch, 3)
  assert.equal(instructor2.messages[0].snapshot.runtimes[0].state.patient.heartRate, 96)
  assert.equal(candidate2.messages[0].snapshot.runtimes[0].state.patient.anaestheticGases.fiSevoPercent, 2.4)
  command(candidate2, 'stale', 'new-id', 1, 'anaesth.gas.set', { fiSevoPercent: 3 })
  await flush()
  assert.equal(candidate2.messages.find(p => p.requestId === 'stale').receipt.reason, 'stale-epoch')
  command(candidate2, 'post-recovery', 'after', epoch, 'anaesth.gas.set', { fiSevoPercent: 3 })
  await flush()
  assert.equal(candidate2.messages.find(p => p.requestId === 'post-recovery').receipt.accepted, true)
  assert.equal(persistent.get('checkpoint').snapshot.runtimes[0].state.patient.anaestheticGases.fiSevoPercent, 3)
  // Instructor-only reset must clear drugs, restore baseline, rewind the
  // authoritative clock and publish the exact same revision to both peers.
  command(candidate2, 'reset-denied', 'reset-denied', epoch, 'reset')
  await flush()
  assert.equal(candidate2.messages.find(p => p.requestId === 'reset-denied').receipt.reason, 'forbidden')
  command(candidate2, 'pre-reset-drug', 'pre-reset-drug', epoch, 'action.invoke', { actionId: 'propofol' })
  await flush()
  assert.equal(persistent.get('checkpoint').snapshot.runtimes[0].state.actionRuntime.activeEffects.length, 3)
  command(instructor2, 'tick-1', 'tick-1', epoch, 'tick', { deltaMs: 1000 })
  await flush()
  assert.equal(persistent.get('checkpoint').snapshot.session.clockMs, 1000)
  command(instructor2, 'reset-1', 'reset-1', epoch, 'reset')
  await flush()
  assert.equal(instructor2.messages.find(p => p.requestId === 'reset-1').receipt.accepted, true)
  const cleared = persistent.get('checkpoint').snapshot
  assert.equal(cleared.session.clockMs, 0)
  assert.equal(cleared.runtimes[0].state.actionRuntime.simulationTime, 0)
  assert.deepEqual(cleared.runtimes[0].state.actionRuntime.activeEffects, [])
  assert.deepEqual(cleared.runtimes[0].state.actionRuntime.activeToggleActions, [])
  assert.equal(cleared.runtimes[0].state.patient.heartRate, 78)
  assert.equal(cleared.runtimes[0].state.patient.anaestheticGases.fiSevoPercent, 0)
  assert.equal(instructor2.messages.at(-1).snapshot.session.revision, candidate2.messages.at(-1).snapshot.session.revision)
  assert.equal(candidate2.messages.at(-1).snapshot.runtimes[0].state.patient.heartRate, 78)
  assert.equal(persistent.get('actionLibrary').source, 'pilot-fallback-v1',
    'Reset preserves the original pinned action library')
  const recoveredAfterReset = new SessionV2Room(state(), {})
  const resetWelcome = (await recoveredAfterReset.fetch(request('instructor'))).webSocket.messages[0]
  assert.equal(resetWelcome.snapshot.session.clockMs, 0)
  assert.equal(resetWelcome.snapshot.runtimes[0].state.actionRuntime.activeEffects.length, 0)
  // A brand-new session ID is routed to a different Durable Object instance,
  // with a new immutable catalogue and clean patient. It never mutates the
  // existing saved session or implicitly moves connected candidate browsers.
  const newLedger = new Map()
  const newRoom = new SessionV2Room(state(newLedger), {})
  const fresh = (await newRoom.fetch(request('instructor', 'ana-fresh-new'))).webSocket.messages[0]
  assert.equal(fresh.snapshot.session.id, 'ana-fresh-new')
  assert.equal(fresh.snapshot.session.clockMs, 0)
  assert.equal(fresh.snapshot.runtimes[0].state.patient.heartRate, 78)
  assert.equal(fresh.snapshot.runtimes[0].state.actionRuntime.activeEffects.length, 0)
  assert.equal(fresh.role, 'instructor')
  assert.equal(newLedger.get('actionLibrary').source, 'pilot-fallback-v1')
  assert.equal(persistent.get('checkpoint').snapshot.session.id, 'cloud-regression')
  console.log('Cloudflare Durable Object v2 reset / fresh room / persistence regression passed')
} finally {
  globalThis.WebSocketPair = oldPair
  globalThis.Response = oldResponse
}
