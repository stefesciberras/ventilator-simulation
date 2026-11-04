import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { WebSocket, WebSocketServer } from 'ws'
import { SessionEngineV2 } from '../src/session-v2/engine.mjs'
import { createMemoryAuthorityStore } from '../src/session-v2/authorityStore.mjs'
import { createSessionV2AuthorityHost } from '../src/session-v2/authorityHost.mjs'
import { createSessionV2LanGateway } from '../src/session-v2/lanGateway.mjs'
import { createAnaesthSessionAdapter } from '../src/session-v2/adapters/anaesth.mjs'
import { createAnaesthDeclarativeActionEvaluator } from '../src/session-v2/adapters/actionEffects.mjs'

const store = createMemoryAuthorityStore()
const authenticate = async secret => secret === 'INSTRUCTOR'
  ? { participantId: 'i', role: 'instructor' }
  : secret === 'CANDIDATE'
    ? { participantId: 'c', role: 'candidate' }
    : null
const adapter = createAnaesthSessionAdapter({
  initialPatient: { heartRate: 78, systolicPressure: 120, diastolicPressure: 70,
    spo2: 98, peripheralPerfusion: 1, anaestheticGases: { fiSevoPercent: 0 } },
  applyAction: createAnaesthDeclarativeActionEvaluator({ getDefinition: id =>
    id === 'propofol'
      ? { id, name: 'Propofol', kind: 'drug', setting: 'ana', candidate_access: 'allowed',
        short_press_action: 'momentary', effects: [{ id: 'h', target: 'anaesthesia.hypnoticEffect',
          operation: 'target', value: 0.8, onsetSeconds: 10, durationSeconds: 20, recoverySeconds: 60 }] }
      : null,
  }),
})
const gateway = createSessionV2LanGateway({
  authenticate,
  createRoom: async ({ sessionId }) => {
    const engine = new SessionEngineV2({ sessionId, mode: 'simulation', instructorId: 'i', adapter })
    engine.join({ participantId: 'c', role: 'candidate' })
    engine.start('i')
    const host = createSessionV2AuthorityHost({ store, adapter, authenticate })
    await host.create({ initialEngine: engine, credentials: 'INSTRUCTOR' })
    return { host }
  },
})
const http = createServer()
const wss = new WebSocketServer({ noServer: true })
http.on('upgrade', (req, socket, head) => {
  if (req.url !== '/loppjusim-v2') { socket.destroy(); return }
  wss.handleUpgrade(req, socket, head, ws => gateway.attach(ws))
})
http.listen(0, '127.0.0.1')
await once(http, 'listening')
const addr = http.address()
const url = `ws://127.0.0.1:${addr.port}/loppjusim-v2`
const sockets = []
function client() {
  const ws = new WebSocket(url)
  sockets.push(ws)
  const events = []
  const listeners = []
  ws.on('message', raw => {
    const packet = JSON.parse(String(raw))
    events.push(packet)
    for (const fn of [...listeners]) fn()
  })
  return {
    ws,
    async opened() { await once(ws, 'open') },
    send(message) { ws.send(JSON.stringify({ protocol: 2, ...message })) },
    async next(type, requestId) {
      const find = () => {
        const index = events.findIndex(e => e.type === type && (requestId === undefined || e.requestId === requestId))
        return index >= 0 ? events.splice(index, 1)[0] : null
      }
      const existing = find()
      if (existing) return existing
      return new Promise((resolve, reject) => {
        const done = () => {
          const msg = find()
          if (!msg) return
          clearTimeout(timer)
          listeners.splice(listeners.indexOf(done), 1)
          resolve(msg)
        }
        const timer = setTimeout(() => {
          listeners.splice(listeners.indexOf(done), 1)
          reject(Error(`Timed out for ${type}/${requestId}`))
        }, 2500)
        listeners.push(done)
      })
    },
  }
}
try {
  const instructor = client()
  await instructor.opened()
  instructor.send({ type: 'hello', sessionId: 'lan-integration', token: 'INSTRUCTOR', requestId: 'h1', role: 'candidate' })
  assert.equal((await instructor.next('welcome', 'h1')).snapshot.session.mode, 'simulation')
  const candidate = client()
  await candidate.opened()
  candidate.send({ type: 'hello', sessionId: 'lan-integration', token: 'CANDIDATE', requestId: 'h2',
    participantId: 'i', role: 'instructor' })
  const joined = await candidate.next('welcome', 'h2')
  assert.equal(joined.snapshot.runtimes[0].state.patient.heartRate, 78)
  const epoch = joined.snapshot.session.epoch
  candidate.send({ type: 'command', requestId: 'forbidden', command: { id: 'bad-patient', participantId: 'i',
    epoch, runtimeId: 'main', type: 'patient.parameter.set', payload: { path: 'heartRate', value: 220 } } })
  assert.equal((await candidate.next('receipt', 'forbidden')).receipt.accepted, false)
  candidate.send({ type: 'command', requestId: 'gas', command: { id: 'gas-1', participantId: 'i',
    epoch, runtimeId: 'main', type: 'anaesth.gas.set', payload: { fiSevoPercent: 2 } } })
  assert.equal((await candidate.next('receipt', 'gas')).receipt.accepted, true)
  assert.equal((await instructor.next('snapshot')).snapshot.runtimes[0].state.patient.anaestheticGases.fiSevoPercent, 2)
  candidate.send({ type: 'command', requestId: 'drug', command: { id: 'drug-1', epoch,
    runtimeId: 'main', type: 'action.invoke', payload: { actionId: 'propofol' } } })
  assert.equal((await candidate.next('receipt', 'drug')).receipt.accepted, true)
  instructor.send({ type: 'command', requestId: 'hr', command: { id: 'hr-1', epoch,
    runtimeId: 'main', type: 'patient.parameter.set', payload: { path: 'heartRate', value: 90 } } })
  assert.equal((await instructor.next('receipt', 'hr')).receipt.accepted, true)
  candidate.send({ type: 'command', requestId: 'drug-retry', command: { id: 'drug-1', epoch,
    runtimeId: 'main', type: 'action.invoke', payload: { actionId: 'propofol' } } })
  assert.equal((await candidate.next('receipt', 'drug-retry')).receipt.accepted, true)
  candidate.send({ type: 'resync', requestId: 'sync' })
  const canonical = (await candidate.next('snapshot', 'sync')).snapshot.runtimes[0].state
  assert.equal(canonical.patient.heartRate, 90)
  assert.equal(canonical.patient.anaestheticGases.fiSevoPercent, 2)
  assert.equal(canonical.actionRuntime.activeEffects.length, 1, 'duplicate dose applied only once')
  const rejectGuest = client()
  await rejectGuest.opened()
  rejectGuest.send({ type: 'hello', sessionId: 'lan-integration', token: 'wrong', requestId: 'bad' })
  assert.equal((await rejectGuest.next('error', 'bad')).reason, 'unauthenticated')
  candidate.ws.close()
  await once(candidate.ws, 'close')
  const reconnect = client()
  await reconnect.opened()
  reconnect.send({ type: 'hello', sessionId: 'lan-integration', token: 'CANDIDATE', requestId: 'reconnect' })
  assert.equal((await reconnect.next('welcome', 'reconnect')).snapshot.runtimes[0].state.actionRuntime.activeEffects.length, 1)
  console.log('Session v2 two-client LAN WebSocket integration regression passed')
} finally {
  gateway.close()
  for (const ws of sockets) if (ws.readyState !== WebSocket.CLOSED) ws.terminate()
  await new Promise(resolve => wss.close(resolve))
  await new Promise(resolve => http.close(resolve))
}
