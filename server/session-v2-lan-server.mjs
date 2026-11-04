/**
 * Standalone EXPLICITLY OPT-IN experimental Session v2 LAN WebSocket host.
 * This is separate from the legacy /eduvent-session server and never serves
 * production simulator state. Demo room: one Anaesth instructor + candidate.
 *
 * WARNING: plain ws:// transmits credentials without TLS. Use only on a
 * trusted isolated teaching/test LAN; never expose the port to the Internet.
 *
 * Usage:
 * LOPPJUSIM_V2_LAN_EXPERIMENTAL=1
 * LOPPJUSIM_V2_INSTRUCTOR_TOKEN=<random secret, 32+ chars>
 * LOPPJUSIM_V2_CANDIDATE_TOKEN=<different random secret, 32+ chars>
 * node server/session-v2-lan-server.mjs
 */
import { createServer } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { WebSocketServer } from 'ws'
import { SessionEngineV2 } from '../src/session-v2/engine.mjs'
import { createNodeFileAuthorityStore } from './session-v2-file-authority-store.mjs'
import { createSessionV2AuthorityHost } from '../src/session-v2/authorityHost.mjs'
import { createAnaesthSessionAdapter } from '../src/session-v2/adapters/anaesth.mjs'
import { createSessionV2LanGateway } from '../src/session-v2/lanGateway.mjs'

const instructorToken = process.env.LOPPJUSIM_V2_INSTRUCTOR_TOKEN ?? ''
const candidateToken = process.env.LOPPJUSIM_V2_CANDIDATE_TOKEN ?? ''
const enabled = process.env.LOPPJUSIM_V2_LAN_EXPERIMENTAL === '1'
if (!enabled || instructorToken.length < 32 || candidateToken.length < 32 ||
    instructorToken === candidateToken) {
  throw Error('Experimental v2 LAN requires explicit opt-in and two different 32+ character secrets.')
}
const same = (actual, expected) => {
  if (typeof actual !== 'string') return false
  const a = Buffer.from(actual), b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
const authenticate = async token => {
  if (same(token, instructorToken)) return { participantId: 'instructor', role: 'instructor' }
  if (same(token, candidateToken)) return { participantId: 'candidate', role: 'candidate' }
  return null
}
const store = createNodeFileAuthorityStore({ filePath: process.env.LOPPJUSIM_V2_DATA_FILE || './.local/session-v2-authority.json' })
const initialPatient = {
  heartRate: 78, rhythm: 'sinus', systolicPressure: 122, diastolicPressure: 68,
  spo2: 98, peripheralPerfusion: 1, temperatureC: 37,
  respiratory: { respiratoryRate: 12, fio2: 0.21, peepCmH2O: 0 },
  anaestheticGases: { fiSevoPercent: 0 },
}
const gateway = createSessionV2LanGateway({
  authenticate,
  createRoom: async ({ sessionId }) => {
    const adapter = createAnaesthSessionAdapter({ initialPatient })
    const engine = new SessionEngineV2({ sessionId, mode: 'simulation', instructorId: 'instructor', adapter })
    engine.join({ participantId: 'candidate', role: 'candidate' })
    engine.start('instructor')
    const host = createSessionV2AuthorityHost({ store, adapter, authenticate })
    const existing = await store.load(sessionId)
    if (existing) {
      await host.takeover({ sessionId, credentials: instructorToken })
    } else {
      await host.create({ initialEngine: engine, credentials: instructorToken })
    }
    // Renew only from trusted server context. No client can extend a lease.
    // Failure stops authorityHost; clients are shown an error on their next command.
    const renewal = setInterval(() => {
      void host.renew({ credentials: instructorToken }).catch(() => clearInterval(renewal))
    }, 5000)
    renewal.unref?.()
    return { host }
  },
})
const port = Number(process.env.LOPPJUSIM_V2_LAN_PORT || 4174)
const bind = process.env.LOPPJUSIM_V2_LAN_BIND || '127.0.0.1'
const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify({ ok: true, experimental: true, protocol: 2, rooms: gateway.roomCount }))
  } else { res.writeHead(404).end() }
})
const sockets = new WebSocketServer({ noServer: true, maxPayload: 65536 })
server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url ?? '/', 'http://localhost').pathname !== '/loppjusim-v2') {
    socket.destroy(); return
  }
  sockets.handleUpgrade(req, socket, head, ws => {
    // handleUpgrade() does not emit the connection event automatically.
    // Register liveness before handing the socket to the v2 gateway.
    ws.isAlive = true
    ws.on('pong', () => { ws.isAlive = true })
    gateway.attach(ws)
  })
})
const heartbeat = setInterval(() => {
  for (const socket of sockets.clients) {
    if (socket.isAlive === false) { socket.terminate(); continue }
    socket.isAlive = false
    socket.ping()
  }
}, 15000)
heartbeat.unref?.()
server.listen(port, bind, () => {
  console.log(`Experimental Session v2 LAN gateway on ws://${bind}:${port}/loppjusim-v2`)
  console.log('Anaesth demo model only; file-backed checkpoints are enabled. Production actions/scenarios are NOT connected.')
  if (bind !== '127.0.0.1' && bind !== '::1') {
    console.warn('WARNING: credentials traverse unencrypted ws://. Use only on an isolated, trusted LAN.')
  }
})
const shutdown = () => {
  clearInterval(heartbeat)
  gateway.close()
  sockets.close()
  server.close()
}
process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
