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
  emit(type, data) { this.listeners.get(type)?.({ data }) }
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
  constructor(body, init) { this.body = body; this.status = init.status; this.webSocket = init.webSocket }
}
const state = () => ({
  storage: {
    async get(key) { return structuredClone(persistent.get(key)) },
    async put(key, value) { persistent.set(key, structuredClone(value)) },
  },
  blockConcurrencyWhile: fn => fn(),
})
const request = role => ({ headers: new Headers({ Upgrade: 'websocket',
  'x-v2-session-id': 'cloud-regression', 'x-v2-verified-role': role }) })
const flush = async () => {
  for (let i = 0; i < 12; i++) await new Promise(resolve => setTimeout(resolve, 0))
}
const command = (client, requestId, id, epoch, type, payload = {}) => client.emit('message',
  JSON.stringify({ protocol: 2, type: 'command', requestId,
    command: { id, runtimeId: 'main', epoch, type, payload, participantId: 'instructor' } }))
try {
  const room = new SessionV2Room(state(), {})
  assert.equal((await room.fetch(request('candidate'))).status, 409, 'candidate cannot create a room')
  const instructor = (await room.fetch(request('instructor'))).webSocket
  const candidate = (await room.fetch(request('candidate'))).webSocket
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
  const revision = persistent.get('checkpoint').snapshot.session.revision
  command(candidate, 'duplicate', 'sevo', epoch, 'anaesth.gas.set', { fiSevoPercent: 2.4 })
  await flush()
  assert.equal(candidate.messages.find(p => p.requestId === 'duplicate').receipt.accepted, true)
  assert.equal(persistent.get('checkpoint').snapshot.session.revision, revision)
  // Simulate Durable Object eviction/reconstruction: new instance sees
  // persisted checkpoint, fences old epoch on authenticated instructor join.
  const revived = new SessionV2Room(state(), {})
  const instructor2 = (await revived.fetch(request('instructor'))).webSocket
  const candidate2 = (await revived.fetch(request('candidate'))).webSocket
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
  console.log('Cloudflare Durable Object v2 WebSocket / persistence regression passed')
} finally {
  globalThis.WebSocketPair = oldPair
  globalThis.Response = oldResponse
}
