import assert from 'node:assert/strict'
import { SessionV2Room } from '../worker/sessionV2Room.mjs'

// P0.4: real Durable Object room checkpoint / restart contract.
// Simulated wall-clock downtime must not advance the authoritative simulation.
const previousPair = globalThis.WebSocketPair
const previousResponse = globalThis.Response
const ledger = new Map()
let scheduledAlarm = null

class MockSocket {
  constructor() { this.messages = []; this.listeners = new Map() }
  accept() {}
  addEventListener(name, callback) { this.listeners.set(name, callback) }
  send(payload) { this.peer.messages.push(JSON.parse(payload)) }
  emit(payload) { this.peer.listeners.get('message')?.({ data: JSON.stringify(payload) }) }
  close() { this.listeners.get('close')?.({}) }
}
globalThis.WebSocketPair = class {
  constructor() {
    const a = new MockSocket(), b = new MockSocket()
    a.peer = b; b.peer = a
    return { 0: a, 1: b }
  }
}
globalThis.Response = class {
  constructor(body, init) {
    this.body = body; this.status = init.status
    this.webSocket = init.webSocket
    this.headers = new Headers(init.headers ?? {})
  }
}
const storageState = () => ({
  storage: {
    async get(key) { return structuredClone(ledger.get(key)) },
    async put(key, value) {
      if (value === undefined && typeof key === 'object') {
        for (const [k, v] of Object.entries(key)) ledger.set(k, structuredClone(v))
      } else ledger.set(key, structuredClone(value))
    },
    async setAlarm(at) { scheduledAlarm = at },
    async deleteAlarm() { scheduledAlarm = null },
  },
  blockConcurrencyWhile: fn => fn(),
})
const connect = async (room, role) => {
  const response = await room.fetch({ headers: new Headers({
    Upgrade: 'websocket', 'x-v2-session-id': 'recovery-p04',
    'x-v2-verified-role': role, 'x-v2-selected-protocol': 'loppjusim-v2',
  }) })
  assert.equal(response.status, 101)
  return response.webSocket
}
const flush = async () => {
  for (let i = 0; i < 8; i++) await new Promise(resolve => setTimeout(resolve, 0))
}
const send = async (socket, id, epoch, type, payload = {}) => {
  socket.emit({ protocol: 2, type: 'command', requestId: id,
    command: { id, epoch, runtimeId: 'main', type, payload } })
  await flush()
  const result = socket.messages.find(m => m.requestId === id && m.type === 'receipt')
  assert.ok(result, 'Missing receipt for ' + id)
  return result.receipt
}
const clock = async (socket, id, running, speed = 1) => {
  socket.emit({ protocol: 2, type: 'clock.control', requestId: id, running, speed })
  await flush()
  assert.equal(socket.messages.find(m => m.requestId === id)?.accepted, true)
}
const checkpoint = () => ledger.get('checkpoint')
const runtime = () => checkpoint().snapshot.runtimes[0].state
const lowHr = () => runtime().alarmRuntime.evaluations.find(e => e.key === 'heartRateLow')

try {
  const first = new SessionV2Room(storageState(), {})
  const instructor = await connect(first, 'instructor')
  const candidate = await connect(first, 'candidate')
  const firstEpoch = instructor.messages[0].snapshot.session.epoch
  assert.equal((await send(instructor, 'transition', firstEpoch, 'patient.parameter.set',
    { path: 'heartRate', value: 40, transitionSeconds: 10 })).accepted, true)
  assert.equal((await send(candidate, 'propofol', firstEpoch, 'action.invoke',
    { actionId: 'propofol' })).accepted, true)
  assert.ok(runtime().actionRuntime.activeEffects.length > 0, 'Propofol adds its declarative effect set')
  await clock(instructor, 'start', true)
  for (let t = 0; t < 8; t++) await first.alarm()
  assert.equal(checkpoint().snapshot.session.clockMs, 8000)
  assert.ok(runtime().monitorRuntime.modelledHeartRate < 50)
  assert.equal(lowHr().active, true)
  const hrAtInterrupt = runtime().monitorRuntime.modelledHeartRate
  assert.equal((await send(instructor, 'silence', firstEpoch, 'alarm.silence.set',
    { durationSeconds: 60 })).accepted, true)
  const silenceUntil = runtime().alarmRuntime.silencedUntilSimulationTime
  const simTime = runtime().actionRuntime.simulationTime
  const effectsBefore = structuredClone(runtime().actionRuntime.activeEffects)
  assert.equal(silenceUntil - simTime, 60)
  assert.equal(runtime().alarmRuntime.silenced, true)
  assert.equal(ledger.get('clockControl').running, true)

  // Reconstruct the DO as if it were evicted: authoritative time is frozen,
  // alarm/transition/drug state must be read directly from the checkpoint.
  const recovered = new SessionV2Room(storageState(), {})
  await recovered.loaded
  assert.equal(ledger.get('clockControl').running, false)
  await recovered.alarm() // a stale Cloudflare scheduled wakeup is harmless
  assert.equal(checkpoint().snapshot.session.clockMs, 8000)
  const reconnectCandidate = await connect(recovered, 'candidate')
  const candidateWelcome = reconnectCandidate.messages[0]
  assert.equal(candidateWelcome.snapshot.session.status, 'recovering')
  assert.equal(candidateWelcome.clock.running, false)
  assert.equal(candidateWelcome.snapshot.runtimes[0].state.monitorRuntime.modelledHeartRate, hrAtInterrupt)
  assert.equal(candidateWelcome.snapshot.runtimes[0].state.alarmRuntime.silencedUntilSimulationTime, silenceUntil)
  assert.equal((await send(reconnectCandidate, 'before-instructor', candidateWelcome.snapshot.session.epoch,
    'action.invoke', { actionId: 'propofol' })).accepted, false,
    'Candidate cannot mutate a recovering session')

  const reconnectInstructor = await connect(recovered, 'instructor')
  const instructorWelcome = reconnectInstructor.messages[0]
  const epoch = instructorWelcome.snapshot.session.epoch
  assert.equal(epoch, firstEpoch + 2)
  assert.equal(instructorWelcome.snapshot.session.status, 'active')
  assert.equal(instructorWelcome.snapshot.session.clockMs, 8000)
  assert.equal(instructorWelcome.snapshot.runtimes[0].state.monitorRuntime.modelledHeartRate, hrAtInterrupt)
  assert.deepEqual(runtime().actionRuntime.activeEffects, effectsBefore)
  assert.equal(lowHr().active, true)
  assert.equal(runtime().alarmRuntime.silenced, true)
  assert.equal(runtime().alarmRuntime.silencedUntilSimulationTime, silenceUntil)

  // Replaying an already acknowledged action after epoch fencing must not
  // administer a duplicate effect.
  const replay = await send(reconnectCandidate, 'propofol', epoch,
    'action.invoke', { actionId: 'propofol' })
  assert.equal(replay.accepted, true)
  assert.deepEqual(runtime().actionRuntime.activeEffects, effectsBefore, 'Retry must not duplicate any propofol effects')

  await recovered.alarm()
  assert.equal(checkpoint().snapshot.session.clockMs, 8000, 'Recovery stays paused')
  await clock(reconnectInstructor, 'resume', true)
  for (let t = 0; t < 2; t++) await recovered.alarm()
  assert.equal(checkpoint().snapshot.session.clockMs, 10000)
  assert.equal(runtime().monitorRuntime.modelledHeartRate, 40)
  assert.equal(runtime().monitorRuntime.heartRateTransition, null)
  assert.equal(lowHr().active, true)
  assert.equal(runtime().alarmRuntime.silencedUntilSimulationTime, silenceUntil)
  assert.equal(runtime().alarmRuntime.silenced, true)
  assert.equal(runtime().actionRuntime.simulationTime, 10)
  assert.equal(reconnectCandidate.messages.at(-1).snapshot.session.revision,
    reconnectInstructor.messages.at(-1).snapshot.session.revision)
  assert.equal(reconnectCandidate.messages.at(-1).snapshot.runtimes[0].state.monitorProjection.heartRate, 40)
  console.log('P0.4 Durable Object HR transition / alarm / silence / drug / two-client recovery passed')
} finally {
  globalThis.WebSocketPair = previousPair
  globalThis.Response = previousResponse
}
