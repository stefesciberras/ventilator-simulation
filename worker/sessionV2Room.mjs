/**
 * Experimental Cloudflare Durable Object authority for Session v2.
 * One DO per session: serial command reduction, checkpoint-before-receipt,
 * and a single canonical runtime. No dedicated Node server is required.
 *
 * Identity is verified at the Worker boundary and passed as internal headers
 * on stub.fetch(); browser-supplied participantId/role is never authoritative.
 */
import { SessionEngineV2 } from '../src/session-v2/engine.mjs'
import { createAnaesthSessionAdapter } from '../src/session-v2/adapters/anaesth.mjs'
import { projectAnaesthV2Monitor, resolveV2ActionNumber } from '../src/session-v2/adapters/anaesthPilot.mjs'
import { loadAnaesthV2Library, legacyAnaesthV2Library, validatePinnedAnaesthV2Library,
  anaesthV2EvaluatorFromLibrary, publicAnaesthV2Library } from '../src/session-v2/adapters/anaesthLibrary.mjs'

const MAX_BYTES = 65536
const CLOCK_INTERVAL_MS = 1000
const CLOCK_SPEEDS = new Set([0.5, 1, 2, 4])
const defaultClock = () => ({ running: false, speed: 1 })
const validClock = data => data && typeof data === 'object' &&
  typeof data.running === 'boolean' && CLOCK_SPEEDS.has(data.speed)

const VALID_ID = /^[a-zA-Z0-9_-]{3,80}$/
const VALID_CMD = /^[a-zA-Z0-9._:-]{1,128}$/
const TYPES = new Set(['patient.parameter.set', 'device.parameter.set', 'anaesth.gas.set', 'action.invoke', 'reset', 'tick', 'end'])
const demoPatient = {
  heartRate: 78, rhythm: 'sinus', systolicPressure: 122, diastolicPressure: 68,
  spo2: 98, peripheralPerfusion: 1, temperatureC: 37,
  respiratory: { respiratoryRate: 12, fio2: 0.21, peepCmH2O: 0 },
  anaestheticGases: { fiSevoPercent: 0 },
}
const adapterFor = library => createAnaesthSessionAdapter({ initialPatient: demoPatient,
  applyAction: anaesthV2EvaluatorFromLibrary(library) })
const snapshotForPreview = snapshot => ({ ...snapshot, runtimes: snapshot.runtimes.map(runtime => ({
  ...runtime, state: { ...runtime.state,
    monitorProjection: runtime.state?.patient && runtime.state?.actionRuntime
      ? projectAnaesthV2Monitor(runtime.state) : null,
    // Explicit read-only pharmacodynamic indicator: v1 monitoring surfaces
    // do not yet offer a synchronized TOF/NMB display in the v2 preview.
    effectIndicators: runtime.state?.actionRuntime ? {
      neuromuscularBlockPercent: Math.round(100 * Math.max(0, Math.min(1,
        resolveV2ActionNumber(runtime.state.actionRuntime, 'neuromuscular.block', 0)))),
    } : null,
  },
})) })
const packet = (type, extra = {}) => JSON.stringify({
  protocol: 2, type, ...extra,
  ...(extra.snapshot ? { snapshot: snapshotForPreview(extra.snapshot) } : {}),
})

export class SessionV2Room {
  constructor(state, env) {
    this.state = state
    this.env = env
    this.engine = null
    this.adapter = null
    this.actionLibrary = null
    this.sessionId = null
    this.sockets = new Map()
    this.queue = Promise.resolve()
    this.clock = defaultClock()
    this.loaded = this.state.blockConcurrencyWhile(async () => {
      const checkpoint = await this.state.storage.get('checkpoint')
      const persistedClock = await this.state.storage.get('clockControl')
      this.clock = validClock(persistedClock) ? persistedClock : defaultClock()
      // Restored engine fences prior epochs and is recovering. Pause until a
      // verified instructor reclaims authority; do not replay wall-time gaps.
      if (checkpoint && checkpoint.snapshot.session.status !== 'ended' && this.clock.running) {
        this.clock = { ...this.clock, running: false }
        await this.state.storage.put('clockControl', this.clock)
      }
      if (checkpoint) {
        // Legacy sessions created before the pinned-catalogue schema must
        // retain the exact original three pilot drugs on recovery.
        const persistedLibrary = await this.state.storage.get('actionLibrary')
        this.actionLibrary = persistedLibrary
          ? validatePinnedAnaesthV2Library(persistedLibrary) : legacyAnaesthV2Library()
        this.adapter = adapterFor(this.actionLibrary)
        this.engine = SessionEngineV2.fromCheckpoint({ checkpoint, adapter: this.adapter })
        this.sessionId = this.engine.snapshot.session.id
      }
    })
  }
  persist = async engine => {
    await this.state.storage.put('checkpoint', engine.exportCheckpoint())
    this.engine = engine
  }
  send = (socket, type, extra = {}) => {
    try { socket.send(packet(type, { ...extra,
      ...(['welcome','snapshot','clock-receipt'].includes(type) ? { clock: this.clock } : {}),
      ...(extra.snapshot && this.actionLibrary
        ? { actionLibrary: publicAnaesthV2Library(this.actionLibrary) } : {}),
    })) } catch { this.sockets.delete(socket) }
  }
  broadcast = () => {
    if (!this.engine) return
    for (const socket of this.sockets.keys()) this.send(socket, 'snapshot', { snapshot: this.engine.snapshot })
  }
  async scheduleClock() {
    if (!this.clock.running) return
    if (typeof this.state.storage.setAlarm !== 'function') throw Error('durable-object-alarms-unavailable')
    await this.state.storage.setAlarm(Date.now() + CLOCK_INTERVAL_MS)
  }
  async setClock(next) {
    if (!validClock(next)) throw Error('invalid-clock-control')
    await this.state.storage.put('clockControl', next)
    this.clock = next
    if (next.running) await this.scheduleClock()
    else if (typeof this.state.storage.deleteAlarm === 'function') await this.state.storage.deleteAlarm()
  }
  async alarm() {
    await this.loaded
    return this.serialize(async () => {
      const session = this.engine?.snapshot.session
      if (!this.clock.running || !session || session.status !== 'active') {
        if (this.clock.running) await this.setClock({ ...this.clock, running: false })
        return
      }
      const staged = this.engine.fork()
      const count = this.clock.speed >= 1 ? this.clock.speed : 1
      const deltaMs = this.clock.speed === 0.5 ? 500 : 1000
      for (let index = 0; index < count; index++) {
        const current = staged.snapshot.session
        const receipt = staged.submit({ id: `clock:${current.epoch}:${current.clockMs}:${index}`,
          participantId: current.authorityId, runtimeId: 'main',
          epoch: current.epoch, type: 'tick', payload: { deltaMs } })
        if (!receipt.accepted) {
          await this.setClock({ ...this.clock, running: false })
          return
        }
      }
      // Checkpoint before broadcasting the new simulated time.
      await this.persist(staged)
      this.broadcast()
      await this.scheduleClock()
    })
  }
  serialize = fn => {
    const next = this.queue.then(fn)
    this.queue = next.catch(() => undefined)
    return next
  }
  async fetch(request) {
    await this.loaded
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Upgrade required', { status: 426 })
    const role = request.headers.get('x-v2-verified-role')
    const sessionId = request.headers.get('x-v2-session-id')
    if (!VALID_ID.test(sessionId ?? '') || (role !== 'instructor' && role !== 'candidate')) {
      return new Response('Unauthorized', { status: 403 })
    }
    if (this.sessionId && this.sessionId !== sessionId) return new Response('Wrong session', { status: 409 })
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    server.accept()
    const identity = role === 'instructor' ? 'instructor' : 'candidate'
    // Join/restore is queued before allowing any commands.
    try {
      await this.serialize(async () => {
        if (!this.engine) {
          if (role !== 'instructor') throw Error('instructor-required')
          // Fail closed if a configured Supabase catalogue cannot be fetched
          // or validated; never silently swap in demo drug definitions.
          const library = await loadAnaesthV2Library(this.env)
          const activeAdapter = adapterFor(library)
          const created = new SessionEngineV2({
            sessionId, mode: 'simulation', instructorId: 'instructor', adapter: activeAdapter,
          })
          created.join({ participantId: 'candidate', role: 'candidate' })
          created.start('instructor')
          // Pin definition set and initial checkpoint together; a new
          // deployment or Supabase edit cannot redefine active-session drugs.
          await this.state.storage.put({ actionLibrary: library,
            checkpoint: created.exportCheckpoint(), clockControl: defaultClock() })
          this.clock = defaultClock()
          this.actionLibrary = library
          this.adapter = activeAdapter
          this.engine = created
          this.sessionId = sessionId
        } else {
          const current = this.engine.snapshot
          if (current.session.status === 'ended') throw Error('session-ended')
          if (identity === 'instructor') {
            // After DO reconstruction, fenced epoch is persisted on the first
            // authenticated instructor reconnect, not merely on object creation.
            if (current.session.status === 'recovering' ||
                !current.participants.find(p => p.id === 'instructor')?.connected) {
              const staged = this.engine.fork()
              staged.recover('instructor')
              await this.persist(staged)
            }
          } else if (!current.participants.find(p => p.id === 'candidate')?.connected) {
            const staged = this.engine.fork()
            staged.recover('candidate')
            await this.persist(staged)
          }
        }
      })
    } catch {
      server.close(1008, 'Session unavailable')
      return new Response('Session unavailable', { status: 409 })
    }
    this.sockets.set(server, identity)
    this.send(server, 'welcome', { requestId: 'hello', role: identity, snapshot: this.engine.snapshot })
    server.addEventListener('message', event => {
      void this.serialize(async () => {
        let msg
        try {
          const raw = String(event.data)
          if (raw.length > MAX_BYTES) throw Error('too-large')
          msg = JSON.parse(raw)
          if (msg?.protocol !== 2 || !msg || typeof msg !== 'object') throw Error('invalid')
        } catch { this.send(server, 'error', { reason: 'invalid-message' }); return }
        const requestId = typeof msg.requestId === 'string' ? msg.requestId.slice(0, 128) : null
        if (msg.type === 'resync') {
          this.send(server, 'snapshot', { requestId, snapshot: this.engine.snapshot })
          return
        }
        if (msg.type === 'clock.control') {
          if (identity !== 'instructor') {
            this.send(server, 'error', { requestId, reason: 'forbidden-clock-control' })
            return
          }
          if (this.engine.snapshot.session.status !== 'active' ||
              typeof msg.running !== 'boolean' || !CLOCK_SPEEDS.has(msg.speed)) {
            this.send(server, 'error', { requestId, reason: 'invalid-clock-control' })
            return
          }
          try {
            await this.setClock({ running: msg.running, speed: msg.speed })
            this.send(server, 'clock-receipt', { requestId, accepted: true })
            this.broadcast()
          } catch {
            this.send(server, 'error', { requestId, reason: 'clock-unavailable' })
          }
          return
        }
        if (msg.type !== 'command' || !msg.command || !VALID_CMD.test(msg.command.id) ||
            !TYPES.has(msg.command.type) || msg.command.runtimeId !== 'main' ||
            !Number.isSafeInteger(msg.command.epoch)) {
          this.send(server, 'error', { requestId, reason: 'invalid-command' }); return
        }
        if (this.clock.running && msg.command.type === 'tick') {
          this.send(server, 'error', { requestId, reason: 'clock-already-running' })
          return
        }
        const before = this.engine.snapshot.session.revision
        const staged = this.engine.fork()
        const receipt = staged.submit({
          id: msg.command.id,
          type: msg.command.type,
          epoch: msg.command.epoch,
          runtimeId: 'main',
          participantId: identity,
          payload: msg.command.payload ?? {},
        })
        if (receipt.accepted && staged.snapshot.session.revision > before) {
          try {
            if (msg.command.type === 'reset' || msg.command.type === 'end') {
              // Reset/end cannot leave a background alarm advancing old effects.
              await this.state.storage.put({
                checkpoint: staged.exportCheckpoint(),
                clockControl: { ...this.clock, running: false },
              })
              this.engine = staged
              this.clock = { ...this.clock, running: false }
              if (typeof this.state.storage.deleteAlarm === 'function') await this.state.storage.deleteAlarm()
            } else await this.persist(staged)
          } catch {
            this.send(server, 'error', { requestId, reason: 'checkpoint-failed' })
            return
          }
        }
        this.send(server, 'receipt', { requestId, receipt })
        if (receipt.accepted && staged.snapshot.session.revision > before) this.broadcast()
      }).catch(() => this.send(server, 'error', { reason: 'authority-error' }))
    })
    const drop = () => { this.sockets.delete(server) }
    server.addEventListener('close', drop)
    server.addEventListener('error', drop)
    // Echo only the public negotiated subprotocol, not the credential.
    const protocol = request.headers.get('x-v2-selected-protocol')
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: protocol === 'loppjusim-v2'
        ? { 'Sec-WebSocket-Protocol': 'loppjusim-v2' }
        : {},
    })
  }
}
