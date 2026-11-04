import assert from 'node:assert/strict'
import { SessionV2Room } from '../worker/sessionV2Room.mjs'

// Durable Object clock integration: deterministic alarms, two socket clients,
// role checks, persistence, recovery and fail-safe pause after reconstruction.
const originalPair = globalThis.WebSocketPair
const originalResponse = globalThis.Response
const storage = new Map()
let scheduledAlarm = null
class Socket {
  constructor() { this.listeners = new Map(); this.messages = [] }
  accept() {}
  addEventListener(event, handler) { this.listeners.set(event, handler) }
  send(raw) { this.peer.messages.push(JSON.parse(raw)) }
  close() { this.listeners.get('close')?.({}) }
  emit(raw) { this.peer.listeners.get('message')?.({ data: JSON.stringify(raw) }) }
}
globalThis.WebSocketPair = class {
  constructor() {
    const a = new Socket(), b = new Socket()
    a.peer = b; b.peer = a
    return { 0: a, 1: b }
  }
}
globalThis.Response = class {
  constructor(body, init) {
    this.body = body
    this.status = init.status
    this.webSocket = init.webSocket
    this.headers = new Headers(init.headers ?? {})
  }
}
const state = () => ({
  storage: {
    async get(key) { return structuredClone(storage.get(key)) },
    async put(key, value) {
      if (value === undefined && typeof key === 'object') {
        for (const [k,v] of Object.entries(key)) storage.set(k, structuredClone(v))
      } else storage.set(key, structuredClone(value))
    },
    async setAlarm(at) { scheduledAlarm = at },
    async deleteAlarm() { scheduledAlarm = null },
  },
  blockConcurrencyWhile: callback => callback(),
})
const connect = (room, role) => room.fetch({ headers: new Headers({
  Upgrade: 'websocket', 'x-v2-verified-role': role, 'x-v2-session-id': 'clock-test',
  'x-v2-selected-protocol': 'loppjusim-v2',
}) })
const flush = async () => {
  for (let i = 0; i < 8; i++) await new Promise(resolve => setTimeout(resolve, 0))
}
const control = (socket, id, running, speed) =>
  socket.emit({ protocol: 2, type: 'clock.control', requestId: id, running, speed })
const command = (socket, id, epoch, type, payload = {}) =>
  socket.emit({ protocol: 2, type: 'command', requestId: id,
    command: { id, epoch, runtimeId: 'main', type, payload } })
try {
  const room = new SessionV2Room(state(), {})
  const instructor = (await connect(room, 'instructor')).webSocket
  const candidate = (await connect(room, 'candidate')).webSocket
  assert.equal(instructor.messages[0].clock.running, false, 'Safe default is paused')
  const epoch = instructor.messages[0].snapshot.session.epoch
  control(candidate, 'candidate-attempt', true, 4)
  await flush()
  assert.equal(candidate.messages.find(x=>x.requestId==='candidate-attempt').reason, 'forbidden-clock-control')
  assert.equal(scheduledAlarm, null)

  command(candidate, 'relaxant', epoch, 'action.invoke', { actionId: 'relaxant' })
  await flush()
  assert.equal(storage.get('checkpoint').snapshot.runtimes[0].state.actionRuntime.activeEffects.length, 1)
  control(instructor, 'start', true, 2)
  await flush()
  assert.equal(instructor.messages.find(x=>x.requestId==='start').accepted, true)
  assert.equal(instructor.messages.at(-1).clock.speed, 2)
  assert.ok(scheduledAlarm > 0)
  command(instructor, 'manual-denied', epoch, 'tick', { deltaMs: 1000 })
  await flush()
  assert.equal(instructor.messages.find(x=>x.requestId==='manual-denied').reason, 'clock-already-running')

  await room.alarm()
  assert.equal(storage.get('checkpoint').snapshot.session.clockMs, 2000)
  assert.equal(storage.get('checkpoint').snapshot.runtimes[0].state.actionRuntime.simulationTime, 2)
  assert.equal(candidate.messages.at(-1).snapshot.session.clockMs, 2000)
  assert.equal(candidate.messages.at(-1).snapshot.runtimes[0].state.effectIndicators.neuromuscularBlockPercent, 2)

  control(instructor, 'half-speed', true, 0.5)
  await flush()
  await room.alarm()
  assert.equal(storage.get('checkpoint').snapshot.session.clockMs, 2500)

  control(instructor, 'pause', false, 0.5)
  await flush()
  assert.equal(scheduledAlarm, null)
  await room.alarm()
  assert.equal(storage.get('checkpoint').snapshot.session.clockMs, 2500,
    'Stopped clock must never progress, even if an old alarm fires')
  assert.equal(storage.get('clockControl').running, false)

  control(instructor, 'restart', true, 4)
  await flush()
  await room.alarm()
  assert.equal(storage.get('checkpoint').snapshot.session.clockMs, 6500)
  // Reset is atomic with pausing the clock; late alarms cannot bring drugs back.
  command(instructor, 'reset', epoch, 'reset')
  await flush()
  assert.equal(storage.get('checkpoint').snapshot.session.clockMs, 0)
  assert.equal(storage.get('checkpoint').snapshot.runtimes[0].state.actionRuntime.activeEffects.length, 0)
  assert.equal(storage.get('clockControl').running, false)
  assert.equal(scheduledAlarm, null)

  control(instructor, 'before-restart', true, 1)
  await flush()
  assert.equal(storage.get('clockControl').running, true)
  const recoveredRoom = new SessionV2Room(state(), {})
  const instructorRecovered = (await connect(recoveredRoom, 'instructor')).webSocket
  assert.equal(instructorRecovered.messages[0].clock.running, false,
    'Reconstruction must fail safe paused until instructor resumes')
  assert.equal(storage.get('clockControl').running, false)
  await recoveredRoom.alarm()
  assert.equal(storage.get('checkpoint').snapshot.session.clockMs, 0)
  assert.equal(instructorRecovered.messages[0].snapshot.session.epoch, 3)
  control(instructorRecovered, 'resume-after-recovery', true, 1)
  await flush()
  await recoveredRoom.alarm()
  assert.equal(storage.get('checkpoint').snapshot.session.clockMs, 1000)
  const candidateRecovered = (await connect(recoveredRoom, 'candidate')).webSocket
  assert.equal(candidateRecovered.messages[0].snapshot.session.clockMs, 1000)
  assert.equal(candidateRecovered.messages[0].clock.running, true)
  console.log('Session v2 Cloudflare authoritative clock, speed, pause/reset/recovery regression passed')
} finally {
  globalThis.WebSocketPair = originalPair
  globalThis.Response = originalResponse
}
